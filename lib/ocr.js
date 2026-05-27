'use strict';

// lib/ocr.js — Extracción de datos de facturas/recibos por OCR.
//
// Estado actual (2026-05-27):
//   El club NO tiene API de pago de IA. Kimi y Gemini se eliminaron porque
//   daban mala calidad. El flujo PRINCIPAL es **workflow Cowork manual**
//   (ver docs/WORKFLOW_OCR_COWORK.md): el usuario sube el PDF a una sesión
//   de Cowork, Claude aplica el prompt facturas.deporte-pedrola.v3.txt, y
//   el script subir_documento.py POSTea a /api/facturas/upload con
//   skip_ocr=true.
//
//   Este módulo queda como **hook** para el OCR automático cuando se
//   active vision-router (proyecto-ia del NAS). Para activarlo:
//     1. Añadir ANTHROPIC_API_KEY en /volume1/docker/proyecto-ia/.env
//        (o cambiar PROVIDER_FACTURAS=kimi)
//     2. Conectar el contenedor club-app-1 a la red ia-net:
//        En docker-compose.yml añadir:
//          networks:
//            - default
//            - ia-net
//        networks:
//          ia-net:
//            external: true
//     3. Verificar que OCR_API_URL=http://vision-router:8003 en el .env
//        del club y VISION_INTERNAL_API_KEY esté igual que en proyecto-ia.
//     4. Reiniciar: docker compose -p club up -d --force-recreate app
//
// Interfaz exportada (NO cambiar sin actualizar routes/facturas.js):
//   extraerDatosFactura(rutaArchivo, mimeType, ejemplos=[])
//     → { ocrRawJson, extraido, proveedor_ocr, ocr_fallback, ocr_fallback_motivo }
//
//   Si OCR no está disponible, lanza Error con mensaje claro. routes/facturas.js
//   captura la excepción y guarda la factura con ocr_revisado=false para
//   revisión manual posterior.

const fs   = require('fs');
const path = require('path');
const { Blob } = require('node:buffer');

function isVisionRouterConfigured() {
  return Boolean(process.env.OCR_API_URL && process.env.VISION_INTERNAL_API_KEY);
}

// Mapea el JSON que devuelve vision-router (/facturas) a los campos
// que espera routes/facturas.js. El prompt v3 produce esta estructura:
//   { tipo, proveedor_nombre, proveedor_cif, numero_factura, fecha_factura,
//     base_imponible, tipo_iva_pct, importe_iva, total_factura,
//     deporte, equipo_categoria, concepto, es_autobus, lineas: [...], notas }
function mapearRespuestaVisionRouter(resultado) {
  if (!resultado || typeof resultado !== 'object') return {};
  return {
    tipo:             resultado.tipo                || null,
    proveedor:        resultado.proveedor_nombre    || null,
    nif_proveedor:    resultado.proveedor_cif       || null,
    numero_factura:   resultado.numero_factura      || null,
    fecha_factura:    resultado.fecha_factura       || null,
    concepto:         resultado.concepto            || null,
    deporte:          resultado.deporte             || null,
    equipo_categoria: resultado.equipo_categoria    || null,
    base_imponible:   resultado.base_imponible      ?? null,
    iva_porcentaje:   resultado.tipo_iva_pct        ?? null,
    iva_importe:      resultado.importe_iva         ?? null,
    importe_total:    resultado.total_factura       ?? null,
  };
}

async function extraerConVisionRouter(rutaArchivo, mimeType) {
  const url    = process.env.OCR_API_URL;
  const apiKey = process.env.VISION_INTERNAL_API_KEY;

  const datos = fs.readFileSync(rutaArchivo);
  const form  = new FormData();
  form.append('file',
    new Blob([datos], { type: mimeType || 'application/pdf' }),
    path.basename(rutaArchivo));

  // Endpoint: POST {OCR_API_URL}/facturas con header X-Internal-Key
  const res = await fetch(`${url}/facturas`, {
    method:  'POST',
    headers: { 'X-Internal-Key': apiKey },
    body:    form,
    // Sin timeout explícito; vision-router suele responder en 5-30s con Claude.
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`vision-router /facturas → HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  const respuesta = await res.json();

  if (respuesta.status !== 'ok') {
    throw new Error(`vision-router /facturas → status=${respuesta.status} error=${respuesta.error || '(sin detalle)'}`);
  }

  return {
    ocrRawJson: respuesta,
    extraido:   mapearRespuestaVisionRouter(respuesta.resultado),
  };
}

/**
 * Extrae datos de una factura / recibo.
 *
 * @param {string} rutaArchivo  ruta absoluta al PDF/imagen
 * @param {string} mimeType     'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'
 * @param {Array}  ejemplos     few-shot (no se usa con vision-router; queda por compatibilidad)
 * @returns {Promise<{ocrRawJson, extraido, proveedor_ocr, ocr_fallback, ocr_fallback_motivo}>}
 * @throws  Error si no hay proveedor OCR configurado o si todos fallan.
 */
async function extraerDatosFactura(rutaArchivo, mimeType, _ejemplos = []) {
  if (isVisionRouterConfigured()) {
    try {
      const resultado = await extraerConVisionRouter(rutaArchivo, mimeType);
      return {
        ...resultado,
        proveedor_ocr:       'vision-router',
        ocr_fallback:        false,
        ocr_fallback_motivo: null,
      };
    } catch (e) {
      // No tenemos fallback hoy. Re-lanzamos con contexto.
      throw new Error(
        `OCR automático (vision-router) fallido: ${e.message}. ` +
        `Usa el workflow Cowork manual (docs/WORKFLOW_OCR_COWORK.md).`,
      );
    }
  }

  throw new Error(
    'OCR automático no configurado. Falta OCR_API_URL o VISION_INTERNAL_API_KEY ' +
    'en el .env, o vision-router no está accesible desde club-app-1. ' +
    'Mientras tanto, usa el workflow Cowork manual (docs/WORKFLOW_OCR_COWORK.md): ' +
    'sube el PDF por skip_ocr=true con metadatos confirmados.',
  );
}

module.exports = { extraerDatosFactura, isVisionRouterConfigured };