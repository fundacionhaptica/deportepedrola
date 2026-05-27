-- 03_recalcular_importes_facturas.sql
-- Recalcula facturas.importe = SUM(factura_distribuciones.importe) para las
-- 3 facturas históricas (AUTOBUSES ENERO26, FEDERACIÓN BALONCESTO,
-- COMITE TECNICO ENTRENADORES 4) que se importaron con bug del antiguo
-- importar-facturas.py (sólo primera línea en lugar del total).
-- Idempotente: sólo toca filas con desajuste > 0.01 EUR.

BEGIN;

UPDATE facturas f
SET importe        = sub.sum_d,
    base_imponible = sub.sum_d,
    iva_importe    = 0
FROM (
  SELECT factura_id, SUM(importe) AS sum_d
  FROM factura_distribuciones
  GROUP BY factura_id
) sub
WHERE f.id = sub.factura_id
  AND ABS(f.importe - sub.sum_d) > 0.01;

DO $a$
DECLARE v_desajuste INT;
BEGIN
  SELECT COUNT(*) INTO v_desajuste
  FROM facturas f
  JOIN (SELECT factura_id, SUM(importe) AS sd FROM factura_distribuciones GROUP BY factura_id) d
    ON d.factura_id = f.id
  WHERE ABS(f.importe - d.sd) > 0.01;

  RAISE NOTICE 'Facturas con desajuste tras UPDATE: %', v_desajuste;
  IF v_desajuste > 0 THEN
    RAISE EXCEPTION 'FAIL: quedan % facturas desajustadas', v_desajuste;
  END IF;
  RAISE NOTICE 'OK: todas las facturas con distribuciones cuadran';
END $a$;

COMMIT;