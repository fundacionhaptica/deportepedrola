const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db');
const { ocrFactura }  = require('../lib/claude-ocr');
const { requireAuth, requireRol } = require('../middleware/auth');

const router = express.Router();

const uploadsDir = path.join(process.env.UPLOADS_DIR || '/app/uploads', 'facturas');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Solo se admiten PDFs'));
  },
});

// Wrapper para capturar errores de multer (tipo no permitido, tamaño excedido)
function handleUpload(req, res, next) {
  upload.single('pdf')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Error al subir archivo' });
    next();
  });
}

// ─── POST /ocr ────────────────────────────────────────────────────────────────

router.post('/ocr', requireAuth, requireRol('admin', 'tesorero'),
  handleUpload,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Se requiere un PDF' });

    const pdf_path = req.file.path;
    const ocr = await ocrFactura(pdf_path);

    // Buscar proveedor por CIF si el OCR lo detectó
    let proveedor_match = null;
    const cif = ocr?.proveedor_cif || ocr?.proveedor?.cif;
    if (cif) {
      try {
        const r = await pool.query('SELECT * FROM proveedores WHERE cif = $1', [cif]);
        if (r.rows.length) proveedor_match = r.rows[0];
      } catch (e) {
        console.error('Error buscando proveedor por CIF:', e.message);
      }
    }

    // Siempre devolver pdf_path + ocr, aunque ocr tenga error
    res.json({
      pdf_path,
      pdf_filename: req.file.filename,
      ocr,
      proveedor_match,
    });
  }
);

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const { desde, hasta, seccion_id, equipo_id, proveedor_id, pagada } = req.query;
    const params = [];
    const conditions = [];

    // Filtros por sección o equipo requieren JOIN con líneas
    const needsLineas = seccion_id || equipo_id;

    if (desde)       conditions.push(`f.fecha >= $${params.push(desde)}`);
    if (hasta)       conditions.push(`f.fecha <= $${params.push(hasta)}`);
    if (proveedor_id) conditions.push(`f.proveedor_id = $${params.push(Number(proveedor_id))}`);
    if (pagada !== undefined) conditions.push(`f.pagada = $${params.push(pagada === 'true')}`);

    if (needsLineas) {
      if (seccion_id) conditions.push(`fl.seccion_id = $${params.push(Number(seccion_id))}`);
      if (equipo_id)  conditions.push(`fl.equipo_id  = $${params.push(Number(equipo_id))}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = needsLineas
      ? `SELECT DISTINCT f.id, f.proveedor_id, f.proveedor_text, f.numero, f.fecha,
                f.total, f.pagada, f.ocr_revisado, f.created_at
         FROM facturas f
         JOIN facturas_lineas fl ON fl.factura_id = f.id
         ${where}
         ORDER BY f.fecha DESC NULLS LAST`
      : `SELECT f.id, f.proveedor_id, f.proveedor_text, f.numero, f.fecha,
                f.total, f.pagada, f.ocr_revisado, f.created_at,
                p.nombre AS proveedor_nombre
         FROM facturas f
         LEFT JOIN proveedores p ON p.id = f.proveedor_id
         ${where}
         ORDER BY f.fecha DESC NULLS LAST`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar facturas' });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const [facturaRes, lineasRes] = await Promise.all([
      pool.query(
        `SELECT f.*, p.nombre AS proveedor_nombre
         FROM facturas f LEFT JOIN proveedores p ON p.id = f.proveedor_id
         WHERE f.id = $1`,
        [req.params.id]
      ),
      pool.query(
        `SELECT fl.*, s.nombre AS seccion_nombre, e.nombre AS equipo_nombre
         FROM facturas_lineas fl
         LEFT JOIN secciones s ON s.id = fl.seccion_id
         LEFT JOIN equipos   e ON e.id = fl.equipo_id
         WHERE fl.factura_id = $1 ORDER BY fl.orden`,
        [req.params.id]
      ),
    ]);

    if (!facturaRes.rows.length) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json({ ...facturaRes.rows[0], lineas: lineasRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener factura' });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      proveedor_id, proveedor_text, numero, fecha, fecha_recepcion,
      base_imponible, iva_total, total, pdf_path, ocr_raw_json,
      pagada = false, fecha_pago, forma_pago, notas,
      lineas = [],
    } = req.body;

    await client.query('BEGIN');

    const facturaRes = await client.query(
      `INSERT INTO facturas
         (proveedor_id, proveedor_text, numero, fecha, fecha_recepcion,
          base_imponible, iva_total, total, pdf_path, ocr_raw_json,
          ocr_procesado, ocr_revisado, pagada, fecha_pago, forma_pago, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,true,$11,$12,$13,$14)
       RETURNING *`,
      [proveedor_id || null, proveedor_text || null, numero || null,
       fecha || null, fecha_recepcion || null,
       base_imponible || null, iva_total || null, total || null,
       pdf_path || null, ocr_raw_json ? JSON.stringify(ocr_raw_json) : null,
       pagada, fecha_pago || null, forma_pago || null, notas || null]
    );

    const factura = facturaRes.rows[0];

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      await client.query(
        `INSERT INTO facturas_lineas
           (factura_id, seccion_id, equipo_id, concepto, base, iva_pct, iva, total, orden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [factura.id, l.seccion_id || null, l.equipo_id || null,
         l.concepto || null, l.base || null, l.iva_pct || null,
         l.iva || null, l.total || null, i]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...factura, lineas });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.constraint === 'facturas_proveedor_id_numero_key') {
      return res.status(409).json({ error: 'Factura duplicada (mismo proveedor y número)' });
    }
    res.status(500).json({ error: 'Error al crear factura' });
  } finally {
    client.release();
  }
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

router.put('/:id', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const {
      proveedor_id, proveedor_text, numero, fecha, fecha_recepcion,
      base_imponible, iva_total, total,
      pagada, fecha_pago, forma_pago, notas,
      lineas = [],
    } = req.body;

    await client.query('BEGIN');

    const facturaRes = await client.query(
      `UPDATE facturas SET
         proveedor_id=$1, proveedor_text=$2, numero=$3, fecha=$4, fecha_recepcion=$5,
         base_imponible=$6, iva_total=$7, total=$8,
         pagada=$9, fecha_pago=$10, forma_pago=$11, notas=$12
       WHERE id=$13 RETURNING *`,
      [proveedor_id || null, proveedor_text || null, numero || null,
       fecha || null, fecha_recepcion || null,
       base_imponible || null, iva_total || null, total || null,
       pagada, fecha_pago || null, forma_pago || null, notas || null, id]
    );

    if (!facturaRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // Reemplazar líneas completo
    await client.query('DELETE FROM facturas_lineas WHERE factura_id = $1', [id]);

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      await client.query(
        `INSERT INTO facturas_lineas
           (factura_id, seccion_id, equipo_id, concepto, base, iva_pct, iva, total, orden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, l.seccion_id || null, l.equipo_id || null,
         l.concepto || null, l.base || null, l.iva_pct || null,
         l.iva || null, l.total || null, i]
      );
    }

    await client.query('COMMIT');
    res.json({ ...facturaRes.rows[0], lineas });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar factura' });
  } finally {
    client.release();
  }
});

// ─── GET /:id/pdf ─────────────────────────────────────────────────────────────

router.get('/:id/pdf', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const result = await pool.query('SELECT pdf_path FROM facturas WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Factura no encontrada' });

    const { pdf_path } = result.rows[0];
    if (!pdf_path || !fs.existsSync(pdf_path)) {
      return res.status(404).json({ error: 'PDF no disponible' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="factura-${req.params.id}.pdf"`);
    fs.createReadStream(pdf_path).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al servir PDF' });
  }
});

module.exports = router;
