-- 20_conciliaciones.sql
-- ============================================================
-- Tabla de conciliaciones factura <-> justificante bancario.
-- Cada fila vincula una factura comercial con un justificante (transferencia)
-- demostrando que esa factura fue pagada.
-- N:N por si una factura se paga en varias transferencias o viceversa.
-- Idempotente.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS conciliaciones (
  id                SERIAL PRIMARY KEY,
  factura_id        INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  justificante_id   INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  importe_conciliado NUMERIC(10,2),
  nota              TEXT,
  creada            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creada_por        TEXT,
  UNIQUE (factura_id, justificante_id)
);

CREATE INDEX IF NOT EXISTS conciliaciones_factura_idx ON conciliaciones (factura_id);
CREATE INDEX IF NOT EXISTS conciliaciones_justif_idx ON conciliaciones (justificante_id);

-- Vista unificada: para cada operacion (factura o justificante)
-- devuelve sus conciliaciones agregadas y estado.
CREATE OR REPLACE VIEW v_conciliacion_estado AS
WITH factura_conc AS (
  SELECT c.factura_id AS id, SUM(COALESCE(c.importe_conciliado, j.importe)) AS importe_conciliado,
         array_agg(c.justificante_id ORDER BY c.justificante_id) AS justificantes_ids
  FROM conciliaciones c
  JOIN facturas j ON j.id = c.justificante_id
  GROUP BY c.factura_id
), justif_conc AS (
  SELECT c.justificante_id AS id, SUM(COALESCE(c.importe_conciliado, f.importe)) AS importe_conciliado,
         array_agg(c.factura_id ORDER BY c.factura_id) AS facturas_ids
  FROM conciliaciones c
  JOIN facturas f ON f.id = c.factura_id
  GROUP BY c.justificante_id
)
SELECT
  f.id, f.tipo, f.fecha_factura, f.proveedor, f.numero_factura, f.concepto,
  f.importe, f.deporte, f.equipo_categoria,
  CASE
    WHEN f.tipo = 'factura' THEN COALESCE(fc.justificantes_ids, ARRAY[]::int[])
    WHEN f.tipo = 'justificante_bancario' THEN COALESCE(jc.facturas_ids, ARRAY[]::int[])
    ELSE ARRAY[]::int[]
  END AS conciliada_con,
  CASE
    WHEN f.tipo = 'factura' THEN COALESCE(fc.importe_conciliado, 0)
    WHEN f.tipo = 'justificante_bancario' THEN COALESCE(jc.importe_conciliado, 0)
    ELSE 0
  END AS importe_conciliado,
  CASE
    -- Facturas con conciliacion completa (+/- 1 EUR de tolerancia)
    WHEN f.tipo = 'factura' AND fc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - fc.importe_conciliado) <= 1 THEN 'completo'
    WHEN f.tipo = 'factura' AND fc.importe_conciliado IS NOT NULL THEN 'discrepancia'
    WHEN f.tipo = 'factura' THEN 'falta_justificante'
    -- Justificantes
    WHEN f.tipo = 'justificante_bancario' AND jc.importe_conciliado IS NOT NULL
         AND ABS(COALESCE(f.importe,0) - jc.importe_conciliado) <= 1 THEN 'completo'
    WHEN f.tipo = 'justificante_bancario' AND jc.importe_conciliado IS NOT NULL THEN 'discrepancia'
    WHEN f.tipo = 'justificante_bancario' THEN 'falta_factura'
    ELSE 'na'
  END AS estado_conciliacion
FROM facturas f
LEFT JOIN factura_conc fc ON fc.id = f.id AND f.tipo = 'factura'
LEFT JOIN justif_conc  jc ON jc.id = f.id AND f.tipo = 'justificante_bancario'
WHERE f.tipo IN ('factura', 'justificante_bancario');

DO $$
DECLARE v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM conciliaciones;
  RAISE NOTICE 'Total conciliaciones registradas: %', v_total;
END $$;

COMMIT;