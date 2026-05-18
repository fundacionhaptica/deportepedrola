'use strict';

const fs   = require('fs');
const path = require('path');
const { Blob } = require('node:buffer');

const KIMI_BASE    = 'https://api.moonshot.cn/v1';
const MODEL_VISION = 'moonshot-v1-8k-vision-preview';
const MODEL_TEXT   = 'moonshot-v1-8k';

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta';

const PROMPT = `Extrae los datos de este documento y devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, con esta estructura exacta:
{
  "tipo": clasifica el tipo de documento eligiendo UNA de estas opciones: "Factura" si es una factura con IVA, "Recibo" si es un recibo o ticket, "Remesa" si es una remesa o extracto bancario, "Ingreso" si es un justificante de ingreso. Si no puedes determinarlo devuelve null,
  "proveedor": "nombre del emisor o proveedor",
  "nif_proveedor": "NIF o CIF del emisor, o null",
  "numero_factura": "número de factura o referencia, o null",
  "fecha_factura": "fecha en formato YYYY-MM-DD, o null",
  "concepto": elige la categoría más apropiada entre estas opciones: "Federación", "autobuses", "hotel", "Fichas", "arbitrajes", "ropa", "gestoría", "sanciones". Si el documento no encaja en ninguna, escribe una descripción breve del bien o servicio,
  "base_imponible": valor numérico sin símbolo de moneda, o null,
  "iva_porcentaje": porcentaje de IVA como número (ej. 21), o null,
  "iva_importe": importe del IVA como número, o null,
  "importe_total": importe total como número, o null
}`;

// ── Kimi ──────────────────────────────────────────────────────────────────────

function kimiKey() {
  const k = process.env.MOONSHOT_API_KEY;
  if (!k) throw new Error('MOONSHOT_API_KEY no configurada');
  return k;
}

async function kimiChat(model, messages) {
  const res = await fetch(`${KIMI_BASE}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kimiKey()}` },
    body:    JSON.stringify({ model, messages, max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`Kimi API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function extraerTextoPdfKimi(rutaArchivo, nombreArchivo) {
  const datos = fs.readFileSync(rutaArchivo);
  const form  = new FormData();
  form.append('file', new Blob([datos], { type: 'application/pdf' }), nombreArchivo);
  form.append('purpose', 'file-extract');

  const uploadRes = await fetch(`${KIMI_BASE}/files`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${kimiKey()}` },
    body:    form,
  });
  if (!uploadRes.ok) throw new Error(`Kimi Files upload ${uploadRes.status}: ${await uploadRes.text()}`);
  const { id: fileId } = await uploadRes.json();

  const contentRes = await fetch(`${KIMI_BASE}/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${kimiKey()}` },
  });
  if (!contentRes.ok) throw new Error(`Kimi Files content ${contentRes.status}`);
  const { content: textoPdf } = await contentRes.json();

  await fetch(`${KIMI_BASE}/files/${fileId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${kimiKey()}` },
  }).catch(() => {});

  return textoPdf;
}

async function extraerConKimi(rutaArchivo, mimeType) {
  const esPdf = mimeType === 'application/pdf';
  let respuesta;

  if (esPdf) {
    const texto = await extraerTextoPdfKimi(rutaArchivo, path.basename(rutaArchivo));
    respuesta = await kimiChat(MODEL_TEXT, [
      { role: 'user', content: `${PROMPT}\n\nContenido de la factura:\n${texto}` },
    ]);
  } else {
    const b64 = fs.readFileSync(rutaArchivo).toString('base64');
    respuesta = await kimiChat(MODEL_VISION, [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${b64}` } },
        { type: 'text', text: PROMPT },
      ]},
    ]);
  }

  const texto = respuesta.choices?.[0]?.message?.content || '{}';
  const match = texto.match(/\{[\s\S]*\}/);
  let extraido = {};
  try { extraido = JSON.parse(match ? match[0] : '{}'); } catch (_) {}
  return { ocrRawJson: respuesta, extraido };
}

// ── Gemini ────────────────────────────────────────────────────────────────────

function geminiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY no configurada');
  return k;
}

function geminiModel() {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

async function extraerConGemini(rutaArchivo, mimeType) {
  const b64      = fs.readFileSync(rutaArchivo).toString('base64');
  const model    = geminiModel();
  const url      = `${GEMINI_BASE}/models/${model}:generateContent?key=${geminiKey()}`;

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: b64 } },
        { text: PROMPT },
      ],
    }],
    generationConfig: { maxOutputTokens: 1024 },
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const respuesta = await res.json();

  const texto = respuesta.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const match = texto.match(/\{[\s\S]*\}/);
  let extraido = {};
  try { extraido = JSON.parse(match ? match[0] : '{}'); } catch (_) {}
  return { ocrRawJson: respuesta, extraido };
}

// ── Punto de entrada con fallback ─────────────────────────────────────────────

async function extraerDatosFactura(rutaArchivo, mimeType) {
  // Intentar con Kimi primero
  if (process.env.MOONSHOT_API_KEY) {
    try {
      const resultado = await extraerConKimi(rutaArchivo, mimeType);
      return { ...resultado, proveedor_ocr: 'Kimi', ocr_fallback: false };
    } catch (e) {
      console.warn(`[ocr] Kimi falló (${e.message}), intentando con Gemini...`);
      // Fallback a Gemini si está configurado
      if (process.env.GEMINI_API_KEY) {
        const resultado = await extraerConGemini(rutaArchivo, mimeType);
        return { ...resultado, proveedor_ocr: 'Gemini', ocr_fallback: true, ocr_fallback_motivo: e.message };
      }
      throw e;
    }
  }

  // Solo Gemini configurado
  if (process.env.GEMINI_API_KEY) {
    const resultado = await extraerConGemini(rutaArchivo, mimeType);
    return { ...resultado, proveedor_ocr: 'Gemini', ocr_fallback: false };
  }

  throw new Error('No hay ninguna API de OCR configurada (MOONSHOT_API_KEY o GEMINI_API_KEY)');
}

module.exports = { extraerDatosFactura };
