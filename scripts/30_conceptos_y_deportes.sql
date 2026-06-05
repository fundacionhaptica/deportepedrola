-- 30_conceptos_y_deportes.sql
-- ============================================================
-- 1. Reemplaza la tabla conceptos con los 17 definitivos
-- 2. Unifica Futbol 7 / Futbol 8 / Futbol 11 -> Futbol
-- ============================================================

BEGIN;

-- ── Conceptos ──────────────────────────────────────────────
-- Vaciamos y reinsertamos con los nombres definitivos.
-- ON CONFLICT (nombre) DO NOTHING garantiza idempotencia.
DELETE FROM conceptos;

INSERT INTO conceptos (nombre, categoria) VALUES
  ('Aguinaldos',               'gasto'),
  ('Arbitrajes',               'gasto'),
  ('Fichas/Federacion/Licencias', 'gasto'),
  ('Inscripciones',            'gasto'),
  ('Premios',                  'gasto'),
  ('Cromos',                   'gasto'),
  ('Ropa',                     'gasto'),
  ('Materiales',               'gasto'),
  ('Banco',                    'banco'),
  ('Autobuses',                'gasto'),
  ('Hoteles',                  'gasto'),
  ('Sanciones',                'gasto'),
  ('Tasas administrativas',    'gasto'),
  ('Gestorias',                'gasto'),
  ('Subvencion',               'ingreso'),
  ('Donaciones/Colaboraciones','ingreso'),
  ('Otros',                    'gasto')
ON CONFLICT (nombre) DO NOTHING;

-- Actualizar concepto en facturas: mapeo de valores antiguos a nuevos
UPDATE facturas SET concepto = 'Arbitrajes'               WHERE concepto IN ('Arbitraje');
UPDATE facturas SET concepto = 'Fichas/Federacion/Licencias' WHERE concepto IN ('Fichas / Licencias','Federacion','Fichas','Licencias');
UPDATE facturas SET concepto = 'Ropa'                    WHERE concepto IN ('Ropa / Equipacion','Ropa / Equipación');
UPDATE facturas SET concepto = 'Materiales'              WHERE concepto IN ('Material deportivo','Imprenta','Seguro deportivo JJEE','Seguros');
UPDATE facturas SET concepto = 'Banco'                   WHERE concepto IN ('Banco / Comisiones','Extracto cuenta','Extracto liquidacion','Extracto semanal TPV','Devolucion','Notificacion banco','Devolución','Extracto liquidación');
UPDATE facturas SET concepto = 'Inscripciones'           WHERE concepto IN ('Inscripciones torneos','Inscripcion competicion','Inscripción competición');
UPDATE facturas SET concepto = 'Hoteles'                 WHERE concepto IN ('Hotel');
UPDATE facturas SET concepto = 'Gestorias'               WHERE concepto IN ('Gestoria','Gestoría');
UPDATE facturas SET concepto = 'Donaciones/Colaboraciones' WHERE concepto IN ('Donacion / Colaboracion','Donación / Colaboración');
UPDATE facturas SET concepto = 'Subvencion'              WHERE concepto IN ('Subvención','Subvención');
UPDATE facturas SET concepto = 'Otros'                   WHERE concepto IN ('Recibos socios','Dietas','Comite Entrenadores','Comité Entrenadores','Otros');

-- ── Deportes ───────────────────────────────────────────────
-- Unificar Futbol 7, Futbol 8, Futbol 11 -> Futbol
UPDATE facturas SET deporte = 'Fútbol'
  WHERE deporte IN ('Fútbol 7','Fútbol 8','Fútbol 11','Futbol 7','Futbol 8','Futbol 11');

UPDATE factura_distribuciones SET deporte = 'Fútbol'
  WHERE deporte IN ('Fútbol 7','Fútbol 8','Fútbol 11','Futbol 7','Futbol 8','Futbol 11');

DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '=== Conceptos ===';
  FOR r IN SELECT nombre, categoria FROM conceptos ORDER BY nombre LOOP
    RAISE NOTICE '  % (%)', r.nombre, r.categoria;
  END LOOP;
  RAISE NOTICE '=== Deportes distintos en facturas ===';
  FOR r IN SELECT DISTINCT deporte, COUNT(*) n FROM facturas WHERE deporte IS NOT NULL GROUP BY deporte ORDER BY deporte LOOP
    RAISE NOTICE '  % -> %', r.deporte, r.n;
  END LOOP;
END $$;

COMMIT;