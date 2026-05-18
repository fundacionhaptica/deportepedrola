'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

const NOMBRE_DEPORTE = {
  atletismo: 'Atletismo', baloncesto: 'Baloncesto', f7: 'Fútbol 7',
  futbol: 'Fútbol', fs: 'Fútbol Sala', g_ritmica: 'Gimnasia Rítmica',
  kenpo: 'Kenpo', kickboxing: 'Kickboxing', patinaje: 'Patinaje',
  trail: 'Trail', voleibol: 'Voleibol', dirigidas: 'Act. Dirigidas',
};

const ACTIVIDADES = Object.keys(NOMBRE_DEPORTE);

// GET /api/cuotas?socio_id=X&temporada=2025/2026
router.get('/', async (req, res) => {
  const { socio_id, temporada } = req.query;
  let q = `
    SELECT c.*,
      s.nombre || ' ' || COALESCE(s.apellidos, '') AS socio_nombre,
      s.numero_socio
    FROM cuotas_socio c
    JOIN socios s ON s.id = c.socio_id
    WHERE 1=1
  `;
  const params = [];
  if (socio_id) {
    params.push(parseInt(socio_id, 10));
    q += ` AND c.socio_id = $${params.length}`;
  }
  if (temporada) {
    params.push(temporada);
    q += ` AND c.temporada = $${params.length}`;
  }
  q += ' ORDER BY c.socio_id, c.tipo, c.deporte';
  const { rows } = await pool.query(q, params);
  res.json(rows);
});

// GET /api/cuotas/resumen?temporada=2025/2026 — totales por socio
router.get('/resumen', async (req, res) => {
  const temporada = req.query.temporada || '2025/2026';
  const { rows } = await pool.query(`
    SELECT
      s.id,
      s.numero_socio,
      s.apellidos,
      s.nombre,
      s.fecha_nacimiento,
      s.socio_desde,
      COUNT(c.id)                                                    AS num_cuotas,
      SUM(c.importe)                                                 AS total,
      SUM(CASE WHEN c.pagado THEN c.importe ELSE 0 END)             AS pagado,
      SUM(CASE WHEN NOT c.pagado THEN c.importe ELSE 0 END)         AS pendiente,
      BOOL_AND(c.pagado)                                             AS todo_pagado,
      ARRAY_AGG(DISTINCT c.deporte ORDER BY c.deporte)              AS deportes,
      ARRAY_AGG(DISTINCT c.categoria ORDER BY c.categoria)          AS categorias
    FROM socios s
    LEFT JOIN cuotas_socio c ON c.socio_id = s.id AND c.temporada = $1
    WHERE s.activo = true
    GROUP BY s.id, s.numero_socio, s.apellidos, s.nombre, s.fecha_nacimiento, s.socio_desde
    ORDER BY s.apellidos, s.nombre
  `, [temporada]);
  res.json(rows);
});

// POST /api/cuotas/generar — genera cuotas para todos los socios activos de una temporada
router.post('/generar', async (req, res) => {
  const { temporada = '2025/2026', sobreescribir = false } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (sobreescribir) {
      await client.query('DELETE FROM cuotas_socio WHERE temporada = $1', [temporada]);
    }

    const { rows: precios } = await client.query(`
      SELECT actividad, precio_regular, precio_jjee, requiere_autobus, precio_con_autobus
      FROM precios_actividades
    `);
    const mapaPrecios = {};
    for (const p of precios) mapaPrecios[p.actividad] = p;

    const { rows: fichas } = await client.query(
      'SELECT deporte, categoria, precio FROM fichas_deportivas WHERE temporada = $1',
      [temporada]
    );
    const mapaFichas = {};
    for (const f of fichas) {
      if (!mapaFichas[f.deporte]) mapaFichas[f.deporte] = {};
      mapaFichas[f.deporte][f.categoria] = parseFloat(f.precio) || 0;
    }

    const { rows: socios } = await client.query(`
      SELECT id, fecha_nacimiento, es_jjee,
        act_atletismo, act_baloncesto, act_f7, act_futbol, act_fs,
        act_g_ritmica, act_kenpo, act_kickboxing, act_patinaje,
        act_trail, act_voleibol, act_dirigidas
      FROM socios WHERE activo = true
    `);

    // Año de corte: nacidos a partir de (anio_inicio_temporada - 15) son JJEE
    const anioInicioTemp = parseInt(temporada.split('/')[0], 10);
    let generadas = 0;
    let omitidas  = 0;

    for (const s of socios) {
      const deportesActivos = ACTIVIDADES.filter(a => s[`act_${a}`]);
      if (!deportesActivos.length) continue;

      let esJjee = s.es_jjee;
      if (!esJjee && s.fecha_nacimiento) {
        const anioNac = new Date(s.fecha_nacimiento).getFullYear();
        esJjee = anioNac > anioInicioTemp - 16;
      }

      // Fichas: calcular cuál paga el club (la más cara)
      const fichasDelSocio = deportesActivos.map(deporte => {
        const catFicha = esJjee && mapaFichas[deporte]?.jjee != null ? 'jjee' : 'regular';
        return {
          deporte,
          catFicha,
          precio: mapaFichas[deporte]?.[catFicha] || 0,
        };
      });
      fichasDelSocio.sort((a, b) => b.precio - a.precio);
      const fichaClub = fichasDelSocio[0]?.deporte; // el club paga la ficha de este deporte

      for (const deporte of deportesActivos) {
        const precio = mapaPrecios[deporte];
        if (!precio) continue;

        const useJjee = esJjee && precio.precio_jjee != null;
        const catEfectiva = useJjee ? 'jjee' : 'regular';
        const importe = parseFloat(useJjee ? precio.precio_jjee : precio.precio_regular) || 0;
        const incluyeBus = Boolean(precio.requiere_autobus && precio.precio_con_autobus);
        const importeFinal = incluyeBus
          ? parseFloat(precio.precio_con_autobus)
          : importe;

        const nombre = NOMBRE_DEPORTE[deporte] || deporte;
        const concepto = [
          `Cuota ${nombre} ${temporada}`,
          useJjee ? 'JJEE' : null,
          incluyeBus ? 'con desplazamientos' : null,
        ].filter(Boolean).join(' - ');

        const { rowCount } = await client.query(`
          INSERT INTO cuotas_socio
            (socio_id, temporada, tipo, deporte, categoria, concepto, importe, incluye_desplazamiento)
          VALUES ($1, $2, 'cuota_deporte', $3, $4, $5, $6, $7)
          ON CONFLICT (socio_id, temporada, tipo, deporte) DO NOTHING
        `, [s.id, temporada, deporte, catEfectiva, concepto, importeFinal.toFixed(2), incluyeBus]);

        if (rowCount) generadas++; else omitidas++;
      }

      // Fichas adicionales: el socio paga todas excepto la más cara (que paga el club)
      for (const f of fichasDelSocio.slice(1)) {
        if (f.precio <= 0 || f.deporte === fichaClub) continue;
        const nombre = NOMBRE_DEPORTE[f.deporte] || f.deporte;
        const concepto = `Ficha Federativa ${nombre} ${temporada}`;

        const { rowCount } = await client.query(`
          INSERT INTO cuotas_socio
            (socio_id, temporada, tipo, deporte, categoria, concepto, importe)
          VALUES ($1, $2, 'ficha_adicional', $3, $4, $5, $6)
          ON CONFLICT (socio_id, temporada, tipo, deporte) DO NOTHING
        `, [s.id, temporada, f.deporte, f.catFicha, concepto, f.precio.toFixed(2)]);

        if (rowCount) generadas++; else omitidas++;
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, cuotas_generadas: generadas, cuotas_omitidas: omitidas });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/cuotas/:id — actualizar estado de pago o importe
router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const campos = [];
  const vals   = [];

  for (const c of ['pagado', 'pagado_fecha', 'pagado_metodo', 'importe', 'concepto']) {
    if (req.body[c] !== undefined) {
      campos.push(`${c}=$${vals.push(req.body[c])}`);
    }
  }

  if (!campos.length) return res.status(400).json({ error: 'Nada que actualizar' });

  if (req.body.pagado === true && req.body.pagado_fecha === undefined) {
    campos.push(`pagado_fecha=$${vals.push(new Date().toISOString().slice(0, 10))}`);
  }
  if (req.body.pagado === false) {
    campos.push(`pagado_metodo=$${vals.push(null)}`);
    campos.push(`pagado_fecha=$${vals.push(null)}`);
  }

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE cuotas_socio SET ${campos.join(', ')} WHERE id=$${vals.length} RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Cuota no encontrada' });
  res.json(rows[0]);
});

// DELETE /api/cuotas/:id
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { rowCount } = await pool.query('DELETE FROM cuotas_socio WHERE id=$1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'Cuota no encontrada' });
  res.json({ ok: true });
});

module.exports = router;
