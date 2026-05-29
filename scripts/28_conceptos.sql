-- 28_conceptos.sql
-- ============================================================
-- Tabla de conceptos editable, igual que `proveedores`. Reemplaza la
-- constante CONCEPTOS hardcoded en facturas.html.
-- Idempotente.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS conceptos (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  categoria   TEXT,            -- 'gasto' | 'ingreso' | 'banco' (informativo)
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS conceptos_nombre_lower_idx ON conceptos (LOWER(nombre));

-- Conceptos canonicos del club (ampliacion con todos los que el usuario menciona)
INSERT INTO conceptos (nombre, categoria) VALUES
  ('Aguinaldos', 'gasto'),
  ('Arbitraje', 'gasto'),
  ('Autobuses', 'gasto'),
  ('Banco / Comisiones', 'banco'),
  ('Comité Entrenadores', 'gasto'),
  ('Cromos', 'gasto'),
  ('Devolución', 'banco'),
  ('Dietas', 'gasto'),
  ('Donación / Colaboración', 'ingreso'),
  ('Extracto cuenta', 'banco'),
  ('Extracto liquidación', 'banco'),
  ('Extracto semanal TPV', 'banco'),
  ('Federación', 'gasto'),
  ('Fichas / Licencias', 'gasto'),
  ('Gestoría', 'gasto'),
  ('Hotel', 'gasto'),
  ('Imprenta', 'gasto'),
  ('Inscripción competición', 'ingreso'),
  ('Inscripciones torneos', 'gasto'),
  ('Material deportivo', 'gasto'),
  ('Notificación banco', 'banco'),
  ('Premios', 'gasto'),
  ('Recibos socios', 'ingreso'),
  ('Ropa / Equipación', 'gasto'),
  ('Sanciones', 'gasto'),
  ('Seguro deportivo JJEE', 'gasto'),
  ('Seguros', 'gasto'),
  ('Subvención', 'ingreso'),
  ('Tasas administrativas', 'gasto'),
  ('Trofeos', 'gasto'),
  ('Otros', 'gasto')
ON CONFLICT (nombre) DO NOTHING;

DO $$
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM conceptos;
  RAISE NOTICE 'Total conceptos: %', v;
END $$;

COMMIT;