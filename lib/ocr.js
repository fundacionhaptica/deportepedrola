'use strict';

// lib/ocr.js — Extracción de datos de facturas con Kimi (Moonshot) vision.
//
// Variables de entorno necesarias en .env:
//   MOONSHOT_API_KEY   (obligatoria para usar Kimi)
//   KIMI_MODEL         (opcional, por defecto moonshot-v1-32k-vision-preview)
//
// Fallback secundario: vision-router (si OCR_API_URL está definido y Kimi falla).
// Fallback final: lanza Error -> routes/facturas.js marca ocr_revisado=false.

const fs   = require('fs');
const path = require('path');
const { Blob } = require('node:buffer');
const { execFileSync } = require('child_process');
const os = require('os');

const KIMI_API_URL = 'https://api.moonshot.ai/v1/chat/completions';

function isKimiConfigured() {
  return Boolean(process.env.MOONSHOT_API_KEY);
}
function isVisionRouterConfigured() {
  return Boolean(process.env.OCR_API_URL && process.env.VISION_INTERNAL_API_KEY);
}

// Prompt v3 alineado al excel real del club (recibos, facturas y licencias).
const PROMPT_FACTURAS = `Eres un asistente especializado en extraer datos de facturas, recibos, licencias y justificantes del Club Deportivo Elemental Deporte Pedrola.

Devuelve EXCLUSIVAMENTE un JSON con esta forma (sin texto adicional, sin markdown, sin comentarios):

{
  "tipo": "factura | recibo | licencias | recibo_premio | recibo_arbitraje | justificante_bancario | cobro_bancario | gasto_bancario",
  "proveedor_nombre": "...",
  "proveedor_cif": "B12345678 o G12345678 o NIF",
  "numero_factura": "...",
  "fecha_factura": "YYYY-MM-DD",
  "base_imponible": 0.00,
  "tipo_iva_pct": 21,
  "importe_iva": 0.00,
  "total_factura": 0.00,
  "deporte": "Fútbol | Fútbol Sala | Baloncesto | Patinaje | Kickboxing | Kenpo | Atletismo | Trail | Voleibol | Padel | Múltiple | JJEE | Club",
  "equipo_categoria": "Escuelas | Prebenjamín | Benjamín | Alevín | Infantil | Cadete | Juvenil | Junior | Senior | Veteranos | Femenino | Masculino | JJEE | Club | Múltiple",
  "concepto": "Arbitraje | Autobuses | Federación | Material | Premios | Gestoría | Seguros | Fichas | Inscripciones | Otros",
  "es_autobus": false,
  "notas": ""
}

Reglas:
- Si un campo no se ve claro, ponlo null. NO inventes.
- Importes en euros con punto decimal (5316.30 no 5,316.30).
- Las fechas SIEMPRE en YYYY-MM-DD.
- Para justificantes bancarios IberCaja, proveedor_nombre = beneficiario real.
- Recibos del Comité de Árbitros = tipo "recibo_arbitraje".
- Liquidaciones LC######  de Mutualidad/Federaciones = tipo "licencias".
- Premios de torneos cobrados en efectivo = tipo "recibo_premio".
- Si es una transferencia bancaria:
  - Si DEPORTE PEDROLA es el destinatario (Beneficiario / Destino) -> tipo="cobro_bancario" y proveedor_nombre = el ORDENANTE (quien envía el dinero, p.ej. Ayuntamiento de Pedrola).
  - Si DEPORTE PEDROLA es el ordenante (Origen) -> tipo="justificante_bancario" y proveedor_nombre = el BENEFICIARIO (a quien se paga).
  - Nunca pongas DEPORTE PEDROLA como proveedor_nombre.
- ABONO = entrada de dinero (cobro_bancario). CARGO/PAGO = salida (justificante_bancario o gasto_bancario según tenga factura asociada).
- En justificantes IberCaja, el importe siempre aparece bajo "Importe", "EUR", o un valor con decimales en negrita en el bloque "Importe y concepto" / "Importe transferencia". MIRA con atención y NO devuelvas 0 — si no lo ves, devuelve null.
- Para COBROS Bizum/IberCaja, busca el importe en la línea principal o en "Importe del cobro". NUNCA devuelvas total_factura=0; si dudas, null.
`;

function mapearRespuesta(json) {
  if (!json || typeof json !== 'object') return {};
  return {
    tipo:             json.tipo                || null,
    proveedor:        json.proveedor_nombre    || null,
    nif_proveedor:    json.proveedor_cif       || null,
    numero_factura:   json.numero_factura      || null,
    fecha_factura:    json.fecha_factura       || null,
    concepto:         json.concepto            || null,
    deporte:          json.deporte             || null,
    equipo_categoria: json.equipo_categoria    || null,
    base_imponible:   (json.base_imponible === 0 ? null : json.base_imponible) ?? null,
    iva_porcentaje:   json.tipo_iva_pct        ?? null,
    iva_importe:      (json.importe_iva === 0 ? null : json.importe_iva) ?? null,
    importe_total:    (json.total_factura === 0 ? null : json.total_factura) ?? null,
  };
}

// Convierte PDF a PNG (primera página, 150 dpi) usando pdftoppm.
// Devuelve el path al PNG temporal (caller debe borrar).
function pdfAPng(rutaPdf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
  const base = path.join(tmp, 'page');
  execFileSync('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', rutaPdf, base], { stdio: 'ignore' });
  // pdftoppm crea base-1.png o base.png segun versión. Buscamos el primero.
  const files = fs.readdirSync(tmp).filter(f => f.endsWith('.png'));
  if (!files.length) throw new Error('pdftoppm no generó PNG');
  return path.join(tmp, files[0]);
}

async function extraerConKimi(rutaArchivo, mimeType) {
  let pngPath = null;
  let cleanup = null;
  let imageMime = 'image/png';
  let imageBuf;

  if (mimeType === 'application/pdf' || rutaArchivo.toLowerCase().endsWith('.pdf')) {
    pngPath = pdfAPng(rutaArchivo);
    cleanup = () => { try { fs.rmSync(path.dirname(pngPath), { recursive: true, force: true }); } catch(_){} };
    imageBuf = fs.readFileSync(pngPath);
  } else {
    imageBuf = fs.readFileSync(rutaArchivo);
    imageMime = mimeType || 'image/png';
  }

  const base64 = imageBuf.toString('base64');
  const dataUrl = `data:${imageMime};base64,${base64}`;

  const body = {
    model: process.env.KIMI_MODEL || 'moonshot-v1-32k-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: PROMPT_FACTURAS },
      ],
    }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  };

  try {
    const res = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MOONSHOT_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Kimi HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }
    const payload = await res.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Kimi respuesta sin content');
    let parsed;
    try { parsed = JSON.parse(content); }
    catch (e) { throw new Error(`Kimi devolvió contenido no-JSON: ${content.slice(0,200)}`); }
    return {
      ocrRawJson: { status: 'ok', model: body.model, kimi_raw: payload, parsed },
      extraido: mapearRespuesta(parsed),
    };
  } finally {
    if (cleanup) cleanup();
  }
}

async function extraerConVisionRouter(rutaArchivo, mimeType) {
  const url    = process.env.OCR_API_URL;
  const apiKey = process.env.VISION_INTERNAL_API_KEY;
  const datos = fs.readFileSync(rutaArchivo);
  const form  = new FormData();
  form.append('file', new Blob([datos], { type: mimeType || 'application/pdf' }), path.basename(rutaArchivo));
  const res = await fetch(`${url}/facturas`, {
    method:  'POST',
    headers: { 'X-Internal-Key': apiKey },
    body:    form,
  });
  if (!res.ok) throw new Error(`vision-router HTTP ${res.status}`);
  const respuesta = await res.json();
  if (respuesta.status !== 'ok') throw new Error(`vision-router ${respuesta.error || ''}`);
  return { ocrRawJson: respuesta, extraido: mapearRespuesta(respuesta.resultado) };
}

/**
 * Extrae datos de una factura / recibo / justificante con Kimi (preferido) o vision-router.
 */
async function extraerDatosFactura(rutaArchivo, mimeType, _ejemplos = []) {
  const errores = [];
  if (isKimiConfigured()) {
    try {
      const r = await extraerConKimi(rutaArchivo, mimeType);
      return { ...r, proveedor_ocr: 'kimi', ocr_fallback: false, ocr_fallback_motivo: null };
    } catch (e) {
      errores.push(`Kimi: ${e.message}`);
    }
  }
  if (isVisionRouterConfigured()) {
    try {
      const r = await extraerConVisionRouter(rutaArchivo, mimeType);
      return {
        ...r,
        proveedor_ocr: 'vision-router',
        ocr_fallback: isKimiConfigured(),
        ocr_fallback_motivo: errores.join(' | ') || null,
      };
    } catch (e) {
      errores.push(`vision-router: ${e.message}`);
    }
  }
  throw new Error(
    `OCR fallido. ${errores.join(' | ') || 'No hay proveedor OCR configurado.'} ` +
    `Define MOONSHOT_API_KEY (Kimi) o OCR_API_URL+VISION_INTERNAL_API_KEY (vision-router) en .env.`
  );
}

module.exports = { extraerDatosFactura, isKimiConfigured, isVisionRouterConfigured };