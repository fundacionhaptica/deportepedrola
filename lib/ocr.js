'use strict';

const fs   = require('fs');
const path = require('path');
const { Blob } = require('node:buffer');

const KIMI_BASE    = 'https://api.moonshot.cn/v1';
const MODEL_VISION = 'moonshot-v1-8k-vision-preview';
const MODEL_TEXT   = 'moonshot-v1-8k';

const PROMPT = `Extrae los datos de esta factura y devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, con esta estructura:
{
  "proveedor": "nombre del emisor",
  "nif_proveedor": "NIF o CIF del emisor, o null",
  "numero_factura": "número de factura, o null",
  "fecha_factura": "fecha en formato YYYY-MM-DD, o null",
  "concepto": "descripción breve del bien o servicio",
  "base_imponible": valor numérico sin símbolo, o null,
  "iva_porcentaje": porcentaje de IVA como número (ej. 21), o null,
  "iva_importe": importe del IVA como número, o null,
  "importe_total": importe total como número, o null
}`;

function apiKey() {
  const k = process.env.MOONSHOT_API_KEY;
  if (!k) throw new Error('MOONSHOT_API_KEY no configurada');
  return k;
}

async function kimiChat(model, messages) {
  const res = await fetch(`${KIMI_BASE}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body:    JSON.stringify({ model, messages, max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`Kimi API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Sube un PDF a Kimi Files API y devuelve el texto extraído
async function extraerTextoPdf(rutaArchivo, nombreArchivo) {
  const datos   = fs.readFileSync(rutaArchivo);
  const form    = new FormData();
  form.append('file', new Blob([datos], { type: 'application/pdf' }), nombreArchivo);
  form.append('purpose', 'file-extract');

  const uploadRes = await fetch(`${KIMI_BASE}/files`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body:    form,
  });
  if (!uploadRes.ok) throw new Error(`Kimi Files upload ${uploadRes.status}: ${await uploadRes.text()}`);
  const { id: fileId } = await uploadRes.json();

  const contentRes = await fetch(`${KIMI_BASE}/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!contentRes.ok) throw new Error(`Kimi Files content ${contentRes.status}`);
  const { content: textoPdf } = await contentRes.json();

  // Limpiar el fichero remoto
  await fetch(`${KIMI_BASE}/files/${fileId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${apiKey()}` },
  }).catch(() => {});

  return textoPdf;
}

async function extraerDatosFactura(rutaArchivo, mimeType) {
  const esPdf = mimeType === 'application/pdf';
  let respuesta;

  if (esPdf) {
    const texto = await extraerTextoPdf(rutaArchivo, path.basename(rutaArchivo));
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

  // Guardar el JSON íntegro sin transformar — ver CLAUDE.md regla 4
  const ocrRawJson = respuesta;

  const texto  = respuesta.choices?.[0]?.message?.content || '{}';
  const match  = texto.match(/\{[\s\S]*\}/);
  let extraido = {};
  try { extraido = JSON.parse(match ? match[0] : '{}'); } catch (_) {}

  return { ocrRawJson, extraido };
}

module.exports = { extraerDatosFactura };
