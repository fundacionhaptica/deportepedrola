const fs   = require('fs');
const path = require('path');

const OCR_API_URL = process.env.OCR_API_URL;
const VISION_KEY  = process.env.VISION_INTERNAL_API_KEY || '';

async function ocrFactura(pdfPath) {
  let raw = '';
  try {
    if (!OCR_API_URL) {
      throw new Error('OCR_API_URL no está configurada en el entorno');
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const filename  = path.basename(pdfPath);

    const form = new FormData();
    form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);

    const response = await fetch(OCR_API_URL, {
      method:  'POST',
      headers: { 'X-API-Key': VISION_KEY },
      body:    form,
      signal:  AbortSignal.timeout(20000),
    });

    raw = await response.text();

    if (!response.ok) {
      throw new Error(`vision-router ${response.status}: ${raw}`);
    }

    const result = JSON.parse(raw);

    if (result.error) {
      console.error('OCR vision-router error:', result.error);
      return { error: true, raw: result.error, parsed: null };
    }

    return result.resultado || result;
  } catch (err) {
    console.error('Error en OCR de factura:', err.message);
    return { error: true, raw, parsed: null };
  }
}

module.exports = { ocrFactura };
