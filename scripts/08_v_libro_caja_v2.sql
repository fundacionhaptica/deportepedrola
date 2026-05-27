-- 08_v_libro_caja_v2.sql
-- Normaliza signos en v_libro_caja: importes SIEMPRE positivos.
-- El tipo discrimina si es gasto o ingreso, asi facilita los SUM agrupados.
-- (En la version anterior, gastos de movimientos eran negativos y los de facturas positivos.)

BEGIN;

CREATE OR REPLACE VIEW v_libro_caja AS
  -- Gastos con factura (siempre positivos, tipo='gasto')
  SELECT
    'gasto'::text             AS tipo,
    f.fecha_factura           AS fecha,
    f.concepto                AS concepto,
    f.proveedor               AS contraparte,
    f.deporte                 AS deporte,
    f.equipo_categoria        AS equipo_categoria,
    ABS(COALESCE(f.importe, 0)) AS importe,
    f.nombre_archivo          AS referencia,
    'factura:' || f.id::text  AS origen
  FROM facturas f
  WHERE f.fecha_factura IS NOT NULL
  UNION ALL
  -- Movimientos manuales (tipo preservado, importe SIEMPRE positivo)
  SELECT
    m.tipo,
    m.fecha,
    m.concepto,
    NULL::text                AS contraparte,
    NULL::text                AS deporte,
    NULL::text                AS equipo_categoria,
    ABS(m.importe)            AS importe,
    m.referencia,
    'movimiento:' || m.id::text
  FROM movimientos m
  WHERE m.es_tesoreria = false
  UNION ALL
  -- Pagos Stripe (tipo='ingreso')
  SELECT
    'ingreso'::text,
    p.fecha,
    p.concepto,
    s.nombre || ' ' || COALESCE(s.apellidos, '') AS contraparte,
    NULL::text,
    NULL::text,
    ABS(p.importe),
    p.stripe_pi_id,
    'pago:' || p.id::text
  FROM pagos p
  LEFT JOIN socios s ON s.id = p.socio_id
  WHERE p.estado = 'pagado';

DO $a$
DECLARE v_gastos NUMERIC; v_ingresos NUMERIC; v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM v_libro_caja;
  SELECT COALESCE(SUM(importe),0) INTO v_gastos FROM v_libro_caja WHERE tipo='gasto';
  SELECT COALESCE(SUM(importe),0) INTO v_ingresos FROM v_libro_caja WHERE tipo='ingreso';
  RAISE NOTICE 'v_libro_caja: % filas | gastos=%.2 | ingresos=%.2', v_count, v_gastos, v_ingresos;
END $a$;

COMMIT;