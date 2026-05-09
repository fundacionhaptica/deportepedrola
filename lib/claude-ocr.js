const fs   = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');
const https = require('https');

const VISION_URL = process.env.VISION_URL || 'http://vision-router:8003';
const VISION_KEY = process.env.VISION_INTERNAL_API_KEY || '';

async function ocrFactura(pdfPath) {
  let raw = '';
  try {
    const pdfBuffer  = fs.readFileSync(pdfPath);
    const filename   = path.basename(pdfPath);

    const form = new FormData();
    form.append('file', pdfBuffer, { filename, contentType: 'application/pdf' });

    const url     = new URL('/facturas', VISION_URL);
    const client  = url.protocol === 'https:' ? https : http;
    const headers = {
      ...form.getHeaders(),
      'X-API-Key': VISION_KEY,
    };

    const result = await new Promise((resolve, reject) => {
      const req = client.request(
        { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            if (res.statusCode >= 400) {
              return reject(new Error(`vision-router ${res.statusCode}: ${body}`));
            }
            resolve(JSON.parse(body));
          });
        }
      );
      req.on('error', reject);
      form.pipe(req);
    });

    if (result.error) {
      console.error('OCR vision-router error:', result.error);
      return { error: true, raw: result.error };
    }

    // resultado es el objeto JSON estructurado devuelto por el prompt
    return result.resultado || result;
  } catch (err) {
    console.error('Error en OCR de factura:', err.message);
    return { error: true, raw };
  }
}

module.exports = { ocrFactura };
