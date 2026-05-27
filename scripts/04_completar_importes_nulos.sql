-- 04_completar_importes_nulos.sql
-- Completa facturas.importe (NULL) con la suma de sus distribuciones.
-- Afecta a 5 facturas históricas que se importaron con importe NULL pero
-- tienen distribuciones desde Movimientos_caja.xlsx:
--   id 18, 21, 24: ingresos de cuotas (4.- 5.- 6.- 19092025)
--   id 27, 28: premios Maratón FS (9º al 16º, 17º al 32º)
--
-- Idempotente: sólo toca filas con importe IS NULL y al menos una distribución.

BEGIN;

UPDATE facturas f
SET importe        = sub.sum_d,
    base_imponible = COALESCE(f.base_imponible, sub.sum_d),
    iva_importe    = COALESCE(f.iva_importe, 0)
FROM (
  SELECT factura_id, SUM(importe) AS sum_d
  FROM factura_distribuciones
  GROUP BY factura_id
) sub
WHERE f.id = sub.factura_id
  AND f.importe IS NULL;

DO $a$
DECLARE
  v_null_con_distrib INT;
  v_diff_facturas_vs_distrib NUMERIC(10,2);
BEGIN
  SELECT COUNT(*) INTO v_null_con_distrib
  FROM facturas f
  WHERE f.importe IS NULL
    AND EXISTS (SELECT 1 FROM factura_distribuciones d WHERE d.factura_id = f.id);

  SELECT ROUND((SUM(f.importe) - (SELECT SUM(importe) FROM factura_distribuciones))::numeric, 2)
    INTO v_diff_facturas_vs_distrib
  FROM facturas f
  WHERE EXISTS (SELECT 1 FROM factura_distribuciones d WHERE d.factura_id = f.id);

  RAISE NOTICE 'Facturas con importe NULL y distribuciones: %', v_null_con_distrib;
  RAISE NOTICE 'Diferencia facturas_con_distrib vs distrib_total: % EUR', v_diff_facturas_vs_distrib;

  IF v_null_con_distrib > 0 THEN
    RAISE EXCEPTION 'FAIL: quedan % facturas con importe NULL pese a tener distribuciones', v_null_con_distrib;
  END IF;
  IF ABS(v_diff_facturas_vs_distrib) > 0.05 THEN
    RAISE EXCEPTION 'FAIL: diff facturas vs distribuciones = % EUR (>0.05)', v_diff_facturas_vs_distrib;
  END IF;
  RAISE NOTICE 'OK: facturas con distribuciones cuadran, las 2 BD-only restantes con NULL son legitimas';
END $a$;

COMMIT;