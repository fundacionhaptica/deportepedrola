-- 18_precios_temporada.sql
-- ============================================================
-- Añade soporte de temporada a precios_actividades:
--   - Columna temporada (default '2025/2026' para datos existentes)
--   - Columna nombre_visible (para mostrar 'Fútbol' en vez de 'futbol')
--   - PK compuesta (actividad, temporada)
--
-- Idempotente.
-- ============================================================

BEGIN;

ALTER TABLE precios_actividades
  ADD COLUMN IF NOT EXISTS temporada TEXT NOT NULL DEFAULT '2025/2026';

ALTER TABLE precios_actividades
  ADD COLUMN IF NOT EXISTS nombre_visible TEXT;

-- Inicializar nombre_visible a partir de actividad si está NULL
UPDATE precios_actividades SET nombre_visible = CASE actividad
  WHEN 'atletismo'   THEN 'Atletismo'
  WHEN 'baloncesto'  THEN 'Baloncesto'
  WHEN 'f7'          THEN 'Fútbol 7'
  WHEN 'futbol'      THEN 'Fútbol'
  WHEN 'fs'          THEN 'Fútbol Sala'
  WHEN 'g_ritmica'   THEN 'Gimnasia Rítmica'
  WHEN 'kenpo'       THEN 'Kenpo'
  WHEN 'kickboxing'  THEN 'Kickboxing'
  WHEN 'patinaje'    THEN 'Patinaje'
  WHEN 'trail'       THEN 'Trail'
  WHEN 'voleibol'    THEN 'Voleibol'
  WHEN 'dirigidas'   THEN 'Clases dirigidas'
  ELSE INITCAP(actividad)
END
WHERE nombre_visible IS NULL;

-- Cambiar la clave primaria a (actividad, temporada)
-- Solo si la PK actual es la antigua
DO $$
DECLARE
  pk_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO pk_def
  FROM pg_constraint c
  WHERE c.conname = 'precios_actividades_pkey';

  IF pk_def = 'PRIMARY KEY (actividad)' THEN
    ALTER TABLE precios_actividades DROP CONSTRAINT precios_actividades_pkey;
    ALTER TABLE precios_actividades ADD PRIMARY KEY (actividad, temporada);
    RAISE NOTICE 'PK cambiada a (actividad, temporada)';
  ELSE
    RAISE NOTICE 'PK ya es compuesta: %', pk_def;
  END IF;
END $$;

-- Verificacion
DO $$
DECLARE v_total INT; v_temporadas INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM precios_actividades;
  SELECT COUNT(DISTINCT temporada) INTO v_temporadas FROM precios_actividades;
  RAISE NOTICE 'Total filas precios_actividades: %', v_total;
  RAISE NOTICE 'Temporadas distintas: %', v_temporadas;
END $$;

COMMIT;