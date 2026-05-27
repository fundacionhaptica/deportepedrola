-- 01_limpiar_mojibake_y_duplicados.sql
-- Limpia los nombres corruptos por mojibake y duplicados en la tabla facturas.
--
-- Generado: 2026-05-27 por sesión Cowork. v2: añadida eliminación del id=30
-- (duplicado oculto por mojibake, detectado tras el ROLLBACK del primer intento).
--
-- Estrategia:
--   1. Borrar duplicados (manteniendo el ID más bajo, que fue el primer insert).
--   2. Reparar mojibake con REPLACE puntuales (Âª→ª, Âº→º, Ã­→í).
--   3. Verificar en la misma transacción que mojibake=0 y duplicados=0.
--   4. Sólo COMMIT si la verificación pasa, si no ROLLBACK.

BEGIN;

DELETE FROM facturas WHERE id = 8;
DELETE FROM facturas WHERE id = 12;
DELETE FROM facturas WHERE id = 30;  -- '7ª GESTORIA' limpio, duplica al id=26 con mojibake

UPDATE facturas SET nombre_archivo = REPLACE(nombre_archivo, 'Ã­', 'í')
WHERE nombre_archivo LIKE '%Ã­%';

UPDATE facturas SET nombre_archivo = REPLACE(nombre_archivo, 'Âª', 'ª')
WHERE nombre_archivo LIKE '%Âª%';

UPDATE facturas SET nombre_archivo = REPLACE(nombre_archivo, 'Âº', 'º')
WHERE nombre_archivo LIKE '%Âº%';

DO $$
DECLARE
  v_mojibake INTEGER;
  v_duplicados INTEGER;
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_mojibake FROM facturas WHERE nombre_archivo ~ 'Ã|Â';
  SELECT COUNT(*) - COUNT(DISTINCT nombre_archivo) INTO v_duplicados FROM facturas;
  SELECT COUNT(*) INTO v_total FROM facturas;

  RAISE NOTICE 'Mojibake restante: %', v_mojibake;
  RAISE NOTICE 'Duplicados restantes: %', v_duplicados;
  RAISE NOTICE 'Total facturas: %', v_total;

  IF v_mojibake > 0 THEN
    RAISE EXCEPTION 'FAIL: queda mojibake (%) tras la limpieza, no commit', v_mojibake;
  END IF;

  IF v_duplicados > 0 THEN
    RAISE EXCEPTION 'FAIL: quedan duplicados (%) tras la limpieza, no commit', v_duplicados;
  END IF;

  IF v_total <> 99 THEN
    RAISE EXCEPTION 'FAIL: total esperado 99 (102-3 duplicados), got %', v_total;
  END IF;

  RAISE NOTICE 'OK: BD limpia. Mojibake=0, duplicados=0, total=99.';
END $$;

COMMIT;