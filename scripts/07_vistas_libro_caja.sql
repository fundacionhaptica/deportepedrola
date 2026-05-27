-- 07_vistas_libro_caja.sql
-- Vistas que unifican datos de facturas + distribuciones + movimientos + pagos
-- para el libro de caja y los resumenes del dashboard.
--
-- Replican la estructura del Libro_Caja_DeportePedrola_v4.xlsx que lleva
-- el usuario manualmente, para que el dashboard genere los mismos números
-- en tiempo real (sin export manual).
--
-- VISTAS CREADAS:
--   v_libro_caja          → todos los gastos e ingresos unificados (cronológico)
--   v_resumen_deporte     → agregado por deporte (importe, IVA, total, nº registros, coste/usuario)
--   v_resumen_concepto    → agregado por concepto (Federación, Arbitraje, etc.)
--   v_resumen_equipo      → agregado por deporte + equipo (con usuarios y coste/usuario)
--   v_socios_por_deporte  → conteo de socios por deporte (para denominador de coste/usuario)

BEGIN;

-- ============================================================
-- v_socios_por_deporte: conteo de socios para cada deporte
-- ============================================================
CREATE OR REPLACE VIEW v_socios_por_deporte AS
SELECT 'Atletismo'        AS deporte, COUNT(*) FILTER (WHERE act_atletismo)  AS usuarios FROM socios WHERE activo
UNION ALL SELECT 'Baloncesto',       COUNT(*) FILTER (WHERE act_baloncesto)  FROM socios WHERE activo
UNION ALL SELECT 'F7',               COUNT(*) FILTER (WHERE act_f7)          FROM socios WHERE activo
UNION ALL SELECT 'Fútbol',           COUNT(*) FILTER (WHERE act_futbol)      FROM socios WHERE activo
UNION ALL SELECT 'Fútbol Sala',      COUNT(*) FILTER (WHERE act_fs)          FROM socios WHERE activo
UNION ALL SELECT 'Gimnasia Rítmica', COUNT(*) FILTER (WHERE act_g_ritmica)   FROM socios WHERE activo
UNION ALL SELECT 'Kenpo',            COUNT(*) FILTER (WHERE act_kenpo)       FROM socios WHERE activo
UNION ALL SELECT 'Kickboxing',       COUNT(*) FILTER (WHERE act_kickboxing)  FROM socios WHERE activo
UNION ALL SELECT 'Patinaje',         COUNT(*) FILTER (WHERE act_patinaje)    FROM socios WHERE activo
UNION ALL SELECT 'Trail',            COUNT(*) FILTER (WHERE act_trail)       FROM socios WHERE activo
UNION ALL SELECT 'Voleibol',         COUNT(*) FILTER (WHERE act_voleibol)    FROM socios WHERE activo
UNION ALL SELECT 'Act. Dirigidas',   COUNT(*) FILTER (WHERE act_dirigidas)   FROM socios WHERE activo
UNION ALL SELECT 'Pádel',            0  -- Pádel no tiene columna act_padel; cuando se cree, actualizar aquí
UNION ALL SELECT 'Club',             COUNT(*) FROM socios WHERE activo  -- gastos generales: denominador = todos
;

-- ============================================================
-- v_libro_caja: cronológico de TODOS los movimientos económicos del club
-- Combina gastos (facturas) + ingresos (pagos Stripe) + manuales (movimientos)
-- ============================================================
CREATE OR REPLACE VIEW v_libro_caja AS
  -- Gastos con factura
  SELECT
    'gasto'::text          AS tipo,
    f.fecha_factura        AS fecha,
    f.concepto             AS concepto,
    f.proveedor            AS contraparte,
    f.deporte              AS deporte,
    f.equipo_categoria     AS equipo_categoria,
    f.importe              AS importe,
    f.nombre_archivo       AS referencia,
    'factura:' || f.id::text AS origen
  FROM facturas f
  WHERE f.fecha_factura IS NOT NULL
  -- Movimientos manuales (gastos sin factura, ingresos, adelantos)
  UNION ALL
  SELECT
    m.tipo,
    m.fecha,
    m.concepto,
    NULL::text             AS contraparte,
    NULL::text             AS deporte,
    NULL::text             AS equipo_categoria,
    CASE WHEN m.tipo = 'gasto' THEN -m.importe ELSE m.importe END AS importe,
    m.referencia,
    'movimiento:' || m.id::text AS origen
  FROM movimientos m
  WHERE m.es_tesoreria = false  -- adelantos del presidente excluidos del libro real
  -- Pagos Stripe pagados (ingresos)
  UNION ALL
  SELECT
    'ingreso'::text,
    p.fecha,
    p.concepto,
    s.nombre || ' ' || COALESCE(s.apellidos, '') AS contraparte,
    NULL::text,
    NULL::text,
    p.importe,
    p.stripe_pi_id,
    'pago:' || p.id::text
  FROM pagos p
  LEFT JOIN socios s ON s.id = p.socio_id
  WHERE p.estado = 'pagado';

-- ============================================================
-- v_resumen_deporte: agregado por deporte usando factura_distribuciones
-- (mejor granularidad que usar facturas.deporte, porque las facturas
--  con varios deportes desglosan correctamente)
-- ============================================================
CREATE OR REPLACE VIEW v_resumen_deporte AS
SELECT
  d.deporte,
  COUNT(*) AS num_registros,
  ROUND(SUM(d.importe)::numeric, 2) AS total_eur,
  spd.usuarios,
  CASE WHEN spd.usuarios > 0
       THEN ROUND((SUM(d.importe) / spd.usuarios)::numeric, 2)
       ELSE NULL
  END AS coste_por_usuario
FROM factura_distribuciones d
LEFT JOIN v_socios_por_deporte spd ON spd.deporte = d.deporte
GROUP BY d.deporte, spd.usuarios
ORDER BY total_eur DESC NULLS LAST;

-- ============================================================
-- v_resumen_concepto: agregado por concepto contable
-- ============================================================
CREATE OR REPLACE VIEW v_resumen_concepto AS
SELECT
  d.concepto,
  COUNT(*) AS num_registros,
  ROUND(SUM(d.importe)::numeric, 2) AS total_eur
FROM factura_distribuciones d
GROUP BY d.concepto
ORDER BY total_eur DESC NULLS LAST;

-- ============================================================
-- v_resumen_equipo: agregado por deporte + equipo/categoría
-- (replica la hoja 'Propuesta' del Excel: usuarios + gasto/equipo)
-- ============================================================
CREATE OR REPLACE VIEW v_resumen_equipo AS
SELECT
  d.deporte,
  d.equipo_categoria,
  COUNT(*) AS num_registros,
  ROUND(SUM(d.importe)::numeric, 2) AS gasto_equipo_eur
FROM factura_distribuciones d
GROUP BY d.deporte, d.equipo_categoria
ORDER BY d.deporte, gasto_equipo_eur DESC;

-- ============================================================
-- Verificación
-- ============================================================
DO $a$
DECLARE
  v_libro INT;
  v_resumen_dep INT;
  v_resumen_conc INT;
BEGIN
  SELECT COUNT(*) INTO v_libro FROM v_libro_caja;
  SELECT COUNT(*) INTO v_resumen_dep FROM v_resumen_deporte;
  SELECT COUNT(*) INTO v_resumen_conc FROM v_resumen_concepto;
  RAISE NOTICE 'v_libro_caja: % filas', v_libro;
  RAISE NOTICE 'v_resumen_deporte: % deportes', v_resumen_dep;
  RAISE NOTICE 'v_resumen_concepto: % conceptos', v_resumen_conc;
END $a$;

COMMIT;