-- 14_fix_signo_importes.sql
-- Corrige importes positivos en facturas de tipo gasto (deberían ser negativos).
-- SEGURO: solo toca filas con importe > 0 en tipos de gasto.
-- Los registros corregidos manualmente (ya negativos) NO se modifican.

BEGIN;

-- ── 1. facturas ──────────────────────────────────────────────────────────────
UPDATE facturas
   SET importe = -importe
 WHERE importe > 0
   AND tipo IN (
     'factura_recibo',
     'justificante_bancario',
     'gasto_bancario',
     'factura',
     'licencias',
     'recibo_arbitraje'
   );

-- ── 2. factura_distribuciones ─────────────────────────────────────────────────
-- Las líneas de distribución heredan el signo de su factura padre.
UPDATE factura_distribuciones fd
   SET importe = -fd.importe
  FROM facturas f
 WHERE fd.factura_id = f.id
   AND fd.importe > 0
   AND f.tipo IN (
     'factura_recibo',
     'justificante_bancario',
     'gasto_bancario',
     'factura',
     'licencias',
     'recibo_arbitraje'
   );

-- ── Verificación ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_fact_pos INTEGER;
  n_dist_pos INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_fact_pos
    FROM facturas
   WHERE importe > 0
     AND tipo IN ('factura_recibo','justificante_bancario','gasto_bancario',
                  'factura','licencias','recibo_arbitraje');

  SELECT COUNT(*) INTO n_dist_pos
    FROM factura_distribuciones fd
    JOIN facturas f ON f.id = fd.factura_id
   WHERE fd.importe > 0
     AND f.tipo IN ('factura_recibo','justificante_bancario','gasto_bancario',
                    'factura','licencias','recibo_arbitraje');

  RAISE NOTICE 'Gastos positivos restantes en facturas: % (esperado: 0)', n_fact_pos;
  RAISE NOTICE 'Gastos positivos restantes en distribuciones: % (esperado: 0)', n_dist_pos;

  IF n_fact_pos > 0 OR n_dist_pos > 0 THEN
    RAISE EXCEPTION 'Quedan filas positivas — revisión necesaria';
  END IF;
END $$;

COMMIT;