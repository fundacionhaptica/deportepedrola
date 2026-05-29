'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

const TEMPORADA_ACTUAL = '2025/2026';

function temporadaSiguiente(t) {
  const [a, b] = t.split('/').map(Number);
  return `${a + 1}/${b + 1}`;
}

// GET /api/precios?temporada=2025/2026 — lista de actividades para esa temporada
router.get('/', async (req, res) => {
  try {
    const temporada = req.query.temporada || TEMPORADA_ACTUAL;
    const { rows } = await pool.query(`
      SELECT actividad, nombre_visible, precio_regular, precio_jjee,
             requiere_autobus, precio_con_autobus, temporada
      FROM precios_actividades
      WHERE temporada = $1
      ORDER BY nombre_visible
    `, [temporada]);
    res.json(rows);
  } catch (e) {
    console.error('[precios] GET /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/precios/temporadas — lista de temporadas existentes
router.get('/temporadas', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT temporada FROM precios_actividades ORDER BY temporada DESC'
    );
    res.json(rows.map(r => r.temporada));
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/precios/actividad — crear actividad nueva en una temporada
router.post('/actividad', async (req, res) => {
  try {
    const { actividad, nombre_visible, temporada = TEMPORADA_ACTUAL,
            precio_regular = 0, precio_jjee = null,
            requiere_autobus = false, precio_con_autobus = null } = req.body;

    if (!actividad || !/^[a-z0-9_]+$/.test(actividad)) {
      return res.status(400).json({ error: 'actividad debe ser texto minusculas/digitos/_ (ej: padel)' });
    }
    if (!nombre_visible || !String(nombre_visible).trim()) {
      return res.status(400).json({ error: 'nombre_visible es obligatorio' });
    }

    const { rows } = await pool.query(`
      INSERT INTO precios_actividades
        (actividad, temporada, nombre_visible, precio_regular, precio_jjee,
         requiere_autobus, precio_con_autobus, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (actividad, temporada) DO NOTHING
      RETURNING *
    `, [actividad, temporada, String(nombre_visible).trim(),
        Number(precio_regular) || 0,
        precio_jjee != null ? Number(precio_jjee) : null,
        !!requiere_autobus,
        precio_con_autobus != null ? Number(precio_con_autobus) : null]);

    if (rows.length === 0) {
      return res.status(409).json({ error: `Ya existe '${actividad}' para temporada ${temporada}` });
    }
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[precios] POST /actividad', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/precios/actividad/:actividad?temporada=2025/2026
router.delete('/actividad/:actividad', async (req, res) => {
  try {
    const temporada = req.query.temporada || TEMPORADA_ACTUAL;
    const { rowCount } = await pool.query(
      'DELETE FROM precios_actividades WHERE actividad = $1 AND temporada = $2',
      [req.params.actividad, temporada]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[precios] DELETE /actividad/:actividad', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/precios/duplicar-temporada {desde, hasta?}
// Si hasta no se da, calcula la siguiente.
router.post('/duplicar-temporada', async (req, res) => {
  try {
    const desde = req.body.desde || TEMPORADA_ACTUAL;
    const hasta = req.body.hasta || temporadaSiguiente(desde);
    const { rows: existe } = await pool.query(
      'SELECT COUNT(*) FROM precios_actividades WHERE temporada = $1',
      [hasta]
    );
    if (Number(existe[0].count) > 0) {
      return res.status(409).json({ error: `Temporada ${hasta} ya tiene precios cargados` });
    }
    const { rowCount } = await pool.query(`
      INSERT INTO precios_actividades
        (actividad, temporada, nombre_visible, precio_regular, precio_jjee,
         requiere_autobus, precio_con_autobus, updated_at)
      SELECT actividad, $2, nombre_visible, precio_regular, precio_jjee,
             requiere_autobus, precio_con_autobus, NOW()
      FROM precios_actividades WHERE temporada = $1
    `, [desde, hasta]);
    res.json({ ok: true, temporada: hasta, copiadas: rowCount });
  } catch (e) {
    console.error('[precios] POST /duplicar-temporada', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/precios — guarda precios y recalcula cuotas
// Acepta { precios: [...], temporada }. Solo para edicion de la temporada actual
// (el campo socios.cuota solo refleja la activa).
router.put('/', async (req, res) => {
  const { precios, temporada = TEMPORADA_ACTUAL } = req.body;
  if (!Array.isArray(precios)) return res.status(400).json({ error: 'Se esperaba un array de precios' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const p of precios) {
      if (!p.actividad || !/^[a-z0-9_]+$/.test(p.actividad)) continue;
      await client.query(`
        INSERT INTO precios_actividades
          (actividad, temporada, nombre_visible, precio_regular, precio_jjee,
           requiere_autobus, precio_con_autobus, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (actividad, temporada) DO UPDATE SET
          nombre_visible    = COALESCE(EXCLUDED.nombre_visible, precios_actividades.nombre_visible),
          precio_regular    = EXCLUDED.precio_regular,
          precio_jjee       = EXCLUDED.precio_jjee,
          requiere_autobus  = EXCLUDED.requiere_autobus,
          precio_con_autobus= EXCLUDED.precio_con_autobus,
          updated_at        = NOW()
      `, [
        p.actividad, temporada,
        p.nombre_visible || null,
        p.precio_regular ?? 0,
        p.precio_jjee ?? null,
        p.requiere_autobus ?? false,
        p.precio_con_autobus ?? null,
      ]);
    }

    // Recalcular cuota legacy (campo socios.cuota) solo para temporada actual
    if (temporada === TEMPORADA_ACTUAL) {
      const { rows: preciosRows } = await client.query(
        'SELECT actividad, precio_regular, precio_jjee FROM precios_actividades WHERE temporada=$1',
        [TEMPORADA_ACTUAL]
      );
      const mapa = {};
      for (const p of preciosRows) mapa[p.actividad] = p;

      const { rows: socios } = await client.query(`
        SELECT id, es_jjee, fecha_nacimiento,
          act_atletismo, act_baloncesto, act_f7, act_futbol, act_fs,
          act_g_ritmica, act_kenpo, act_kickboxing, act_patinaje,
          act_trail, act_voleibol, act_dirigidas
        FROM socios WHERE activo = true
      `);

      const hoy = new Date();
      for (const s of socios) {
        // JJEE va por AÑO DE NACIMIENTO (categorias escolares), no por edad real.
        // En 2026 son JJEE los nacidos en 2010 o despues (2026 - 2010 = 16).
        let esJjee = s.es_jjee;
        if (!esJjee && s.fecha_nacimiento) {
          const anioNac = new Date(s.fecha_nacimiento).getFullYear();
          esJjee = (hoy.getFullYear() - anioNac) <= 16;
        }
        let cuota = 0;
        for (const act of Object.keys(mapa)) {
          if (!s[`act_${act}`]) continue;
          const precio = mapa[act];
          if (!precio) continue;
          const useJjee = esJjee && precio.precio_jjee != null;
          cuota += parseFloat(useJjee ? precio.precio_jjee : precio.precio_regular) || 0;
        }
        await client.query('UPDATE socios SET cuota = $1 WHERE id = $2', [cuota.toFixed(2), s.id]);
      }
      await client.query('COMMIT');
      return res.json({ ok: true, socios_actualizados: socios.length });
    }

    await client.query('COMMIT');
    res.json({ ok: true, socios_actualizados: 0, temporada });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[precios] PUT /', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /api/precios/fichas?temporada=2025/2026
router.get('/fichas', async (req, res) => {
  const temporada = req.query.temporada || TEMPORADA_ACTUAL;
  const { rows } = await pool.query(
    'SELECT * FROM fichas_deportivas WHERE temporada = $1 ORDER BY deporte, categoria',
    [temporada]
  );
  res.json(rows);
});

// PUT /api/precios/fichas — guarda precios de fichas federativas
router.put('/fichas', async (req, res) => {
  const { fichas, temporada = TEMPORADA_ACTUAL } = req.body;
  if (!Array.isArray(fichas)) return res.status(400).json({ error: 'Se esperaba un array de fichas' });

  for (const f of fichas) {
    if (!f.deporte || !f.categoria) continue;
    await pool.query(`
      INSERT INTO fichas_deportivas (deporte, temporada, categoria, precio)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (deporte, temporada, categoria) DO UPDATE SET precio = EXCLUDED.precio
    `, [f.deporte, temporada, f.categoria, f.precio ?? 0]);
  }

  res.json({ ok: true });
});

module.exports = router;