-- 29_nuevos_tipos.sql
-- ============================================================
-- Reduce los tipos de documento a 5 categorias operativas:
--   factura_recibo         <- factura, Factura, recibo, licencias, recibo_arbitraje, recibo_premio
--   justificante_bancario  <- sin cambio
--   gasto_bancario         <- sin cambio
--   ingreso_cobro          <- cobro_bancario, extracto_tpv, extracto_cuenta, devolucion, Ingreso
--   notificacion_otros     <- notificacion
-- ============================================================

BEGIN;

-- 1. Migrar tipos existentes (incluye variantes con mayusculas)
UPDATE facturas SET tipo = 'factura_recibo'
  WHERE tipo IN ('factura','Factura','recibo','licencias','recibo_arbitraje','recibo_premio');

UPDATE facturas SET tipo = 'ingreso_cobro'
  WHERE tipo IN ('cobro_bancario','extracto_tpv','extracto_cuenta','devolucion','Ingreso');

UPDATE facturas SET tipo = 'notificacion_otros'
  WHERE tipo IN ('notificacion');

-- 2. Recrear vista de conciliacion con los nuevos tipos
DROP VIEW IF EXISTS v_conciliacion_estado CASCADE;

CREATE VIEW v_conciliacion_estado AS
WITH factura_conc AS (
  SELECT c.factura_id AS id,
         SUM(COALESCE(c.importe_conciliado, j.importe)) AS importe_conciliado,
         array_agg(c.justificante_id ORDER BY c.justificante_id) AS otros_ids
  FROM conciliaciones c
  JOIN facturas j ON j.id = c.justificante_id
  GROUP BY c.factura_id
), justif_conc AS (
  SELECT c.justificante_id AS id,
         SUM(COALESCE(c.importe_conciliado, f.importe)) AS importe_conciliado,
         array_agg(c.factura_id ORDER BY c.factura_id) AS otros_ids
  FROM conciliaciones c
  JOIN facturas f ON f.id = c.factura_id
  GROUP BY c.justificante_id
)
SELECT
  f.id, f.tipo, f.fecha_factura, f.proveedor, f.numero_factura, f.concepto,
  f.importe, f.deporte, f.equipo_categoria, f.categoria_ingreso,
  CASE
    WHEN f.tipo = 'factura_recibo'                                   THEN 'gasto'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario')        THEN 'salida_banco'
    WHEN f.tipo = 'ingreso_cobro'                                    THEN 'entrada_banco'
    ELSE 'otro'
  END AS lado,
  CASE
    WHEN f.tipo = 'factura_recibo'
      THEN COALESCE(fc.otros_ids, ARRAY[]::int[])
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','ingreso_cobro')
      THEN COALESCE(jc.otros_ids, ARRAY[]::int[])
    ELSE ARRAY[]::int[]
  END AS conciliada_con,
  CASE
    WHEN f.tipo = 'factura_recibo'
      THEN COALESCE(fc.importe_conciliado, 0)
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','ingreso_cobro')
      THEN COALESCE(jc.importe_conciliado, 0)
    ELSE 0
  END AS importe_conciliado,
  CASE
    -- Gasto: factura_recibo
    WHEN f.tipo = 'factura_recibo' AND fc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - fc.importe_conciliado) <= 1 THEN 'completo'
    WHEN f.tipo = 'factura_recibo' AND fc.importe_conciliado IS NOT NULL THEN 'discrepancia'
    WHEN f.tipo = 'factura_recibo' THEN 'falta_justificante'
    -- Banco salida
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario') AND jc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - jc.importe_conciliado) <= 1 THEN 'completo'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario') AND jc.importe_conciliado IS NOT NULL THEN 'discrepancia'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario') THEN 'falta_factura'
    -- Banco entrada
    WHEN f.tipo = 'ingreso_cobro' AND jc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - jc.importe_conciliado) <= 1 THEN 'completo'
    WHEN f.tipo = 'ingreso_cobro' AND jc.importe_conciliado IS NOT NULL THEN 'discrepancia'
    WHEN f.tipo = 'ingreso_cobro' THEN 'falta_factura'
    ELSE 'na'
  END AS estado_conciliacion
FROM facturas f
LEFT JOIN factura_conc fc ON fc.id = f.id
LEFT JOIN justif_conc  jc ON jc.id = f.id
WHERE f.tipo IN ('factura_recibo','justificante_bancario','gasto_bancario','ingreso_cobro');

DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '=== Tipos tras migracion ===';
  FOR r IN SELECT tipo, COUNT(*) AS n FROM facturas GROUP BY tipo ORDER BY tipo LOOP
    RAISE NOTICE '  % -> %', r.tipo, r.n;
  END LOOP;
END $$;

COMMIT;