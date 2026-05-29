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

// GET /api/ingresos/resumen?temporada=2025/2026
router.get('/resumen', async (req, res) => {
  const temporada = req.query.temporada || '2025/2026';

  try {
    // Socios activos por deporte (uno por columna act_*)
    const colsSocios = ACTIVIDADES.map(a =>
      `SUM(CASE WHEN act_${a} THEN 1 ELSE 0 END) AS ${a}`
    ).join(',\n        ');

    const [sociosPorDep, ingresosPorDep, ingresosPorCat, totales, porTipo, sociosTotales] = await Promise.all([
      pool.query(`
        SELECT
          ${colsSocios},
          COUNT(*)                                                AS total_activos,
          SUM(CASE WHEN es_jjee THEN 1 ELSE 0 END)                AS total_jjee
        FROM socios
        WHERE activo = true
      `),

      pool.query(`
        SELECT
          deporte,
          COUNT(DISTINCT socio_id)                                AS num_socios,
          SUM(importe)                                            AS total,
          SUM(CASE WHEN pagado THEN importe ELSE 0 END)           AS pagado,
          SUM(CASE WHEN NOT pagado THEN importe ELSE 0 END)       AS pendiente
        FROM cuotas_socio
        WHERE temporada = $1
        GROUP BY deporte
        ORDER BY total DESC
      `, [temporada]),

      pool.query(`
        SELECT
          COALESCE(NULLIF(TRIM(categoria), ''), 'sin_cat')        AS categoria,
          COUNT(*)                                                AS num_cuotas,
          SUM(importe)                                            AS total,
          SUM(CASE WHEN pagado THEN importe ELSE 0 END)           AS pagado,
          SUM(CASE WHEN NOT pagado THEN importe ELSE 0 END)       AS pendiente
        FROM cuotas_socio
        WHERE temporada = $1
        GROUP BY categoria
        ORDER BY total DESC
      `, [temporada]),

      pool.query(`
        SELECT
          COUNT(*)                                                AS num_cuotas,
          COUNT(DISTINCT socio_id)                                AS socios_con_cuota,
          COALESCE(SUM(importe), 0)                               AS total,
          COALESCE(SUM(CASE WHEN pagado THEN importe ELSE 0 END), 0)     AS pagado,
          COALESCE(SUM(CASE WHEN NOT pagado THEN importe ELSE 0 END), 0) AS pendiente
        FROM cuotas_socio
        WHERE temporada = $1
      `, [temporada]),

      pool.query(`
        SELECT
          tipo,
          COUNT(*)                                                AS num_cuotas,
          SUM(importe)                                            AS total,
          SUM(CASE WHEN pagado THEN importe ELSE 0 END)           AS pagado,
          SUM(CASE WHEN NOT pagado THEN importe ELSE 0 END)       AS pendiente
        FROM cuotas_socio
        WHERE temporada = $1
        GROUP BY tipo
        ORDER BY total DESC
      `, [temporada]),

      pool.query(`SELECT COUNT(*) AS total FROM socios WHERE activo = true`),
    ]);

    // Reorganizar socios por deporte en formato array
    const sociosRow = sociosPorDep.rows[0] || {};
    const por_deporte_socios = ACTIVIDADES.map(a => ({
      deporte:        a,
      nombre:         NOMBRE_DEPORTE[a],
      num_socios:     parseInt(sociosRow[a], 10) || 0,
    })).filter(r => r.num_socios > 0)
       .sort((a, b) => b.num_socios - a.num_socios);

    // Enriquecer ingresos por deporte con nombre legible
    const por_deporte_ingresos = ingresosPorDep.rows.map(r => ({
      deporte:    r.deporte,
      nombre:     NOMBRE_DEPORTE[r.deporte] || r.deporte,
      num_socios: parseInt(r.num_socios, 10),
      total:      parseFloat(r.total),
      pagado:     parseFloat(r.pagado),
      pendiente:  parseFloat(r.pendiente),
    }));

    res.json({
      temporada,
      totales: {
        socios_activos:   parseInt(sociosTotales.rows[0].total, 10),
        socios_jjee:      parseInt(sociosRow.total_jjee, 10) || 0,
        socios_con_cuota: parseInt(totales.rows[0].socios_con_cuota, 10),
        num_cuotas:       parseInt(totales.rows[0].num_cuotas, 10),
        total:            parseFloat(totales.rows[0].total),
        pagado:           parseFloat(totales.rows[0].pagado),
        pendiente:        parseFloat(totales.rows[0].pendiente),
      },
      por_deporte_socios,
      por_deporte_ingresos,
      por_categoria: ingresosPorCat.rows,
      por_tipo:      porTipo.rows,
    });
  } catch (err) {
    console.error('[ingresos-dashboard]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// GET /api/ingresos/por-categoria?desde=&hasta=
// Desglose por categoria_ingreso (subvencion, cuota_socio, donacion, inscripcion)
router.get('/por-categoria', async (req, res) => {
  try {
    const desde = req.query.desde || '1970-01-01';
    const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(`
      SELECT COALESCE(categoria_ingreso, 'sin_clasificar') AS categoria,
             COUNT(*) AS n,
             COALESCE(SUM(importe), 0)::numeric(10,2) AS total
      FROM facturas
      WHERE (tipo IN ('cobro_bancario','factura'))
        AND fecha_factura BETWEEN $1 AND $2
        AND importe IS NOT NULL
      GROUP BY categoria_ingreso
      ORDER BY total DESC NULLS LAST
    `, [desde, hasta]);
    res.json(rows);
  } catch (e) {
    console.error('[ingresos] por-categoria', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
