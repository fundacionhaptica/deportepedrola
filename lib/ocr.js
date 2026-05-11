'use strict';

const fs        = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

const PROMPT = `Extrae los datos de esta factura y devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, con esta estructura exacta:
{
  "proveedor": "nombre del emisor de la factura",
  "nif_proveedor": "NIF o CIF del emisor, o null",
  "numero_factura": "número de factura, o null",
  "fecha_factura": "fecha en formato YYYY-MM-DD, o null",
  "concepto": "descripción breve del bien o servicio",
  "base_imponible": valor numérico sin símbolo de moneda, o null,
  "iva_porcentaje": porcentaje de IVA como número (p.ej. 21), o null,
  "iva_importe": importe del IVA como número, o null,
  "importe_total": importe total de la factura como número, o null
}`;

async function extraerDatosFactura(rutaArchivo, mimeType) {
  const datos = fs.readFileSync(rutaArchivo);
  const b64   = datos.toString('base64');

  const esPdf = mimeType === 'application/pdf';

  const content = esPdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
       { type: 'text', text: PROMPT }]
    : [{ type: 'image',    source: { type: 'base64', media_type: mimeType, data: b64 } },
       { type: 'text', text: PROMPT }];

  const respuesta = await client.messages.create({
    model:      MODEL,
    max_tokens: 1024,
    messages:   [{ role: 'user', content }],
  });

  // Guardar el JSON íntegro sin transformar — ver CLAUDE.md regla 4
  const ocrRawJson = respuesta;

  // Extraer el texto de la respuesta y parsearlo
  const texto = respuesta.content.find(b => b.type === 'text')?.text || '{}';
  const match  = texto.match(/\{[\s\S]*\}/);
  let extraido = {};
  try { extraido = JSON.parse(match ? match[0] : '{}'); } catch (_) {}

  return { ocrRawJson, extraido };
}

module.exports = { extraerDatosFactura };
