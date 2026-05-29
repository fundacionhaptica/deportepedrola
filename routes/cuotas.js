'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');
const email  = require('../lib/email');

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
// Acepta `socio_id` para regenerar solo un socio concreto.
router.post('/generar', async (req, res) => {
  const { temporada = '2025/2026', sobreescribir = false, socio_id = null } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (sobreescribir && socio_id) {
      await client.query('DELETE FROM cuotas_socio WHERE temporada = $1 AND socio_id = $2', [temporada, socio_id]);
    } else if (sobreescribir) {
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

    const sociosQ = socio_id
      ? `SELECT id, fecha_nacimiento, es_jjee,
           act_atletismo, act_baloncesto, act_f7, act_futbol, act_fs,
           act_g_ritmica, act_kenpo, act_kickboxing, act_patinaje,
           act_trail, act_voleibol, act_dirigidas
         FROM socios WHERE activo = true AND id = $1`
      : `SELECT id, fecha_nacimiento, es_jjee,
           act_atletismo, act_baloncesto, act_f7, act_futbol, act_fs,
           act_g_ritmica, act_kenpo, act_kickboxing, act_patinaje,
           act_trail, act_voleibol, act_dirigidas
         FROM socios WHERE activo = true`;
    const { rows: socios } = await client.query(sociosQ, socio_id ? [socio_id] : []);

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

      // === Régimen especial Escuelas (categoria <= 5 anios) ===
      // 2025/2026: 20 EUR unico. 2026/2027 en adelante: 3 plazos de 20 EUR
      // (jun-inscripcion, ene, abr). Se ignoran los precios por deporte.
      const edadAprox = s.fecha_nacimiento
        ? anioInicioTemp - new Date(s.fecha_nacimiento).getFullYear()
        : null;
      const esEscuelas = edadAprox != null && edadAprox <= 5;
      if (esEscuelas) {
        const plazos = (temporada === '2025/2026')
          ? [{ d: 'escuelas', c: `Cuota Escuelas ${temporada} (pago unico)` }]
          : [
              { d: 'escuelas_jun' + anioInicioTemp,     c: `Cuota Escuelas ${temporada} - 1º plazo (junio)` },
              { d: 'escuelas_ene' + (anioInicioTemp+1), c: `Cuota Escuelas ${temporada} - 2º plazo (enero)` },
              { d: 'escuelas_abr' + (anioInicioTemp+1), c: `Cuota Escuelas ${temporada} - 3º plazo (abril)` },
            ];
        for (const pl of plazos) {
          const { rowCount } = await client.query(`
            INSERT INTO cuotas_socio
              (socio_id, temporada, tipo, deporte, concepto, importe)
            VALUES ($1, $2, 'cuota_escuelas', $3, $4, 20.00)
            ON CONFLICT (socio_id, temporada, tipo, deporte) DO NOTHING
          `, [s.id, temporada, pl.d, pl.c]);
          if (rowCount) generadas++; else omitidas++;
        }
        continue; // no calcular cuotas por deporte para Escuelas
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

// POST /api/cuotas/email-prevision
// body: { temporada?, socio_id?, dry_run? }
//   · sin socio_id  → envía a todos los socios activos con email y cuotas en la temporada
//   · con socio_id  → envía solo a ese socio
//   · dry_run=true  → no envía, devuelve la lista de destinatarios y el preview del primero
router.post('/email-prevision', async (req, res) => {
  const { temporada = '2025/2026', socio_id = null, dry_run = false } = req.body || {};

  if (!dry_run && !email.isConfigured()) {
    return res.status(400).json({
      error: 'El envío de correo no está configurado. Define SMTP_HOST, SMTP_USER y SMTP_PASS en el .env.',
    });
  }

  // Construir lista de socios objetivo
  const sociosQ = socio_id
    ? `SELECT id, nombre, apellidos, email FROM socios WHERE id = $1 AND activo = true`
    : `SELECT id, nombre, apellidos, email FROM socios WHERE activo = true AND email IS NOT NULL AND email <> '' ORDER BY apellidos, nombre`;
  const { rows: socios } = await pool.query(sociosQ, socio_id ? [socio_id] : []);

  if (!socios.length) {
    return res.status(404).json({ error: 'No hay socios destino' });
  }

  // Cuotas de todos los socios en una sola consulta
  const ids = socios.map(s => s.id);
  const { rows: cuotas } = await pool.query(`
    SELECT socio_id, tipo, deporte, categoria, concepto, importe, incluye_desplazamiento
    FROM cuotas_socio
    WHERE temporada = $1 AND socio_id = ANY($2::int[])
    ORDER BY socio_id, tipo, deporte
  `, [temporada, ids]);

  const cuotasPorSocio = {};
  for (const c of cuotas) {
    (cuotasPorSocio[c.socio_id] = cuotasPorSocio[c.socio_id] || []).push(c);
  }

  const enviados   = [];
  const omitidos   = [];
  const errores    = [];
  let preview      = null;

  for (const s of socios) {
    const cuotasSocio = cuotasPorSocio[s.id] || [];

    if (!cuotasSocio.length) {
      omitidos.push({ id: s.id, email: s.email, motivo: 'sin cuotas generadas en esta temporada' });
      if (!dry_run) await pool.query(`INSERT INTO email_envios_log (tipo, temporada, socio_id, email_destino, estado, motivo) VALUES ('prevision_cuotas',$1,$2,$3,'omitido','sin cuotas generadas')`, [temporada, s.id, s.email]);
      continue;
    }
    if (!s.email) {
      omitidos.push({ id: s.id, email: null, motivo: 'sin email' });
      if (!dry_run) await pool.query(`INSERT INTO email_envios_log (tipo, temporada, socio_id, estado, motivo) VALUES ('prevision_cuotas',$1,$2,'omitido','sin email')`, [temporada, s.id]);
      continue;
    }

    const { subject, html, text, total } = email.construirEmailPrevisionCuota({
      socio: s, cuotas: cuotasSocio, temporada,
    });

    // Guardar preview del primero para que el frontend pueda mostrarlo en dry_run
    if (!preview) {
      preview = {
        socio_id: s.id,
        nombre:   [s.nombre, s.apellidos].filter(Boolean).join(' '),
        email:    s.email,
        subject,
        html,
        text,
        total,
        num_cuotas: cuotasSocio.length,
      };
    }

    if (dry_run) {
      enviados.push({ id: s.id, email: s.email, total, dry_run: true });
      continue;
    }

    try {
      const r = await email.sendMail({ to: s.email, subject, html, text });
      enviados.push({ id: s.id, email: s.email, total, message_id: r.id });
      await pool.query(`INSERT INTO email_envios_log (tipo, temporada, socio_id, email_destino, asunto, estado, message_id, total_eur) VALUES ('prevision_cuotas',$1,$2,$3,$4,'enviado',$5,$6)`, [temporada, s.id, s.email, subject, r.id || null, total]);
    } catch (err) {
      console.error(`[email-prevision] socio ${s.id} (${s.email}):`, err.message);
      errores.push({ id: s.id, email: s.email, motivo: err.message });
      await pool.query(`INSERT INTO email_envios_log (tipo, temporada, socio_id, email_destino, asunto, estado, motivo, total_eur) VALUES ('prevision_cuotas',$1,$2,$3,$4,'error',$5,$6)`, [temporada, s.id, s.email, subject, err.message, total]);
    }
  }

  res.json({
    ok: true,
    temporada,
    dry_run: Boolean(dry_run),
    total_socios: socios.length,
    enviados: enviados.length,
    omitidos: omitidos.length,
    errores:  errores.length,
    detalle:  { enviados, omitidos, errores },
    preview,
  });
});


// GET /api/cuotas/email-log?limit=50&tipo=prevision_cuotas
router.get('/email-log', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const tipo = req.query.tipo || null;
    const params = [limit];
    let where = '';
    if (tipo) { params.push(tipo); where = `WHERE l.tipo = $2`; }
    const { rows } = await pool.query(`
      SELECT l.id, l.fecha, l.tipo, l.temporada, l.socio_id, l.email_destino,
             l.asunto, l.estado, l.motivo, l.message_id, l.total_eur,
             s.nombre || ' ' || COALESCE(s.apellidos,'') AS nombre_socio
      FROM email_envios_log l
      LEFT JOIN socios s ON s.id = l.socio_id
      ${where}
      ORDER BY l.fecha DESC
      LIMIT $1
    `, params);
    res.json(rows);
  } catch (e) {
    console.error('[email-log] GET', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
