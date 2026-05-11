'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

const ACTIVIDADES = [
  'atletismo','baloncesto','f7','futbol','fs',
  'g_ritmica','kenpo','kickboxing','patinaje',
  'trail','voleibol','dirigidas',
];

// GET /api/precios — devuelve precios actuales de todas las actividades
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT actividad, precio_regular, precio_jjee FROM precios_actividades ORDER BY actividad'
  );
  res.json(rows);
});

// PUT /api/precios — guarda todos los precios y recalcula cuotas
router.put('/', async (req, res) => {
  const { precios } = req.body; // [{ actividad, precio_regular, precio_jjee }, ...]
  if (!Array.isArray(precios)) return res.status(400).json({ error: 'Se esperaba un array de precios' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const p of precios) {
      if (!ACTIVIDADES.includes(p.actividad)) continue;
      await client.query(`
        INSERT INTO precios_actividades (actividad, precio_regular, precio_jjee, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (actividad) DO UPDATE SET
          precio_regular = EXCLUDED.precio_regular,
          precio_jjee    = EXCLUDED.precio_jjee,
          updated_at     = NOW()
      `, [p.actividad, p.precio_regular || 0, p.precio_jjee ?? null]);
    }

    // Recalcular cuota de todos los socios activos
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
      // JJEE: flag manual OR menor de 16 años
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

module.exports = router;
