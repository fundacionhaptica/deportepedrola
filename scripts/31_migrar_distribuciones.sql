-- 31_migrar_distribuciones.sql
-- Migra concepto y deporte en factura_distribuciones (no cubiertas por script 30)

BEGIN;

-- Deportes
UPDATE factura_distribuciones SET deporte = 'Fútbol'
  WHERE deporte IN ('Fútbol 7','Fútbol 8','Fútbol 11','Futbol 7','Futbol 8','Futbol 11');

-- Conceptos (mismos mapeos que script 30)
UPDATE factura_distribuciones SET concepto = 'Arbitrajes'                WHERE concepto IN ('Arbitraje');
UPDATE factura_distribuciones SET concepto = 'Fichas/Federacion/Licencias' WHERE concepto IN ('Fichas / Licencias','Federación','Fichas','Licencias','Fichas / Licencias');
UPDATE factura_distribuciones SET concepto = 'Ropa'                       WHERE concepto IN ('Ropa / Equipación','Ropa / Equipacion');
UPDATE factura_distribuciones SET concepto = 'Materiales'                 WHERE concepto IN ('Material deportivo','Imprenta','Seguro deportivo JJEE','Seguros');
UPDATE factura_distribuciones SET concepto = 'Banco'                      WHERE concepto IN ('Banco / Comisiones','Extracto cuenta','Extracto liquidación','Extracto semanal TPV','Devolución','Notificación banco');
UPDATE factura_distribuciones SET concepto = 'Inscripciones'              WHERE concepto IN ('Inscripciones torneos','Inscripción competición');
UPDATE factura_distribuciones SET concepto = 'Hoteles'                    WHERE concepto IN ('Hotel');
UPDATE factura_distribuciones SET concepto = 'Gestorias'                  WHERE concepto IN ('Gestoría','Gestoria');
UPDATE factura_distribuciones SET concepto = 'Donaciones/Colaboraciones'  WHERE concepto IN ('Donación / Colaboración','Donacion / Colaboracion');
UPDATE factura_distribuciones SET concepto = 'Subvencion'                 WHERE concepto IN ('Subvención');
UPDATE factura_distribuciones SET concepto = 'Otros'                      WHERE concepto IN ('Recibos socios','Dietas','Comité Entrenadores','Comite Entrenadores');

DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '=== Conceptos en distribuciones ===';
  FOR r IN SELECT COALESCE(concepto,'(null)') AS c, COUNT(*) n
           FROM factura_distribuciones GROUP BY concepto ORDER BY n DESC LIMIT 15 LOOP
    RAISE NOTICE '  % -> %', r.c, r.n;
  END LOOP;
END $$;

COMMIT;