-- 26_cuotas_escuelas.sql
-- ============================================================
-- Escuelas (categoria <= 5 años): régimen especial de cuota.
--
-- 2025/2026: 20€ únicos por socio (ya pagados todos).
-- 2026/2027: 3 plazos de 20€ (junio 2026, enero 2027, abril 2027).
--
-- Borra las cuotas actuales 2025/2026 de socios Escuelas (deportes
-- individuales a 27€/45€) y las sustituye por la cuota Escuelas única.
-- Idempotente.
-- ============================================================

BEGIN;

-- 1) Borrar cuotas viejas 2025/2026 de Escuelas
DELETE FROM cuotas_socio
WHERE temporada = '2025/2026'
  AND socio_id IN (SELECT id FROM v_socios_con_categoria WHERE categoria = 'Escuelas');

-- 2) Insertar cuota Escuelas 2025/2026 (20€, pagada)
-- Como la UNIQUE constraint es (socio_id, temporada, tipo, deporte),
-- usamos tipo='cuota_escuelas' y deporte='escuelas' para no chocar con
-- otras filas.
INSERT INTO cuotas_socio
  (socio_id, temporada, tipo, deporte, concepto, importe, pagado, pagado_fecha, pagado_metodo)
SELECT s.id, '2025/2026', 'cuota_escuelas', 'escuelas',
       'Cuota Escuelas 2025/2026 (pago único)',
       20.00, true, CURRENT_DATE, 'global_escuelas_2025'
FROM v_socios_con_categoria s
WHERE s.categoria = 'Escuelas' AND s.activo = true
ON CONFLICT (socio_id, temporada, tipo, deporte) DO UPDATE
  SET importe = 20.00, pagado = true,
      concepto = 'Cuota Escuelas 2025/2026 (pago único)';

-- 3) Insertar las 3 cuotas 2026/2027 (sin pagar aún, fechas específicas)
-- Las fechas se reflejan en concepto + pagado_fecha NULL.
-- Plazo 1: junio 2026 (inscripción)
INSERT INTO cuotas_socio
  (socio_id, temporada, tipo, deporte, concepto, importe, pagado)
SELECT s.id, '2026/2027', 'cuota_escuelas', 'escuelas_jun2026',
       'Cuota Escuelas 2026/2027 - 1º plazo (junio 2026)',
       20.00, false
FROM v_socios_con_categoria s
WHERE s.categoria = 'Escuelas' AND s.activo = true
ON CONFLICT (socio_id, temporada, tipo, deporte) DO NOTHING;

-- Plazo 2: enero 2027
INSERT INTO cuotas_socio
  (socio_id, temporada, tipo, deporte, concepto, importe, pagado)
SELECT s.id, '2026/2027', 'cuota_escuelas', 'escuelas_ene2027',
       'Cuota Escuelas 2026/2027 - 2º plazo (enero 2027)',
       20.00, false
FROM v_socios_con_categoria s
WHERE s.categoria = 'Escuelas' AND s.activo = true
ON CONFLICT (socio_id, temporada, tipo, deporte) DO NOTHING;

-- Plazo 3: abril 2027
INSERT INTO cuotas_socio
  (socio_id, temporada, tipo, deporte, concepto, importe, pagado)
SELECT s.id, '2026/2027', 'cuota_escuelas', 'escuelas_abr2027',
       'Cuota Escuelas 2026/2027 - 3º plazo (abril 2027)',
       20.00, false
FROM v_socios_con_categoria s
WHERE s.categoria = 'Escuelas' AND s.activo = true
ON CONFLICT (socio_id, temporada, tipo, deporte) DO NOTHING;

-- Verificacion
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE 'Cuotas Escuelas:';
  FOR r IN SELECT temporada, COUNT(*) AS n,
                  SUM(importe) AS total,
                  COUNT(*) FILTER (WHERE pagado) AS pagadas
           FROM cuotas_socio
           WHERE tipo = 'cuota_escuelas'
           GROUP BY temporada ORDER BY temporada LOOP
    RAISE NOTICE '  % -> % cuotas, % EUR, % pagadas', r.temporada, r.n, r.total, r.pagadas;
  END LOOP;
END $$;

COMMIT;