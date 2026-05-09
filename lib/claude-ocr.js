const fs         = require('fs');
const Anthropic  = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Eres un asistente experto en facturas españolas. Extraes datos estructurados de facturas en PDF.
Responde SIEMPRE con un único objeto JSON válido, sin markdown, sin texto adicional, sin backticks.
Estructura exacta:
{
  "proveedor": { "nombre": string, "cif": string|null, "direccion": string|null },
  "numero": string,
  "fecha": "YYYY-MM-DD",
  "base_imponible": number,
  "iva_total": number,
  "total": number,
  "es_autobus": boolean,
  "lineas": [
    { "concepto": string, "base": number, "iva_pct": number, "iva": number, "total": number, "ruta_o_destino": string|null }
  ],
  "notas_extraccion": string|null
}
Reglas:
- Importes con punto decimal.
- Si IVA no aparece, asumir 21%.
- "es_autobus" = true SOLO si el proveedor es claramente transporte de pasajeros y la factura describe viajes/servicios.
- Cuando es_autobus=true, una línea por viaje, con "ruta_o_destino" si es visible.
- Cuando es_autobus=false, normalmente UNA sola línea con el total agregado.
- Si un dato no aparece, devuelve null. No inventes.`;

async function ocrFactura(pdfPath) {
  const pdfData   = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfData.toString('base64');

  let raw = '';
  try {
    const response = await client.messages.create({
      model:      process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:         'document',
              source: {
                type:       'base64',
                media_type: 'application/pdf',
                data:       pdfBase64,
              },
            },
            {
              type: 'text',
              text: 'Extrae los datos de esta factura y devuelve el JSON.',
            },
          ],
        },
      ],
    });

    raw = response.content[0].text.trim();

    // Limpiar posibles backticks si el modelo se desvía
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Error en OCR de factura:', err.message);
    return { error: true, raw };
  }
}

module.exports = { ocrFactura };
