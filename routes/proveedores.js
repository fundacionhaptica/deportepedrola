'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

const MATCH_PROV = `(
  f.proveedor_id = p.id
  OR (f.proveedor_id IS NULL AND LOWER(TRIM(f.proveedor)) = LOWER(TRIM(p.nombre)))
)`;

// GET /api/proveedores?q=
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      params.push('%' + q + '%');
      where = `WHERE p.nombre ILIKE $${params.length} OR p.nif ILIKE $${params.length} OR p.email ILIKE $${params.length}`;
    }
    const { rows } = await pool.query(`
      SELECT p.id, p.nombre, p.nif, p.direccion, p.email, p.telefono, p.notas,
             p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM facturas f WHERE ${MATCH_PROV}) AS num_facturas,
             (SELECT COALESCE(SUM(f.importe),0) FROM facturas f
              WHERE ${MATCH_PROV} AND f.tipo = 'factura_recibo') AS total_facturado
      FROM proveedores p
      ${where}
      ORDER BY LOWER(p.nombre)
      LIMIT 500
    `, params);
    res.json(rows);
  } catch (e) {
    console.error('[proveedores] GET /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/proveedores/duplicados
router.get('/duplicados', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH normalizado AS (
        SELECT id, nombre, nif, direccion, email,
               (SELECT COUNT(*) FROM facturas f
                WHERE f.proveedor_id = proveedores.id
                   OR (f.proveedor_id IS NULL AND LOWER(TRIM(f.proveedor)) = LOWER(TRIM(proveedores.nombre))))
                AS num_facturas,
               regexp_replace(LOWER(nombre), '[^a-z0-9]', '', 'g') AS norm
        FROM proveedores
      )
      SELECT norm,
             json_agg(json_build_object(
               'id', id, 'nombre', nombre, 'nif', nif,
               'direccion', direccion, 'email', email,
               'num_facturas', num_facturas
             ) ORDER BY num_facturas DESC) AS grupo
      FROM normalizado
      GROUP BY norm
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('[proveedores] GET /duplicados', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/proveedores/merge
router.post('/merge', async (req, res) => {
  const client = await pool.connect();
  try {
    const { destino_id, origen_ids } = req.body || {};
    if (!destino_id || !Array.isArray(origen_ids) || !origen_ids.length) {
      return res.status(400).json({ error: 'destino_id y origen_ids (array) son obligatorios' });
    }
    if (origen_ids.includes(Number(destino_id))) {
      return res.status(400).json({ error: 'destino_id no puede estar en origen_ids' });
    }
    await client.query('BEGIN');
    const { rows: dest } = await client.query('SELECT id, nombre FROM proveedores WHERE id = $1', [destino_id]);
    if (!dest[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'destino_id no existe' }); }

    const { rowCount: nPorId } = await client.query(
      'UPDATE facturas SET proveedor_id = $1, proveedor = $2 WHERE proveedor_id = ANY($3::int[])',
      [destino_id, dest[0].nombre, origen_ids]
    );
    const { rows: origenNombres } = await client.query(
      'SELECT nombre FROM proveedores WHERE id = ANY($1::int[])', [origen_ids]
    );
    const nombres = origenNombres.map(r => r.nombre);
    let nPorNombre = 0;
    if (nombres.length) {
      const { rowCount } = await client.query(
        `UPDATE facturas SET proveedor_id = $1, proveedor = $2
         WHERE proveedor_id IS NULL AND LOWER(TRIM(proveedor)) = ANY($3::text[])`,
        [destino_id, dest[0].nombre, nombres.map(n => n.toLowerCase().trim())]
      );
      nPorNombre = rowCount;
    }
    const { rowCount: nProv } = await client.query(
      'DELETE FROM proveedores WHERE id = ANY($1::int[])', [origen_ids]
    );
    await client.query('COMMIT');
    res.json({ ok: true, destino: dest[0], facturas_reasignadas: nPorId + nPorNombre, proveedores_borrados: nProv });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[proveedores] POST /merge', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /api/proveedores/:id
router.get('/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado' });
    const { rows } = await pool.query('SELECT * FROM proveedores WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/proveedores
router.post('/', async (req, res) => {
  try {
    const { nombre, nif = null, direccion = null, email = null, telefono = null, notas = null } = req.body;
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'nombre es obligatorio' });
    const { rows } = await pool.query(`
      INSERT INTO proveedores (nombre, nif, direccion, email, telefono, notas)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (nombre) DO UPDATE
        SET nif       = COALESCE(EXCLUDED.nif, proveedores.nif),
            direccion = COALESCE(EXCLUDED.direccion, proveedores.direccion),
            email     = COALESCE(EXCLUDED.email, proveedores.email),
            telefono  = COALESCE(EXCLUDED.telefono, proveedores.telefono),
            notas     = COALESCE(EXCLUDED.notas, proveedores.notas),
            updated_at = NOW()
      RETURNING *
    `, [String(nombre).trim(), nif, direccion, email, telefono, notas]);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[proveedores] POST /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/proveedores/:id
router.patch('/:id', async (req, res) => {
  try {
    const { nombre, nif, direccion, email, telefono, notas } = req.body;
    const sets = [], vals = [];
    if (nombre    !== undefined) { vals.push(String(nombre).trim()); sets.push(`nombre = $${vals.length}`); }
    if (nif       !== undefined) { vals.push(nif);       sets.push(`nif = $${vals.length}`); }
    if (direccion !== undefined) { vals.push(direccion); sets.push(`direccion = $${vals.length}`); }
    if (email     !== undefined) { vals.push(email);     sets.push(`email = $${vals.length}`); }
    if (telefono  !== undefined) { vals.push(telefono);  sets.push(`telefono = $${vals.length}`); }
    if (notas     !== undefined) { vals.push(notas);     sets.push(`notas = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
    sets.push('updated_at = NOW()');
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE proveedores SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[proveedores] PATCH /:id', e.message);
    // Constraint de nombre duplicado -> mensaje amigable
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre. Usa "Fusionar" si quieres unificarlos.' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/proveedores/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows: ref } = await pool.query(
      `SELECT COUNT(*) AS n FROM facturas
       WHERE proveedor_id = $1
          OR (proveedor_id IS NULL AND LOWER(TRIM(proveedor)) = LOWER(TRIM(
               (SELECT nombre FROM proveedores WHERE id = $1)
             )))`, [req.params.id]
    );
    if (Number(ref[0].n) > 0) {
      return res.status(409).json({ error: `Tiene ${ref[0].n} facturas vinculadas. Desvincula primero.` });
    }
    const { rowCount } = await pool.query('DELETE FROM proveedores WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;