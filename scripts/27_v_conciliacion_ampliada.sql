-- 27_v_conciliacion_ampliada.sql
-- ============================================================
-- Amplia v_conciliacion_estado para incluir todos los tipos relevantes:
--   - factura, recibo, licencias, recibo_premio, recibo_arbitraje (gastos)
--   - justificante_bancario, gasto_bancario (salidas del banco)
--   - cobro_bancario (entradas)
--
-- Los justificantes/cobros se pueden vincular contra facturas (existentes
-- o que se añadan después).
-- Idempotente.
-- ============================================================

BEGIN;

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
  -- Es "factura/gasto" si requiere justificante bancario
  CASE WHEN f.tipo IN ('factura','licencias','recibo_arbitraje','recibo_premio','recibo') THEN 'gasto'
       WHEN f.tipo IN ('justificante_bancario','gasto_bancario') THEN 'salida_banco'
       WHEN f.tipo = 'cobro_bancario' THEN 'entrada_banco'
       ELSE 'otro'
  END AS lado,
  CASE
    WHEN f.tipo IN ('factura','licencias','recibo_arbitraje','recibo_premio','recibo') THEN COALESCE(fc.otros_ids, ARRAY[]::int[])
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','cobro_bancario') THEN COALESCE(jc.otros_ids, ARRAY[]::int[])
    ELSE ARRAY[]::int[]
  END AS conciliada_con,
  CASE
    WHEN f.tipo IN ('factura','licencias','recibo_arbitraje','recibo_premio','recibo') THEN COALESCE(fc.importe_conciliado, 0)
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','cobro_bancario') THEN COALESCE(jc.importe_conciliado, 0)
    ELSE 0
  END AS importe_conciliado,
  CASE
    -- Lado gasto
    WHEN f.tipo IN ('factura','licencias','recibo_arbitraje','recibo_premio','recibo')
         AND fc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - fc.importe_conciliado) <= 1 THEN 'completo'
    WHEN f.tipo IN ('factura','licencias','recibo_arbitraje','recibo_premio','recibo')
         AND fc.importe_conciliado IS NOT NULL THEN 'discrepancia'
    WHEN f.tipo IN ('factura','licencias','recibo_arbitraje','recibo_premio','recibo') THEN 'falta_justificante'
    -- Lado banco salida/entrada
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','cobro_bancario')
         AND jc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - jc.importe_conciliado) <= 1 THEN 'completo'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','cobro_bancario')
         AND jc.importe_conciliado IS NOT NULL THEN 'discrepancia'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','cobro_bancario') THEN 'falta_factura'
    ELSE 'na'
  END AS estado_conciliacion
FROM facturas f
LEFT JOIN factura_conc fc ON fc.id = f.id
LEFT JOIN justif_conc  jc ON jc.id = f.id
WHERE f.tipo IN ('factura','licencias','recibo_arbitraje','recibo_premio','recibo',
                 'justificante_bancario','gasto_bancario','cobro_bancario');

DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE 'Conciliacion ampliada:';
  FOR r IN SELECT estado_conciliacion, lado, COUNT(*) AS n,
                  COALESCE(SUM(importe),0)::numeric AS importe_total
           FROM v_conciliacion_estado
           GROUP BY estado_conciliacion, lado
           ORDER BY lado, estado_conciliacion LOOP
    RAISE NOTICE '  % | %  ->  % (% EUR)', r.lado, r.estado_conciliacion, r.n, r.importe_total;
  END LOOP;
END $$;

COMMIT;