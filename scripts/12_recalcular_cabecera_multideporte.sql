-- 12_recalcular_cabecera_multideporte.sql
-- ============================================================
-- Recalcula facturas.deporte y facturas.equipo_categoria a partir de
-- factura_distribuciones cuando hay distribuciones cargadas.
--
-- Misma lógica que routes/facturas.js PATCH /:id (linea 240):
--   si distribuciones cubren >1 deporte unico -> deporte='Multiple'
--   si cubren 1 solo deporte -> ese deporte
-- Idem equipo_categoria.
--
-- Idempotente: se puede correr N veces.
-- ============================================================

BEGIN;

WITH agg AS (
  SELECT factura_id,
         COUNT(DISTINCT deporte) FILTER (WHERE deporte IS NOT NULL) AS n_dep,
         COUNT(DISTINCT equipo_categoria) FILTER (WHERE equipo_categoria IS NOT NULL) AS n_eq,
         MAX(deporte) AS un_deporte,
         MAX(equipo_categoria) AS un_equipo
  FROM factura_distribuciones
  GROUP BY factura_id
)
UPDATE facturas f SET
  deporte = CASE
    WHEN agg.n_dep = 1 THEN agg.un_deporte
    WHEN agg.n_dep > 1 THEN 'Múltiple'
    ELSE f.deporte
  END,
  equipo_categoria = CASE
    WHEN agg.n_eq = 1 THEN agg.un_equipo
    WHEN agg.n_eq > 1 THEN 'Múltiple'
    ELSE f.equipo_categoria
  END
FROM agg
WHERE f.id = agg.factura_id;

-- Verificación
DO $$
DECLARE v_multi INT; v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_multi FROM facturas WHERE deporte='Múltiple';
  SELECT COUNT(DISTINCT factura_id) INTO v_total FROM factura_distribuciones;
  RAISE NOTICE 'Facturas marcadas como Multiple deporte: %', v_multi;
  RAISE NOTICE 'Facturas con distribuciones: %', v_total;
END $$;

COMMIT;