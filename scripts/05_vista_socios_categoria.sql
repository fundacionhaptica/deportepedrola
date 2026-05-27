-- 05_vista_socios_categoria.sql
-- Vista que calcula la categoría deportiva por edad de cada socio.
-- Se recalcula automáticamente cada vez que se consulta (es vista, no tabla),
-- así que NO hay que mantener cron ni triggers cuando los socios cumplen años.
--
-- Categorías alineadas con el prompt facturas.deporte-pedrola.v3.txt y los valores
-- válidos del Excel Movimientos_caja.xlsx:
--   Escuelas (sub-6), Prebenjamín (sub-8), Benjamín (sub-10),
--   Alevín (sub-12), Infantil (sub-14), Cadete (sub-16),
--   Juvenil (sub-18), Junior (sub-20), Senior (20-34), Veteranos (35+),
--   'Sin fecha' (fecha_nacimiento NULL), 'Anómalo' (edad < 0 o > 90)
--
-- Añade también el flag es_jjee_calculado: true si edad <= 15 (categorías
-- elegibles para Juegos Escolares de Aragón: Prebenjamín, Benjamín, Alevín,
-- Infantil, Cadete). Convive con la columna es_jjee manual de socios.
--
-- Uso:
--   SELECT * FROM v_socios_con_categoria WHERE categoria = 'Cadete';
--   SELECT categoria, COUNT(*) FROM v_socios_con_categoria GROUP BY categoria;

CREATE OR REPLACE VIEW v_socios_con_categoria AS
SELECT
  s.*,
  CASE
    WHEN s.fecha_nacimiento IS NULL THEN NULL
    ELSE EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int
  END AS edad,
  CASE
    WHEN s.fecha_nacimiento IS NULL THEN 'Sin fecha'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 0
         OR EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int > 90 THEN 'Anómalo'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 6  THEN 'Escuelas'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 8  THEN 'Prebenjamín'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 10 THEN 'Benjamín'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 12 THEN 'Alevín'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 14 THEN 'Infantil'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 16 THEN 'Cadete'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 18 THEN 'Juvenil'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 20 THEN 'Junior'
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int < 35 THEN 'Senior'
    ELSE 'Veteranos'
  END AS categoria,
  -- Elegible para JJEE (Juegos Escolares Aragón): Prebenjamín a Cadete
  CASE
    WHEN s.fecha_nacimiento IS NULL THEN false
    WHEN EXTRACT(YEAR FROM AGE(s.fecha_nacimiento))::int BETWEEN 6 AND 15 THEN true
    ELSE false
  END AS es_jjee_calculado
FROM socios s;

-- Comprobación
DO $a$
DECLARE
  v_total INT;
  v_anomalos INT;
  v_sin_fecha INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM v_socios_con_categoria;
  SELECT COUNT(*) INTO v_anomalos FROM v_socios_con_categoria WHERE categoria = 'Anómalo';
  SELECT COUNT(*) INTO v_sin_fecha FROM v_socios_con_categoria WHERE categoria = 'Sin fecha';
  RAISE NOTICE 'Vista creada con % socios (% anómalos, % sin fecha)', v_total, v_anomalos, v_sin_fecha;
END $a$;