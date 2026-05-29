-- 25_categoria_ingreso.sql
-- ============================================================
-- Añade columna `categoria_ingreso` a facturas para clasificar todos los
-- ingresos del club en una de 4 categorías:
--   - subvencion         (ayuntamiento, federacion, etc.)
--   - cuota_socio        (las cuotas de los 420 socios)
--   - donacion           (Linde, particulares, colaboraciones)
--   - inscripcion        (cobros por inscripciones a competiciones)
--
-- Sólo se rellena para movimientos que SON ingresos:
--   tipo='cobro_bancario', o tipo='factura' con concepto de ingreso.
--
-- Idempotente.
-- ============================================================

BEGIN;

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS categoria_ingreso TEXT
  CHECK (categoria_ingreso IS NULL OR categoria_ingreso IN ('subvencion','cuota_socio','donacion','inscripcion'));

CREATE INDEX IF NOT EXISTS facturas_categoria_ingreso_idx ON facturas (categoria_ingreso) WHERE categoria_ingreso IS NOT NULL;

-- Heurística automática para los 134 cobros bancarios ya cargados
UPDATE facturas SET categoria_ingreso = 'donacion'
WHERE tipo='cobro_bancario'
  AND categoria_ingreso IS NULL
  AND (UPPER(COALESCE(proveedor,'') || ' ' || COALESCE(concepto,'')) ILIKE '%DONACION%'
       OR UPPER(COALESCE(proveedor,'') || ' ' || COALESCE(concepto,'')) ILIKE '%LINDE%WIEMANN%');

UPDATE facturas SET categoria_ingreso = 'subvencion'
WHERE tipo='cobro_bancario'
  AND categoria_ingreso IS NULL
  AND (UPPER(COALESCE(proveedor,'') || ' ' || COALESCE(concepto,'')) ~ '(AYUNTAMIENTO|SUBVENCION|FEDERACION.*FUTBOL|DGA|GOBIERNO_DE_ARAGON)');

UPDATE facturas SET categoria_ingreso = 'inscripcion'
WHERE tipo='cobro_bancario'
  AND categoria_ingreso IS NULL
  AND (UPPER(COALESCE(proveedor,'') || ' ' || COALESCE(concepto,'')) ~ '(FRONTON|FRONTENIS|PADEL|MARATON|INSCRIP|TORNEO)');

-- Lo que quede de cobro_bancario sin categorizar se queda en NULL para
-- revisión manual.

DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE 'Reparto categoria_ingreso en cobros:';
  FOR r IN SELECT COALESCE(categoria_ingreso,'(sin clasificar)') AS cat, COUNT(*) AS n,
                  COALESCE(SUM(importe),0)::numeric(10,2) AS importe
           FROM facturas WHERE tipo='cobro_bancario'
           GROUP BY categoria_ingreso ORDER BY n DESC LOOP
    RAISE NOTICE '  %  -> % (% EUR)', r.cat, r.n, r.importe;
  END LOOP;
END $$;

COMMIT;