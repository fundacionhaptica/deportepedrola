-- 32_conciliacion_parcial.sql
-- ============================================================
-- Corrige la logica de conciliacion para pagos de saldo (federacion, mutuas):
--
--   ANTES: COALESCE(c.importe_conciliado, justificante.importe)
--          -> una factura de 150 EUR contra un justificante de 1000 EUR
--             mostraba 1000 EUR cubiertos -> 'discrepancia'
--
--   AHORA: COALESCE(c.importe_conciliado, factura.importe)
--          -> la factura de 150 EUR queda como 'completo'
--          -> el justificante de 1000 EUR queda como 'parcial' con
--             saldo_pendiente = 850 EUR, hasta que se asignen mas facturas
--
-- Nuevos estados:
--   parcial  -- justificante con conciliaciones pero queda saldo (importe > consumido + 1)
--
-- Nueva columna en la vista:
--   saldo_pendiente  -- EUR que quedan por asignar en el justificante
--
-- Idempotente.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS v_conciliacion_estado CASCADE;

CREATE VIEW v_conciliacion_estado AS
WITH factura_conc AS (
  -- Cuanto de la factura ha sido cubierto.
  -- Default: el importe de la propia factura (no el del justificante).
  SELECT c.factura_id AS id,
         SUM(COALESCE(c.importe_conciliado, f_inv.importe)) AS importe_conciliado,
         array_agg(c.justificante_id ORDER BY c.justificante_id) AS otros_ids
  FROM conciliaciones c
  JOIN facturas f_inv ON f_inv.id = c.factura_id
  GROUP BY c.factura_id
), justif_conc AS (
  -- Cuanto del justificante ha sido consumido por facturas vinculadas.
  -- Default: el importe de cada factura (cuanto consumio del saldo).
  SELECT c.justificante_id AS id,
         SUM(COALESCE(c.importe_conciliado, f_inv.importe)) AS importe_conciliado,
         array_agg(c.factura_id ORDER BY c.factura_id) AS otros_ids
  FROM conciliaciones c
  JOIN facturas f_inv ON f_inv.id = c.factura_id
  GROUP BY c.justificante_id
)
SELECT
  f.id, f.tipo, f.fecha_factura, f.proveedor, f.numero_factura, f.concepto,
  f.importe, f.deporte, f.equipo_categoria, f.categoria_ingreso,
  CASE
    WHEN f.tipo = 'factura_recibo'                             THEN 'gasto'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario')  THEN 'salida_banco'
    WHEN f.tipo = 'ingreso_cobro'                              THEN 'entrada_banco'
    ELSE 'otro'
  END AS lado,
  -- IDs de los documentos cruzados
  CASE
    WHEN f.tipo = 'factura_recibo'
      THEN COALESCE(fc.otros_ids, ARRAY[]::int[])
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','ingreso_cobro')
      THEN COALESCE(jc.otros_ids, ARRAY[]::int[])
    ELSE ARRAY[]::int[]
  END AS conciliada_con,
  -- Importe total conciliado
  CASE
    WHEN f.tipo = 'factura_recibo'
      THEN COALESCE(fc.importe_conciliado, 0)
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario','ingreso_cobro')
      THEN COALESCE(jc.importe_conciliado, 0)
    ELSE 0
  END AS importe_conciliado,
  -- Saldo pendiente: solo relevante para justificantes/gastos bancarios
  CASE
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario')
      THEN GREATEST(0, COALESCE(f.importe, 0) - COALESCE(jc.importe_conciliado, 0))
    ELSE 0
  END AS saldo_pendiente,
  -- Estado de conciliacion
  CASE
    -- Factura/recibo
    WHEN f.tipo = 'factura_recibo' AND fc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - fc.importe_conciliado) <= 1
      THEN 'completo'
    WHEN f.tipo = 'factura_recibo' AND fc.importe_conciliado IS NOT NULL
      THEN 'discrepancia'
    WHEN f.tipo = 'factura_recibo'
      THEN 'falta_justificante'
    -- Justificante / gasto bancario
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario')
         AND jc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - jc.importe_conciliado) <= 1
      THEN 'completo'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario')
         AND jc.importe_conciliado IS NOT NULL
         AND jc.importe_conciliado < COALESCE(f.importe,0) - 1
      THEN 'parcial'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario')
         AND jc.importe_conciliado IS NOT NULL
      THEN 'discrepancia'
    WHEN f.tipo IN ('justificante_bancario','gasto_bancario')
      THEN 'falta_factura'
    -- Ingreso / cobro
    WHEN f.tipo = 'ingreso_cobro' AND jc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - jc.importe_conciliado) <= 1
      THEN 'completo'
    WHEN f.tipo = 'ingreso_cobro' AND jc.importe_conciliado IS NOT NULL
      THEN 'discrepancia'
    WHEN f.tipo = 'ingreso_cobro'
      THEN 'falta_factura'
    ELSE 'na'
  END AS estado_conciliacion
FROM facturas f
LEFT JOIN factura_conc fc ON fc.id = f.id
LEFT JOIN justif_conc  jc ON jc.id = f.id
WHERE f.tipo IN ('factura_recibo','justificante_bancario','gasto_bancario','ingreso_cobro');

-- Verificacion rapida
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '=== v_conciliacion_estado tras migracion parcial ===';
  FOR r IN
    SELECT estado_conciliacion, lado, COUNT(*) AS n,
           COALESCE(SUM(importe),0)::numeric(12,2) AS importe_total
    FROM v_conciliacion_estado
    GROUP BY estado_conciliacion, lado
    ORDER BY lado, estado_conciliacion
  LOOP
    RAISE NOTICE '  %-12s | %-14s -> % registros  (% EUR)',
      r.lado, r.estado_conciliacion, r.n, r.importe_total;
  END LOOP;
END $$;

COMMIT;