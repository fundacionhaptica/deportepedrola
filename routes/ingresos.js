const express = require('express');
const fs      = require('fs');
const pool    = require('../db');
const { generarCertificadoDonacion } = require('../lib/certificado-donacion');
const { requireAuth, requireRol }    = require('../middleware/auth');

const router = express.Router();

const TIPOS_VALIDOS = ['cuota','inscripcion','subvencion','donacion','adelanto_presidente','otro'];

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const { tipo, desde, hasta, socio_id, es_tesoreria } = req.query;
    const params = [];
    const conditions = [];

    if (tipo)       conditions.push(`i.tipo = $${params.push(tipo)}`);
    if (desde)      conditions.push(`i.fecha >= $${params.push(desde)}`);
    if (hasta)      conditions.push(`i.fecha <= $${params.push(hasta)}`);
    if (socio_id)   conditions.push(`i.socio_id = $${params.push(Number(socio_id))}`);
    if (es_tesoreria !== undefined) {
      conditions.push(`i.es_tesoreria = $${params.push(es_tesoreria === 'true')}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT i.*, s.nombre AS socio_nombre, s.apellidos AS socio_apellidos
       FROM ingresos i
       LEFT JOIN socios s ON s.id = i.socio_id
       ${where}
       ORDER BY i.fecha DESC, i.id DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar ingresos' });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, s.nombre AS socio_nombre, s.apellidos AS socio_apellidos
       FROM ingresos i LEFT JOIN socios s ON s.id = i.socio_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ingreso no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ingreso' });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    let {
      tipo, fecha, importe, concepto,
      socio_id, seccion_id, equipo_id, disciplina_id,
      donante_nombre, donante_dni, donante_direccion, donante_email,
      organismo, expediente,
      es_tesoreria = false,
      forma_pago, notas,
    } = req.body;

    if (!tipo || !fecha || importe === undefined) {
      return res.status(400).json({ error: 'tipo, fecha e importe son obligatorios' });
    }
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: `tipo inválido. Valores: ${TIPOS_VALIDOS.join(', ')}` });
    }

    // Regla crítica: adelanto_presidente siempre es_tesoreria=true
    if (tipo === 'adelanto_presidente') es_tesoreria = true;

    const result = await pool.query(
      `INSERT INTO ingresos
         (tipo, fecha, importe, concepto,
          socio_id, seccion_id, equipo_id, disciplina_id,
          donante_nombre, donante_dni, donante_direccion, donante_email,
          organismo, expediente, es_tesoreria, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [tipo, fecha, importe, concepto || null,
       socio_id || null, seccion_id || null, equipo_id || null, disciplina_id || null,
       donante_nombre || null, donante_dni || null, donante_direccion || null, donante_email || null,
       organismo || null, expediente || null, es_tesoreria, notas || null]
    );

    const ingreso = result.rows[0];

    // Generar certificado si es donación (no romper si falla)
    if (tipo === 'donacion') {
      generarCertificadoDonacion({ ...ingreso, forma_pago })
        .then((certPath) =>
          pool.query('UPDATE ingresos SET certificado_pdf_path=$1 WHERE id=$2', [certPath, ingreso.id])
        )
        .catch((e) => console.error('Error generando certificado donación:', e.message));
    }

    res.status(201).json(ingreso);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear ingreso' });
  }
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

router.put('/:id', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    let {
      tipo, fecha, importe, concepto,
      socio_id, seccion_id, equipo_id, disciplina_id,
      donante_nombre, donante_dni, donante_direccion, donante_email,
      organismo, expediente, es_tesoreria = false, notas,
    } = req.body;

    if (tipo === 'adelanto_presidente') es_tesoreria = true;

    const result = await pool.query(
      `UPDATE ingresos SET
         tipo=$1, fecha=$2, importe=$3, concepto=$4,
         socio_id=$5, seccion_id=$6, equipo_id=$7, disciplina_id=$8,
         donante_nombre=$9, donante_dni=$10, donante_direccion=$11, donante_email=$12,
         organismo=$13, expediente=$14, es_tesoreria=$15, notas=$16
       WHERE id=$17 RETURNING *`,
      [tipo, fecha, importe, concepto || null,
       socio_id || null, seccion_id || null, equipo_id || null, disciplina_id || null,
       donante_nombre || null, donante_dni || null, donante_direccion || null, donante_email || null,
       organismo || null, expediente || null, es_tesoreria, notas || null,
       req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Ingreso no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar ingreso' });
  }
});

// ─── POST /:id/certificado — regenerar ───────────────────────────────────────

router.post('/:id/certificado', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ingresos WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Ingreso no encontrado' });

    const ingreso = result.rows[0];
    if (ingreso.tipo !== 'donacion') {
      return res.status(400).json({ error: 'Solo las donaciones tienen certificado' });
    }

    const certPath = await generarCertificadoDonacion({ ...ingreso, forma_pago: req.body.forma_pago });
    await pool.query('UPDATE ingresos SET certificado_pdf_path=$1 WHERE id=$2', [certPath, ingreso.id]);

    res.json({ ok: true, certificado_pdf_path: certPath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar certificado' });
  }
});

// ─── GET /:id/certificado — descargar ────────────────────────────────────────

router.get('/:id/certificado', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT certificado_pdf_path FROM ingresos WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ingreso no encontrado' });

    const { certificado_pdf_path } = result.rows[0];
    if (!certificado_pdf_path || !fs.existsSync(certificado_pdf_path)) {
      return res.status(404).json({ error: 'Certificado no disponible' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-donacion-${req.params.id}.pdf"`);
    fs.createReadStream(certificado_pdf_path).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al descargar certificado' });
  }
});

module.exports = router;
