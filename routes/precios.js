'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

const ACTIVIDADES = [
  'atletismo','baloncesto','f7','futbol','fs',
  'g_ritmica','kenpo','kickboxing','patinaje',
  'trail','voleibol','dirigidas',
];

// GET /api/precios — devuelve precios y configuración de todas las actividades
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT actividad, precio_regular, precio_jjee, requiere_autobus, precio_con_autobus
    FROM precios_actividades ORDER BY actividad
  `);
  res.json(rows);
});

// PUT /api/precios — guarda precios y recalcula cuotas (compatibilidad con lógica antigua)
router.put('/', async (req, res) => {
  const { precios } = req.body;
  if (!Array.isArray(precios)) return res.status(400).json({ error: 'Se esperaba un array de precios' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const p of precios) {
      if (!ACTIVIDADES.includes(p.actividad)) continue;
      await client.query(`
        INSERT INTO precios_actividades
          (actividad, precio_regular, precio_jjee, requiere_autobus, precio_con_autobus, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (actividad) DO UPDATE SET
          precio_regular    = EXCLUDED.precio_regular,
          precio_jjee       = EXCLUDED.precio_jjee,
          requiere_autobus  = EXCLUDED.requiere_autobus,
          precio_con_autobus= EXCLUDED.precio_con_autobus,
          updated_at        = NOW()
      `, [
        p.actividad,
        p.precio_regular ?? 0,
        p.precio_jjee ?? null,
        p.requiere_autobus ?? false,
        p.precio_con_autobus ?? null,
      ]);
    }

    // Recalcular cuota legacy (campo socios.cuota) para compatibilidad
    const { rows: preciosRows } = await client.query(
      'SELECT actividad, precio_regular, precio_jjee FROM precios_actividades'
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
      let esJjee = s.es_jjee;
      if (!esJjee && s.fecha_nacimiento) {
        const nac = new Date(s.fecha_nacimiento);
        const edad = hoy.getFullYear() - nac.getFullYear() -
          (hoy < new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate()) ? 1 : 0);
        esJjee = edad < 16;
      }

      let cuota = 0;
      for (const act of ACTIVIDADES) {
        if (!s[`act_${act}`]) continue;
        const precio = mapa[act];
        if (!precio) continue;
        const useJjee = esJjee && precio.precio_jjee != null;
        cuota += parseFloat(useJjee ? precio.precio_jjee : precio.precio_regular) || 0;
      }

      await client.query('UPDATE socios SET cuota = $1 WHERE id = $2', [cuota.toFixed(2), s.id]);
    }

    await client.query('COMMIT');
    res.json({ ok: true, socios_actualizados: socios.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/precios/fichas?temporada=2025/2026
router.get('/fichas', async (req, res) => {
  const temporada = req.query.temporada || '2025/2026';
  const { rows } = await pool.query(
    'SELECT * FROM fichas_deportivas WHERE temporada = $1 ORDER BY deporte, categoria',
    [temporada]
  );
  res.json(rows);
});

// PUT /api/precios/fichas — guarda precios de fichas federativas
router.put('/fichas', async (req, res) => {
  const { fichas, temporada = '2025/2026' } = req.body;
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
