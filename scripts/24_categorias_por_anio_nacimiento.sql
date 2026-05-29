-- 24_categorias_por_anio_nacimiento.sql
-- ============================================================
-- Recrea v_socios_con_categoria usando AÑO DE NACIMIENTO en vez de edad real.
-- Las categorías escolares deportivas se asignan por año natural:
--   edad_deportiva = año_actual - año_nacimiento
-- En 2026, los nacidos en 2010 ya son Juveniles (16) aunque aún tengan 15 años reales.
-- JJEE: edad_deportiva <= 16 (incluye nacidos en 2010 durante 2026).
--
-- Idempotente.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS v_socios_con_categoria CASCADE;

CREATE VIEW v_socios_con_categoria AS
SELECT s.*,
  CASE
    WHEN s.fecha_nacimiento IS NULL THEN NULL
    ELSE EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer
  END AS edad,
  CASE
    WHEN s.fecha_nacimiento IS NULL THEN 'Sin fecha'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer < 0 THEN 'Anómalo'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer > 90 THEN 'Anómalo'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 5  THEN 'Escuelas'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 7  THEN 'Prebenjamín'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 9  THEN 'Benjamín'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 11 THEN 'Alevín'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 13 THEN 'Infantil'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 15 THEN 'Cadete'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 17 THEN 'Juvenil'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 22 THEN 'Junior'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer <= 34 THEN 'Senior'
    ELSE 'Veteranos'
  END AS categoria,
  CASE
    -- JJEE: hasta los nacidos en (anio_actual - 16) inclusive
    -- En 2026: anio_nacimiento >= 2010 -> JJEE
    WHEN s.fecha_nacimiento IS NULL THEN false
    ELSE (EXTRACT(YEAR FROM CURRENT_DATE)::integer - EXTRACT(YEAR FROM s.fecha_nacimiento)::integer) <= 16
  END AS es_jjee_calculado
FROM socios s;

-- Verificacion
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE 'Reparto por categoria:';
  FOR r IN SELECT categoria, COUNT(*) AS n FROM v_socios_con_categoria GROUP BY categoria ORDER BY n DESC LOOP
    RAISE NOTICE '  %  -> %', r.categoria, r.n;
  END LOOP;
END $$;

COMMIT;