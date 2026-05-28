-- 10_generar_cuotas_2025_2026.sql
-- Genera las cuotas_socio para la temporada 2025/2026.
--
-- Reglas (confirmadas con Jaime 2026-05-27):
--   1) Multi-deporte: cada deporte paga su precio completo (suma sin descuento).
--   2) JJEE vs regular por edad: <= 15 años → JJEE, > 15 → regular.
--   3) Si el deporte no tiene precio_jjee (NULL), se usa precio_regular como fallback.
--   4) Sólo socios.activo = true.
--
-- Idempotente: usa ON CONFLICT (socio_id, temporada, tipo, deporte) DO NOTHING.
--
-- Resultado esperado: cientos de filas (cada socio paga 1 cuota por deporte inscrito).

BEGIN;

-- Generar cuotas: una fila por (socio, deporte_inscrito)
INSERT INTO cuotas_socio
  (socio_id, temporada, tipo, deporte, categoria, concepto, importe, incluye_desplazamiento, pagado)
SELECT
  s.id,
  '2025/2026',
  'cuota_deporte',
  d.deporte,
  CASE WHEN COALESCE(EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int, 99) <= 15
       THEN 'jjee'
       ELSE 'regular'
  END                                                  AS categoria,
  'Cuota ' || d.deporte || ' ' || '2025/2026'          AS concepto,
  CASE WHEN COALESCE(EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int, 99) <= 15
       THEN COALESCE(p.precio_jjee, p.precio_regular)
       ELSE p.precio_regular
  END                                                  AS importe,
  false,                                                  -- desplazamiento se decide cuando hay calendario
  false                                                   -- pagado=false hasta confirmar cobro
FROM socios s
CROSS JOIN LATERAL (VALUES
  ('atletismo',  s.act_atletismo),
  ('baloncesto', s.act_baloncesto),
  ('f7',         s.act_f7),
  ('futbol',     s.act_futbol),
  ('fs',         s.act_fs),
  ('g_ritmica',  s.act_g_ritmica),
  ('kenpo',      s.act_kenpo),
  ('kickboxing', s.act_kickboxing),
  ('patinaje',   s.act_patinaje),
  ('trail',      s.act_trail),
  ('voleibol',   s.act_voleibol),
  ('dirigidas',  s.act_dirigidas)
) AS d(deporte, activo)
JOIN precios_actividades p ON p.actividad = d.deporte
WHERE s.activo = true
  AND d.activo = true
  AND p.precio_regular > 0
ON CONFLICT (socio_id, temporada, tipo, deporte) DO NOTHING;

DO $a$
DECLARE
  v_cuotas    INT;
  v_socios    INT;
  v_total     NUMERIC(10,2);
  v_jjee      INT;
  v_regular   INT;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT socio_id), SUM(importe)
    INTO v_cuotas, v_socios, v_total
    FROM cuotas_socio WHERE temporada = '2025/2026';
  SELECT COUNT(*) FILTER (WHERE categoria='jjee'),
         COUNT(*) FILTER (WHERE categoria='regular')
    INTO v_jjee, v_regular
    FROM cuotas_socio WHERE temporada = '2025/2026';
  RAISE NOTICE 'Cuotas generadas: % (socios con cuota: %, total %.2 EUR)', v_cuotas, v_socios, v_total;
  RAISE NOTICE 'Distribución por categoría: % JJEE, % regular', v_jjee, v_regular;
  IF v_cuotas = 0 THEN
    RAISE EXCEPTION 'FAIL: no se generó ninguna cuota';
  END IF;
END $a$;

COMMIT;