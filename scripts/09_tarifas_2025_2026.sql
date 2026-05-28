-- 09_tarifas_2025_2026.sql
-- Carga las tarifas oficiales 2025/2026 en precios_actividades.
-- Fuente: https://www.deportepedrola.com/sobre-el-club/inscríbete (27/05/2026)
--
-- Tarifas (totales anuales por socio, cuota base de 20€ ya incluida):
--   Atletismo (federado):       105 €
--   Fútbol (federado):           32 €
--   Patinaje (federado):         32 €
--   Kenpo (federado):            45 €
--   Kickboxing (federado):       45 €
--   JJEE Aragón:                 27 €
--   No federado / colaborador:   20 €
--
-- Deportes que en el club son escolares/JJEE (sin federación adulta):
--   Baloncesto, Fútbol Sala, F7, Gimnasia Rítmica, Voleibol → 27 €
-- Deportes sin JJEE pero con cuota base:
--   Trail running, Actividades Dirigidas → 20 € (no federado / colaborador)
--
-- Schema: precios_actividades(actividad PK, precio_regular, precio_jjee).
-- Idempotente: UPDATE de las 12 filas seed que ya existen.

BEGIN;

-- Atletismo: federado 105€, JJEE escolar 27€
UPDATE precios_actividades SET precio_regular = 105.00, precio_jjee = 27.00, updated_at = NOW() WHERE actividad = 'atletismo';

-- Baloncesto: escuela escolar 27€
UPDATE precios_actividades SET precio_regular = 27.00, precio_jjee = 27.00, updated_at = NOW() WHERE actividad = 'baloncesto';

-- F7 (futbol 7): JJEE 27€
UPDATE precios_actividades SET precio_regular = 27.00, precio_jjee = 27.00, updated_at = NOW() WHERE actividad = 'f7';

-- Fútbol federado: 32€, escolar JJEE: 27€
UPDATE precios_actividades SET precio_regular = 32.00, precio_jjee = 27.00, updated_at = NOW() WHERE actividad = 'futbol';

-- Fútbol Sala JJEE: 27€
UPDATE precios_actividades SET precio_regular = 27.00, precio_jjee = 27.00, updated_at = NOW() WHERE actividad = 'fs';

-- Gimnasia Rítmica JJEE: 27€
UPDATE precios_actividades SET precio_regular = 27.00, precio_jjee = 27.00, updated_at = NOW() WHERE actividad = 'g_ritmica';

-- Kenpo federado: 45€ (sin modalidad JJEE)
UPDATE precios_actividades SET precio_regular = 45.00, precio_jjee = NULL,  updated_at = NOW() WHERE actividad = 'kenpo';

-- Kickboxing federado: 45€ (sin modalidad JJEE)
UPDATE precios_actividades SET precio_regular = 45.00, precio_jjee = NULL,  updated_at = NOW() WHERE actividad = 'kickboxing';

-- Patinaje federado: 32€, escolar JJEE: 27€
UPDATE precios_actividades SET precio_regular = 32.00, precio_jjee = 27.00, updated_at = NOW() WHERE actividad = 'patinaje';

-- Trail running: no federado 20€
UPDATE precios_actividades SET precio_regular = 20.00, precio_jjee = NULL,  updated_at = NOW() WHERE actividad = 'trail';

-- Voleibol JJEE: 27€
UPDATE precios_actividades SET precio_regular = 27.00, precio_jjee = 27.00, updated_at = NOW() WHERE actividad = 'voleibol';

-- Actividades dirigidas (gym, pilates, etc.): cuota colaborador 20€
UPDATE precios_actividades SET precio_regular = 20.00, precio_jjee = NULL,  updated_at = NOW() WHERE actividad = 'dirigidas';

DO $a$
DECLARE
  v_total INT;
  v_zeros INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM precios_actividades;
  SELECT COUNT(*) INTO v_zeros FROM precios_actividades WHERE precio_regular = 0;
  RAISE NOTICE 'Tarifas cargadas: % actividades, % con precio_regular=0', v_total, v_zeros;
  IF v_zeros > 0 THEN
    RAISE EXCEPTION 'FAIL: % actividades sin precio_regular', v_zeros;
  END IF;
  RAISE NOTICE 'OK: las 12 actividades tienen tarifa 2025/2026';
END $a$;

COMMIT;