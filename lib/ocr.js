'use strict';

// lib/ocr.js — Extracción de datos de facturas con Gemini (Google) vision.
//
// Variables de entorno en .env:
//   GEMINI_API_KEY   (principal — gratis en ai.google.dev)
//   GEMINI_MODEL     (opcional, por defecto gemini-1.5-flash)
//   MOONSHOT_API_KEY (fallback secundario — Kimi)
//   KIMI_MODEL       (opcional)
//
// Flujo: Gemini -> Kimi -> vision-router -> Error

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const KIMI_API_URL   = 'https://api.moonshot.ai/v1/chat/completions';

function isGeminiConfigured()       { return Boolean(process.env.GEMINI_API_KEY); }
function isKimiConfigured()         { return Boolean(process.env.MOONSHOT_API_KEY); }
function isVisionRouterConfigured() { return Boolean(process.env.OCR_API_URL && process.env.VISION_INTERNAL_API_KEY); }

// ── Proveedores conocidos del club ──────────────────────────────────────────────

const PROVEEDORES_CONOCIDOS = [
  'Ayuntamiento de Pedrola',
  'Centro de Asesoramiento y Gestión S.L.',
  'Club Deportivo Boquineni',
  'Club Patín Nueva Era',
  'Comité Aragonés de Árbitros de Fútbol',
  'Cristobal Lopez-Zaro SL (Aguinaldos Aragón)',
  'Cromos Base Aragón SL',
  'Delegacion De La Agencia Tributaria M200',
  'Delegacion De La Agencia Tributaria M202',
  'Federación Aragonesa de Atletismo',
  'Federación Aragonesa de Baloncesto',
  'Federación Aragonesa de Fútbol - Arbitros FS',
  'Federación Aragonesa de Fútbol - Arbitros Fútbol',
  'Federación Aragonesa de Fútbol - Comité Técnico de Entrenadores',
  'Federación Aragonesa de Karate y D.A.',
  'Federación Aragonesa de Kickboxing',
  'Federación Aragonesa de Patinaje',
  'Federacion Aragonesa De Voleibol',
  'Federacion Espanola Patinaje',
  'FUJI SPORT, S.L. (FUJIMAE)',
  'GOMEZ LOPEZ, ESTEBAN',
  'Gobierno de Aragón - Direccion General del Deporte',
  'Hospital Viamed Montecanal',
  'IberCaja',
  'IberCaja (TPV)',
  'IberCaja (notificacion)',
  'Iñaki Abad Mayoral',
  'Jaime Ruiz Herrero',
  'Joaquim Mendiola Sanchez',
  'Jose Antonio Causin Fontan',
  'Laredo Show Club Patin',
  'Lcm Skates',
  'Linde Y Wiemann Zaragoza S L',
  'Main-Draw Tennis Pro',
  'Mecanizados Veraxa S L',
  'Mupresfe Aragon',
  'Mutualidad de Futbolistas Españoles (Delegación Aragonesa)',
  'Nerea Sanz Leon',
  'PINA-BUS, S.L.',
  'Porteromania SL',
  'Real Federación Aragonesa de Fútbol',
  'Santiago Alfonso Rodriguez',
  'Sports Emotion Hub S.L.',
  'Super 7 League Aragón',
  'Tagoya Sport S L',
  'Zurich Seguros',
  'CP Magallon',
  'Iñaki Abad Mayoral',
];

// ── Prompt ────────────────────────────────────────────────────────────────────

const PROMPT_BASE = `Eres un asistente especializado en extraer datos de facturas, recibos y justificantes del Club Deportivo Elemental Deporte Pedrola (Zaragoza).

Devuelve EXCLUSIVAMENTE un JSON con esta forma (sin texto adicional, sin markdown, sin comentarios):

{
  "tipo": "...",
  "proveedor_nombre": "...",
  "proveedor_cif": "...",
  "numero_factura": "...",
  "fecha_factura": "YYYY-MM-DD",
  "base_imponible": 0.00,
  "tipo_iva_pct": 21,
  "importe_iva": 0.00,
  "total_factura": 0.00,
  "deporte": "...",
  "equipo_categoria": "...",
  "concepto": "...",
  "notas": ""
}

== TIPOS DE DOCUMENTO (usar exactamente uno de estos) ==
- "factura_recibo": facturas, recibos, liquidaciones, recibos de árbitros, licencias, matrículas, seguros, cualquier pago documentado
- "justificante_bancario": transferencia o pago bancario del club a un tercero (DEPORTE PEDROLA es el ORDENANTE)
- "gasto_bancario": comisión o cargo bancario de IberCaja (TPV, notificación, mantenimiento, etc.)
- "ingreso_cobro": ingreso o cobro recibido por el club (subvención, cuota, donación, Bizum recibido, abono bancario)
- "notificacion_otros": notificación, información o documento sin importe económico

== REGLA DE SIGNO (IMPORTANTE) ==
- GASTOS (el club paga): total_factura, base_imponible e importe_iva en NEGATIVO.
  Aplica a: factura_recibo, justificante_bancario, gasto_bancario.
- INGRESOS (el club cobra): todos los importes en POSITIVO.
  Aplica a: ingreso_cobro.
- Si dudas, los gastos son negativos.

== DEPORTE ==
Usa exactamente uno de: Fútbol | Fútbol Sala | Baloncesto | Patinaje | Kickboxing | Kenpo | Atletismo | Trail | Voleibol | Padel | Múltiple | JJEE | Club
Si no puedes determinarlo con seguridad, usa "Club".

== EQUIPO / CATEGORÍA ==
Usa exactamente uno de: Escuelas | Prebenjamín | Benjamín | Alevín | Infantil | Cadete | Juvenil | Junior | Senior | Veteranos | Femenino | Masculino | JJEE | Club | Múltiple
Si no puedes determinarlo, deja null.

== CONCEPTO ==
Usa exactamente uno de: Arbitraje | Autobuses | Federación | Material | Premios | Gestoría | Seguros | Fichas | Inscripciones | Subvención | Comisión bancaria | Otros

== PROVEEDOR ==
Intenta hacer coincidir el proveedor con esta lista de proveedores conocidos del club:
${PROVEEDORES_CONOCIDOS.join(' | ')}
Si el nombre en el documento es claramente el mismo proveedor con una variante de escritura (mayúsculas, tildes, abreviatura), usa el nombre canónico de la lista.
Si es un proveedor nuevo que no aparece en la lista, escríbelo tal como figura en el documento.
NUNCA pongas "DEPORTE PEDROLA" o "Club Deportivo Elemental Deporte Pedrola" como proveedor — es el propio club, no el proveedor.
Para transferencias bancarias: proveedor_nombre = quien RECIBE el dinero (beneficiario), nunca quien lo envía.

== OTRAS REGLAS ==
- Si un campo no se ve claro, ponlo null. NO inventes.
- Importes siempre con punto decimal (5316.30, no 5.316,30).
- Las fechas SIEMPRE en YYYY-MM-DD.
- Para justificantes IberCaja: busca el importe en "Importe", "EUR" o el valor en negrita. NO devuelvas 0 — si no lo ves, devuelve null.
- Los recibos de árbitros, licencias federativas y seguros son tipo "factura_recibo".
- ABONO bancario = ingreso_cobro (positivo). CARGO/PAGO = justificante_bancario o gasto_bancario (negativo).`;

function buildPrompt(ejemplos = []) {
  if (!ejemplos || ejemplos.length === 0) return PROMPT_BASE;
  const exStr = ejemplos.slice(0, 6).map((e, i) =>
    `Ejemplo ${i + 1}: ${JSON.stringify({
      tipo:             e.tipo,
      proveedor_nombre: e.proveedor,
      proveedor_cif:    e.nif_proveedor,
      numero_factura:   e.numero_factura,
      fecha_factura:    e.fecha_factura ? String(e.fecha_factura).slice(0, 10) : null,
      base_imponible:   e.base_imponible,
      tipo_iva_pct:     e.iva_porcentaje,
      importe_iva:      e.iva_importe,
      total_factura:    e.importe,
    })}`
  ).join('\n');
  return PROMPT_BASE + `\n\n== EJEMPLOS CONFIRMADOS DEL CLUB (referencia de formato, signos y proveedores) ==\n${exStr}`;
}

// ── Mapeo de respuesta ────────────────────────────────────────────────────────

function mapearRespuesta(json) {
  if (!json || typeof json !== 'object') return {};
  return {
    tipo:             json.tipo                                                  || null,
    proveedor:        json.proveedor_nombre                                      || null,
    nif_proveedor:    json.proveedor_cif                                         || null,
    numero_factura:   json.numero_factura                                        || null,
    fecha_factura:    json.fecha_factura                                         || null,
    concepto:         json.concepto                                              || null,
    deporte:          json.deporte                                               || null,
    equipo_categoria: json.equipo_categoria                                      || null,
    base_imponible:   (json.base_imponible  === 0 ? null : json.base_imponible)  ?? null,
    iva_porcentaje:   json.tipo_iva_pct                                          ?? null,
    iva_importe:      (json.importe_iva     === 0 ? null : json.importe_iva)     ?? null,
    importe_total:    (json.total_factura   === 0 ? null : json.total_factura)   ?? null,
  };
}

function parsearJson(content) {
  try { return JSON.parse(content); } catch (_) {}
  const m = content.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch (_) {}
  throw new Error(`Respuesta no-JSON: ${content.slice(0, 200)}`);
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function extraerConGemini(rutaArchivo, mimeType, ejemplos = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model  = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const prompt = buildPrompt(ejemplos);

  const isPdf = mimeType === 'application/pdf' || rutaArchivo.toLowerCase().endsWith('.pdf');
  const efectiveMime = isPdf ? 'application/pdf' : (mimeType || 'image/jpeg');

  const base64 = fs.readFileSync(rutaArchivo).toString('base64');

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: efectiveMime, data: base64 } },
        { text: prompt },
      ],
    }],
    generationConfig: { response_mime_type: 'application/json', temperature: 0.1 },
  };

  const res = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  const payload = await res.json();
  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini: respuesta sin content');

  const parsed = parsearJson(content);
  return {
    ocrRawJson: { status: 'ok', model, gemini_raw: payload, parsed },
    extraido:   mapearRespuesta(parsed),
  };
}

// ── Kimi (fallback) ───────────────────────────────────────────────────────────

function pdfAPng(rutaPdf) {
  const tmp  = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
  const base = path.join(tmp, 'page');
  execFileSync('pdftoppm', ['-png', '-r', '250', '-f', '1', '-l', '1', rutaPdf, base], { stdio: 'ignore' });
  const files = fs.readdirSync(tmp).filter(f => f.endsWith('.png'));
  if (!files.length) throw new Error('pdftoppm no generó PNG');
  return path.join(tmp, files[0]);
}

async function extraerConKimi(rutaArchivo, mimeType, ejemplos = []) {
  const prompt = buildPrompt(ejemplos);
  let cleanup = null;
  let imageMime = 'image/png';
  let imageBuf;

  const isPdf = mimeType === 'application/pdf' || rutaArchivo.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const pngPath = pdfAPng(rutaArchivo);
    cleanup = () => { try { fs.rmSync(path.dirname(pngPath), { recursive: true, force: true }); } catch (_) {} };
    imageBuf = fs.readFileSync(pngPath);
  } else {
    imageBuf = fs.readFileSync(rutaArchivo);
    imageMime = mimeType || 'image/png';
  }

  const dataUrl = `data:${imageMime};base64,${imageBuf.toString('base64')}`;
  const body = {
    model: process.env.KIMI_MODEL || 'moonshot-v1-32k-vision-preview',
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: prompt },
    ]}],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  };

  try {
    const res = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MOONSHOT_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Kimi HTTP ${res.status}: ${(await res.text().catch(()=>'')).slice(0,300)}`);
    const payload = await res.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Kimi: respuesta sin content');
    const parsed = parsearJson(content);
    return { ocrRawJson: { status: 'ok', model: body.model, kimi_raw: payload, parsed }, extraido: mapearRespuesta(parsed) };
  } finally {
    if (cleanup) cleanup();
  }
}

// ── Vision-router ───────────────────────────────────────────────────────────

async function extraerConVisionRouter(rutaArchivo, mimeType) {
  const { Blob } = require('node:buffer');
  const datos = fs.readFileSync(rutaArchivo);
  const form  = new FormData();
  form.append('file', new Blob([datos], { type: mimeType || 'application/pdf' }), path.basename(rutaArchivo));
  const res = await fetch(`${process.env.OCR_API_URL}/facturas`, {
    method: 'POST',
    headers: { 'X-Internal-Key': process.env.VISION_INTERNAL_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`vision-router HTTP ${res.status}`);
  const respuesta = await res.json();
  if (respuesta.status !== 'ok') throw new Error(`vision-router: ${respuesta.error || ''}`);
  return { ocrRawJson: respuesta, extraido: mapearRespuesta(respuesta.resultado) };
}

// ── Exportado principal ───────────────────────────────────────────────────────

async function extraerDatosFactura(rutaArchivo, mimeType, ejemplos = []) {
  const errores = [];

  if (isGeminiConfigured()) {
    try {
      const r = await extraerConGemini(rutaArchivo, mimeType, ejemplos);
      return { ...r, proveedor_ocr: 'gemini', ocr_fallback: false, ocr_fallback_motivo: null };
    } catch (e) {
      errores.push(`Gemini: ${e.message}`);
      console.warn('[ocr] Gemini falló:', e.message);
    }
  }

  if (isKimiConfigured()) {
    try {
      const r = await extraerConKimi(rutaArchivo, mimeType, ejemplos);
      return { ...r, proveedor_ocr: 'kimi', ocr_fallback: isGeminiConfigured(), ocr_fallback_motivo: errores.join(' | ') || null };
    } catch (e) {
      errores.push(`Kimi: ${e.message}`);
      console.warn('[ocr] Kimi falló:', e.message);
    }
  }

  if (isVisionRouterConfigured()) {
    try {
      const r = await extraerConVisionRouter(rutaArchivo, mimeType);
      return { ...r, proveedor_ocr: 'vision-router', ocr_fallback: true, ocr_fallback_motivo: errores.join(' | ') || null };
    } catch (e) {
      errores.push(`vision-router: ${e.message}`);
    }
  }

  throw new Error(`OCR fallido. ${errores.join(' | ') || 'No hay proveedor OCR configurado.'} — Añade GEMINI_API_KEY al .env (gratis en ai.google.dev).`);
}

module.exports = { extraerDatosFactura, isGeminiConfigured, isKimiConfigured, isVisionRouterConfigured };