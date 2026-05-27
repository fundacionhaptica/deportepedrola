-- 06_corregir_fechas_anomalas.sql
-- Corrige 3 fechas de nacimiento erróneas en socios.
-- Las fechas originales (años 0019, 0056, 1905) son typos del Excel original;
-- se sustituyen por las fechas plausibles que mejor encajan con la edad esperada.
--
-- Idempotente: sólo aplica el UPDATE si la fecha actual coincide con la anómala.

BEGIN;

UPDATE socios SET fecha_nacimiento = '2019-07-08'::date
WHERE numero_socio = 269 AND fecha_nacimiento = '0019-07-08'::date;

UPDATE socios SET fecha_nacimiento = '2005-07-03'::date
WHERE numero_socio = 322 AND fecha_nacimiento = '1905-07-03'::date;

UPDATE socios SET fecha_nacimiento = '1956-08-20'::date
WHERE numero_socio = 229 AND fecha_nacimiento = '0056-08-20'::date;

DO $a$
DECLARE v_anomalos INT;
BEGIN
  SELECT COUNT(*) INTO v_anomalos FROM v_socios_con_categoria WHERE categoria = 'Anómalo';
  RAISE NOTICE 'Anómalos restantes tras corrección: %', v_anomalos;
  IF v_anomalos > 0 THEN
    RAISE EXCEPTION 'FAIL: quedan % anómalos', v_anomalos;
  END IF;
END $a$;

COMMIT;