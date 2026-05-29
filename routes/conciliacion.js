'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// GET /api/conciliacion?estado=&desde=&hasta=
// Devuelve la vista unificada de facturas + justificantes con su estado.
router.get('/', async (req, res) => {
  try {
    const { estado, desde, hasta, tipo } = req.query;
    const conds = [];
    const params = [];
    if (estado)  { params.push(estado); conds.push(`estado_conciliacion = $${params.length}`); }
    if (tipo)    { params.push(tipo);   conds.push(`tipo = $${params.length}`); }
    if (desde)   { params.push(desde);  conds.push(`fecha_factura >= $${params.length}`); }
    if (hasta)   { params.push(hasta);  conds.push(`fecha_factura <= $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM v_conciliacion_estado ${where} ORDER BY fecha_factura DESC NULLS LAST, id DESC LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('[conciliacion] GET /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/conciliacion/resumen
// Estadísticas globales.
router.get('/resumen', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT estado_conciliacion AS estado, tipo,
             COUNT(*) AS n, COALESCE(SUM(importe), 0) AS importe_total
      FROM v_conciliacion_estado
      GROUP BY estado_conciliacion, tipo
      ORDER BY tipo, estado_conciliacion
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/conciliacion/sugerencias
// Para cada factura sin conciliar, sugiere justificantes candidatos por
// (importe ± 1 EUR, fecha ± 60 días, beneficiario sim. al proveedor).
router.get('/sugerencias', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH facturas_pendientes AS (
        SELECT id, fecha_factura, importe, proveedor, numero_factura
        FROM v_conciliacion_estado
        WHERE tipo='factura' AND estado_conciliacion IN ('falta_justificante','discrepancia')
      ),
      justificantes_pendientes AS (
        SELECT id, fecha_factura, importe, proveedor, concepto
        FROM v_conciliacion_estado
        WHERE tipo='justificante_bancario' AND estado_conciliacion IN ('falta_factura','discrepancia')
      )
      SELECT f.id AS factura_id, f.fecha_factura AS factura_fecha,
             f.proveedor AS factura_proveedor, f.numero_factura,
             f.importe AS factura_importe,
             j.id AS justif_id, j.fecha_factura AS justif_fecha,
             j.proveedor AS justif_proveedor, j.concepto AS justif_concepto,
             j.importe AS justif_importe,
             ABS(COALESCE(f.importe,0) - COALESCE(j.importe,0)) AS dif_importe,
             ABS((COALESCE(f.fecha_factura, j.fecha_factura) - COALESCE(j.fecha_factura, f.fecha_factura))) AS dif_dias
      FROM facturas_pendientes f
      CROSS JOIN justificantes_pendientes j
      WHERE ABS(COALESCE(f.importe,0) - COALESCE(j.importe,0)) <= 1
        AND ABS((COALESCE(f.fecha_factura, j.fecha_factura) - COALESCE(j.fecha_factura, f.fecha_factura))) <= 60
      ORDER BY dif_importe ASC, dif_dias ASC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) {
    console.error('[conciliacion] GET /sugerencias', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/conciliacion  { factura_id, justificante_id, importe?, nota? }
router.post('/', async (req, res) => {
  try {
    const { factura_id, justificante_id, importe_conciliado = null, nota = null } = req.body;
    if (!factura_id || !justificante_id) {
      return res.status(400).json({ error: 'factura_id y justificante_id son obligatorios' });
    }
    // Validar tipos
    const { rows: tipos } = await pool.query(
      "SELECT id, tipo FROM facturas WHERE id IN ($1,$2)",
      [factura_id, justificante_id]
    );
    const mapaT = Object.fromEntries(tipos.map(t => [t.id, t.tipo]));
    if (mapaT[factura_id] !== 'factura') {
      return res.status(400).json({ error: `id=${factura_id} no tiene tipo 'factura' (es '${mapaT[factura_id]}')` });
    }
    if (mapaT[justificante_id] !== 'justificante_bancario') {
      return res.status(400).json({ error: `id=${justificante_id} no tiene tipo 'justificante_bancario' (es '${mapaT[justificante_id]}')` });
    }
    const { rows } = await pool.query(`
      INSERT INTO conciliaciones (factura_id, justificante_id, importe_conciliado, nota, creada_por)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (factura_id, justificante_id) DO UPDATE
        SET importe_conciliado = COALESCE(EXCLUDED.importe_conciliado, conciliaciones.importe_conciliado),
            nota = COALESCE(EXCLUDED.nota, conciliaciones.nota)
      RETURNING *
    `, [factura_id, justificante_id, importe_conciliado, nota, req.usuario || 'admin']);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[conciliacion] POST /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/conciliacion/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM conciliaciones WHERE id=$1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/conciliacion?factura_id=X&justificante_id=Y
router.delete('/', async (req, res) => {
  try {
    const { factura_id, justificante_id } = req.query;
    if (!factura_id || !justificante_id) {
      return res.status(400).json({ error: 'factura_id y justificante_id son obligatorios' });
    }
    const { rowCount } = await pool.query(
      'DELETE FROM conciliaciones WHERE factura_id=$1 AND justificante_id=$2',
      [factura_id, justificante_id]
    );
    res.json({ ok: true, eliminadas: rowCount });
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;