'use strict';

const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const db     = require('../db/pool');
const { extraerDatosFactura } = require('../lib/ocr');

const UPLOADS_DIR  = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
const FACTURAS_DIR = path.join(UPLOADS_DIR, 'facturas');
if (!fs.existsSync(FACTURAS_DIR)) fs.mkdirSync(FACTURAS_DIR, { recursive: true });

const MIME_PERMITIDOS = {
  'application/pdf': '.pdf',
  'image/jpeg':      '.jpg',
  'image/png':       '.png',
  'image/webp':      '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FACTURAS_DIR),
  filename:    (_req, file, cb) => {
    const ext  = MIME_PERMITIDOS[file.mimetype] || path.extname(file.originalname);
    const base = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 80);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (MIME_PERMITIDOS[file.mimetype]) return cb(null, true);
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
  },
});

// GET /api/facturas — lista paginada con filtros
router.get('/', async (req, res) => {
  try {
    const { desde, hasta, proveedor, tipo, deporte, equipo_categoria, concepto, page = 1 } = req.query;
    const limit  = 30;
    const offset = (Number(page) - 1) * limit;
    const params = [];
    const conds  = [];

    if (desde)    { params.push(desde);            conds.push(`fecha_factura >= $${params.length}`); }
    if (hasta)    { params.push(hasta);             conds.push(`fecha_factura <= $${params.length}`); }
    if (proveedor){ params.push(`%${proveedor}%`);  conds.push(`proveedor ILIKE $${params.length}`); }
    if (tipo)     { params.push(tipo);              conds.push(`tipo = $${params.length}`); }
    if (deporte)  { params.push(deporte);           conds.push(`deporte = $${params.length}`); }
    if (equipo_categoria){ params.push(equipo_categoria); conds.push(`equipo_categoria = $${params.length}`); }
    if (concepto) { params.push(`%${concepto}%`);   conds.push(`concepto ILIKE $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await db.query(
      `SELECT id, nombre_archivo, tipo, proveedor, nif_proveedor, numero_factura,
              fecha_factura, concepto, deporte, equipo_categoria, importe,
              referencia_banco, ocr_revisado, created_at, categoria_ingreso
       FROM facturas ${where}
       ORDER BY COALESCE(fecha_factura, created_at::date) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: [{ total }] } = await db.query(
      `SELECT COUNT(*) AS total FROM facturas ${where}`,
      params.slice(0, -2)
    );

    res.json({ facturas: rows, total: Number(total), page: Number(page), limit });
  } catch (e) {
    console.error('[facturas] GET /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/facturas/duplicados — grupos de facturas que parecen duplicadas
router.get('/duplicados', async (req, res) => {
  try {
    // Duplicados por numero_factura + proveedor (ignorando mayúsculas y espacios)
    const { rows: porNumero } = await db.query(`
      SELECT array_agg(id ORDER BY id) AS ids,
             MAX(numero_factura) AS numero_factura,
             MAX(proveedor) AS proveedor,
             'numero_factura' AS motivo
      FROM facturas
      WHERE numero_factura IS NOT NULL AND trim(numero_factura) <> ''
      GROUP BY lower(trim(numero_factura)), lower(trim(coalesce(proveedor, '')))
      HAVING count(*) > 1
    `);

    // Duplicados por fecha + importe + proveedor cuando no hay numero_factura
    const { rows: porFechaImporte } = await db.query(`
      SELECT array_agg(id ORDER BY id) AS ids,
             NULL::text AS numero_factura,
             MAX(proveedor) AS proveedor,
             'fecha_importe' AS motivo
      FROM facturas
      WHERE (numero_factura IS NULL OR trim(numero_factura) = '')
        AND fecha_factura IS NOT NULL
        AND importe IS NOT NULL
      GROUP BY fecha_factura, importe, lower(trim(coalesce(proveedor, '')))
      HAVING count(*) > 1
    `);

    const grupos = [...porNumero, ...porFechaImporte];
    const ids = [...new Set(grupos.flatMap(g => g.ids))];
    res.json({ grupos, ids });
  } catch (e) {
    console.error('[facturas] GET /duplicados', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/facturas/upload — sube una o varias facturas
// Si se envían campos de metadatos en el form (tipo, proveedor, concepto, etc.) junto
// con skip_ocr=true, se guardan directamente sin pasar por OCR y con ocr_revisado=true.
// Útil para el flujo manual desde Cowork donde Claude ya leyó el PDF.
router.post('/upload', upload.array('archivos', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  }

  // Modo manual: metadatos ya confirmados, sin OCR
  const skipOcr = req.body.skip_ocr === 'true' || req.body.skip_ocr === true;

  // Obtener ejemplos confirmados para few-shot (solo si se usa OCR)
  let ejemplosOcr = [];
  if (!skipOcr) {
    const { rows } = await db.query(
      `SELECT tipo, proveedor, nif_proveedor, numero_factura, fecha_factura,
              concepto, base_imponible, iva_porcentaje, iva_importe, importe
       FROM facturas
       WHERE ocr_revisado = true AND proveedor IS NOT NULL
       ORDER BY created_at DESC LIMIT 6`
    ).catch(() => ({ rows: [] }));
    ejemplosOcr = rows;
  }

  const resultados = [];

  for (const file of req.files) {
    let ocrRawJson     = null;
    let extraido       = {};
    let ocrError       = null;
    let proveedorOcr   = null;
    let ocrFallback    = false;
    let ocrFallbackMotivo = null;
    let revisado       = false;

    if (skipOcr) {
      // — Flujo manual: usar metadatos del form directamente —
      revisado = true;
      extraido = {
        tipo:            req.body.tipo            || null,
        proveedor:       req.body.proveedor       || null,
        nif_proveedor:   req.body.nif_proveedor   || null,
        numero_factura:  req.body.numero_factura  || null,
        fecha_factura:   req.body.fecha_factura   || null,
        concepto:        req.body.concepto        || null,
        deporte:         req.body.deporte         || null,
        equipo_categoria:req.body.equipo_categoria|| null,
        base_imponible:  req.body.base_imponible  ? Number(req.body.base_imponible)  : null,
        iva_porcentaje:  req.body.iva_porcentaje  ? Number(req.body.iva_porcentaje)  : null,
        iva_importe:     req.body.iva_importe     ? Number(req.body.iva_importe)     : null,
        importe_total:   req.body.importe         ? Number(req.body.importe)         : null,
        referencia_banco:req.body.referencia_banco|| null,
      };
      proveedorOcr = 'manual-cowork';
    } else {
      // — Flujo automático: OCR con Kimi/Gemini —
      try {
        ({ ocrRawJson, extraido, proveedor_ocr: proveedorOcr,
           ocr_fallback: ocrFallback, ocr_fallback_motivo: ocrFallbackMotivo
         } = await extraerDatosFactura(file.path, file.mimetype, ejemplosOcr));
      } catch (e) {
        console.error(`[facturas] OCR fallido para ${file.filename}:`, e.message);
        ocrError = e.message;
      }
    }

    const fechaFactura = extraido.fecha_factura || null;

    try {
      const { rows: [factura] } = await db.query(
        `INSERT INTO facturas
           (nombre_archivo, ruta_archivo, tipo, proveedor, nif_proveedor, numero_factura,
            fecha_factura, concepto, deporte, equipo_categoria,
            base_imponible, iva_porcentaje, iva_importe,
            importe, referencia_banco, ocr_raw_json, ocr_revisado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id, tipo, proveedor, nif_proveedor, numero_factura,
                   fecha_factura, concepto, base_imponible, iva_porcentaje,
                   iva_importe, importe, nombre_archivo, deporte, equipo_categoria,
                   referencia_banco, ocr_revisado, categoria_ingreso`,
        [
          file.originalname,
          file.path,
          extraido.tipo             || null,
          extraido.proveedor        || null,
          extraido.nif_proveedor    || null,
          extraido.numero_factura   || null,
          fechaFactura,
          extraido.concepto         || null,
          extraido.deporte          || null,
          extraido.equipo_categoria || null,
          extraido.base_imponible   || null,
          extraido.iva_porcentaje   || null,
          extraido.iva_importe      || null,
          extraido.importe_total    || null,
          extraido.referencia_banco || null,
          ocrRawJson ? JSON.stringify(ocrRawJson) : null,
          revisado,
        ]
      );
      resultados.push({ ok: true, ocr_error: ocrError || null,
        proveedor_ocr: proveedorOcr, ocr_fallback: ocrFallback,
        ocr_fallback_motivo: ocrFallbackMotivo, ...factura });
    } catch (e) {
      console.error(`[facturas] DB error para ${file.filename}:`, e.message);
      resultados.push({ ok: false, nombre: file.originalname, error: e.message });
    }
  }

  res.json({ resultados });
});

// PATCH /api/facturas/:id/categoria-ingreso { categoria_ingreso }
router.patch('/:id/categoria-ingreso', async (req, res) => {
  try {
    const { categoria_ingreso } = req.body || {};
    const valid = [null, 'subvencion', 'cuota_socio', 'donacion', 'inscripcion'];
    if (!valid.includes(categoria_ingreso)) {
      return res.status(400).json({ error: 'categoria_ingreso invalida' });
    }
    const { rows } = await db.query(
      'UPDATE facturas SET categoria_ingreso = $1 WHERE id = $2 RETURNING id, categoria_ingreso',
      [categoria_ingreso, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[facturas] PATCH categoria-ingreso', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/facturas/:id — corrige campos tras revisión OCR
router.patch('/:id', async (req, res) => {
  const client = await db.connect();
  try {
    const { tipo, proveedor, nif_proveedor, numero_factura, fecha_factura,
            concepto, deporte, equipo_categoria,
            base_imponible, iva_porcentaje, iva_importe, importe,
            referencia_banco, distribuciones, categoria_ingreso } = req.body;

    // Determinar deporte efectivo en factura principal
    let deportePrincipal = deporte || null;
    if (Array.isArray(distribuciones) && distribuciones.length > 0) {
      const deportesUnicos = [...new Set(distribuciones.map(d => d.deporte).filter(Boolean))];
      deportePrincipal = deportesUnicos.length === 1 ? deportesUnicos[0] : 'Múltiple';
    }

    await client.query('BEGIN');

    const { rows: [factura] } = await client.query(
      `UPDATE facturas SET
         tipo             = COALESCE($1,  tipo),
         proveedor        = COALESCE($2,  proveedor),
         nif_proveedor    = COALESCE($3,  nif_proveedor),
         numero_factura   = COALESCE($4,  numero_factura),
         fecha_factura    = COALESCE($5::date, fecha_factura),
         concepto         = COALESCE($6,  concepto),
         deporte          = COALESCE($7,  deporte),
         equipo_categoria = COALESCE($8,  equipo_categoria),
         base_imponible   = COALESCE($9,  base_imponible),
         iva_porcentaje   = COALESCE($10, iva_porcentaje),
         iva_importe      = COALESCE($11, iva_importe),
         importe          = COALESCE($12, importe),
         referencia_banco = COALESCE($13, referencia_banco),
         categoria_ingreso = COALESCE($14, categoria_ingreso),
         ocr_revisado     = true
       WHERE id = $15
       RETURNING id, tipo, proveedor, nif_proveedor, numero_factura, fecha_factura,
                 concepto, deporte, equipo_categoria, referencia_banco,
                 base_imponible, iva_porcentaje, iva_importe, importe`,
      [tipo || null, proveedor || null, nif_proveedor || null, numero_factura || null,
       fecha_factura || null, concepto || null, deportePrincipal,
       equipo_categoria || null,
       base_imponible != null ? base_imponible : null,
       iva_porcentaje != null ? iva_porcentaje : null,
       iva_importe    != null ? iva_importe    : null,
       importe        != null ? importe        : null,
       referencia_banco || null,
       categoria_ingreso || null,
       req.params.id]
    );
    if (!factura) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Factura no encontrada.' }); }

    // Guardar distribuciones
    await client.query('DELETE FROM factura_distribuciones WHERE factura_id = $1', [req.params.id]);
    if (Array.isArray(distribuciones) && distribuciones.length > 0) {
      for (const d of distribuciones) {
        if (d.importe == null || isNaN(Number(d.importe))) continue;
        await client.query(
          `INSERT INTO factura_distribuciones (factura_id, deporte, equipo_categoria, concepto, importe)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.id, d.deporte || null, d.equipo_categoria || null, d.concepto || null, Number(d.importe)]
        );
      }
    }

    await client.query('COMMIT');
    res.json(factura);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[facturas] PATCH /:id', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /api/facturas/ocr-stats — número de facturas confirmadas disponibles para few-shot
router.get('/ocr-stats', async (req, res) => {
  try {
    const { rows: [{ total }] } = await db.query(
      `SELECT COUNT(*) AS total FROM facturas WHERE ocr_revisado = true AND proveedor IS NOT NULL`
    );
    res.json({ ejemplos_confirmados: Number(total) });
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/facturas/:id — detalle completo incluido OCR raw
router.get('/:id', async (req, res) => {
  try {
    const { rows: [factura] } = await db.query(
      'SELECT * FROM facturas WHERE id = $1', [req.params.id]
    );
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada.' });

    const { rows: distribuciones } = await db.query(
      'SELECT id, deporte, equipo_categoria, concepto, importe FROM factura_distribuciones WHERE factura_id = $1 ORDER BY id',
      [req.params.id]
    );
    factura.distribuciones = distribuciones;
    res.json(factura);
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/facturas/:id — borra la factura y su archivo físico
router.delete('/:id', async (req, res) => {
  try {
    const { rows: [f] } = await db.query(
      'DELETE FROM facturas WHERE id = $1 RETURNING ruta_archivo', [req.params.id]
    );
    if (!f) return res.status(404).json({ error: 'Factura no encontrada.' });
    if (f.ruta_archivo) {
      try { fs.unlinkSync(f.ruta_archivo); } catch (_) {}
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[facturas] DELETE /:id', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/facturas/:id/reocr — vuelve a ejecutar el OCR sobre el archivo ya almacenado
router.post('/:id/reocr', async (req, res) => {
  try {
    const { rows: [f] } = await db.query(
      'SELECT id, ruta_archivo, nombre_archivo FROM facturas WHERE id = $1', [req.params.id]
    );
    if (!f) return res.status(404).json({ error: 'Factura no encontrada.' });

    const ext = path.extname(f.ruta_archivo).toLowerCase();
    const mimeMap = {
      '.pdf':  'application/pdf',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png':  'image/png',
      '.webp': 'image/webp',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';

    const { rows: ejemplosOcr } = await db.query(
      `SELECT tipo, proveedor, nif_proveedor, numero_factura, fecha_factura,
              concepto, base_imponible, iva_porcentaje, iva_importe, importe
       FROM facturas
       WHERE ocr_revisado = true AND proveedor IS NOT NULL AND id != $1
       ORDER BY created_at DESC LIMIT 6`, [req.params.id]
    ).catch(() => ({ rows: [] }));

    const { ocrRawJson, extraido } = await extraerDatosFactura(f.ruta_archivo, mime, ejemplosOcr);

    const { rows: [updated] } = await db.query(
      `UPDATE facturas SET
         tipo           = $1, proveedor      = $2, nif_proveedor  = $3,
         numero_factura = $4, fecha_factura  = $5::date, concepto = $6,
         base_imponible = $7, iva_porcentaje = $8, iva_importe    = $9,
         importe        = $10, ocr_raw_json  = $11, ocr_revisado  = false
       WHERE id = $12
       RETURNING id, tipo, proveedor, nif_proveedor, numero_factura, fecha_factura,
                 concepto, deporte, equipo_categoria,
                 base_imponible, iva_porcentaje, iva_importe, importe, nombre_archivo`,
      [
        extraido.tipo            || null,
        extraido.proveedor       || null,
        extraido.nif_proveedor   || null,
        extraido.numero_factura  || null,
        extraido.fecha_factura   || null,
        extraido.concepto        || null,
        extraido.base_imponible  || null,
        extraido.iva_porcentaje  || null,
        extraido.iva_importe     || null,
        extraido.importe_total   || null,
        ocrRawJson ? JSON.stringify(ocrRawJson) : null,
        req.params.id,
      ]
    );
    res.json({ ok: true, ...updated });
  } catch (e) {
    console.error('[facturas] POST /:id/reocr', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/facturas/:id/archivo — descarga el archivo original
router.get('/:id/archivo', async (req, res) => {
  try {
    const { rows: [factura] } = await db.query(
      'SELECT ruta_archivo, nombre_archivo FROM facturas WHERE id = $1', [req.params.id]
    );
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada.' });
    res.download(factura.ruta_archivo, factura.nombre_archivo);
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;