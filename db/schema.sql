-- =============================================================
-- Schema: Club Deportivo Elemental Deporte Pedrola
-- Idempotente: seguro ejecutar varias veces
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- ENUM
-- =============================================================

DO $$ BEGIN
  CREATE TYPE tipo_ingreso AS ENUM (
    'cuota',
    'inscripcion',
    'subvencion',
    'donacion',
    'adelanto_presidente',
    'otro'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================
-- FUNCIÓN updated_at (genérica para triggers)
-- =============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- ESTRUCTURA DEPORTIVA
-- =============================================================

CREATE TABLE IF NOT EXISTS secciones (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(100) NOT NULL UNIQUE,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipos (
  id         SERIAL PRIMARY KEY,
  seccion_id INTEGER NOT NULL REFERENCES secciones(id),
  nombre     VARCHAR(100) NOT NULL,
  categoria  VARCHAR(100),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seccion_id, nombre)
);

CREATE TABLE IF NOT EXISTS disciplinas (
  id                  SERIAL PRIMARY KEY,
  seccion_id          INTEGER NOT NULL REFERENCES secciones(id),
  nombre              VARCHAR(100) NOT NULL,
  precio_cuota_anual  NUMERIC(10,2) NOT NULL DEFAULT 0,
  descripcion         TEXT,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- SOCIOS
-- =============================================================

CREATE TABLE IF NOT EXISTS socios (
  id                 SERIAL PRIMARY KEY,
  numero_socio       VARCHAR(20) UNIQUE,
  nombre             VARCHAR(100) NOT NULL,
  apellidos          VARCHAR(150) NOT NULL,
  dni                VARCHAR(20) UNIQUE,
  fecha_nacimiento   DATE,
  email              VARCHAR(254),
  telefono           VARCHAR(20),
  direccion          TEXT,
  cp                 VARCHAR(10),
  poblacion          VARCHAR(100),
  provincia          VARCHAR(100),
  tutor_nombre       VARCHAR(200),
  tutor_dni          VARCHAR(20),
  tutor_email        VARCHAR(254),
  tutor_telefono     VARCHAR(20),
  iban               VARCHAR(34),
  stripe_customer_id VARCHAR(100),
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_alta         DATE,
  fecha_baja         DATE,
  notas              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS socios_disciplinas (
  id            SERIAL PRIMARY KEY,
  socio_id      INTEGER NOT NULL REFERENCES socios(id),
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id),
  equipo_id     INTEGER REFERENCES equipos(id),
  temporada     VARCHAR(20) NOT NULL,
  fecha_inicio  DATE,
  fecha_fin     DATE,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (socio_id, disciplina_id, temporada)
);

-- =============================================================
-- PROVEEDORES
-- =============================================================

CREATE TABLE IF NOT EXISTS proveedores (
  id          SERIAL PRIMARY KEY,
  cif         VARCHAR(20) UNIQUE,
  nombre      VARCHAR(200) NOT NULL,
  direccion   TEXT,
  email       VARCHAR(254),
  telefono    VARCHAR(20),
  es_autobus  BOOLEAN NOT NULL DEFAULT FALSE,
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- FACTURAS
-- =============================================================

CREATE TABLE IF NOT EXISTS facturas (
  id               SERIAL PRIMARY KEY,
  proveedor_id     INTEGER REFERENCES proveedores(id),
  proveedor_text   VARCHAR(200),      -- nombre libre si no está en BD
  numero           VARCHAR(100),
  fecha            DATE,
  fecha_recepcion  DATE,
  base_imponible   NUMERIC(10,2),
  iva_total        NUMERIC(10,2),
  total            NUMERIC(10,2),
  pdf_path         TEXT,
  ocr_raw_json     JSONB,
  ocr_procesado    BOOLEAN NOT NULL DEFAULT FALSE,
  ocr_revisado     BOOLEAN NOT NULL DEFAULT FALSE,
  pagada           BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_pago       DATE,
  forma_pago       VARCHAR(100),
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proveedor_id, numero)
);

CREATE TABLE IF NOT EXISTS facturas_lineas (
  id          SERIAL PRIMARY KEY,
  factura_id  INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  seccion_id  INTEGER REFERENCES secciones(id),
  equipo_id   INTEGER REFERENCES equipos(id),
  concepto    TEXT,
  base        NUMERIC(10,2),
  iva_pct     NUMERIC(5,2),
  iva         NUMERIC(10,2),
  total       NUMERIC(10,2),
  orden       INTEGER NOT NULL DEFAULT 0
);

-- =============================================================
-- INGRESOS
-- =============================================================

CREATE TABLE IF NOT EXISTS ingresos (
  id                      SERIAL PRIMARY KEY,
  tipo                    tipo_ingreso NOT NULL,
  fecha                   DATE NOT NULL,
  importe                 NUMERIC(10,2) NOT NULL,
  concepto                TEXT,
  socio_id                INTEGER REFERENCES socios(id),
  seccion_id              INTEGER REFERENCES secciones(id),
  equipo_id               INTEGER REFERENCES equipos(id),
  disciplina_id           INTEGER REFERENCES disciplinas(id),
  -- donante
  donante_nombre          VARCHAR(200),
  donante_dni             VARCHAR(20),
  donante_direccion       TEXT,
  donante_email           VARCHAR(254),
  -- subvención
  organismo               VARCHAR(200),
  expediente              VARCHAR(100),
  -- adelantos del presidente: no computan como ingreso real
  es_tesoreria            BOOLEAN NOT NULL DEFAULT FALSE,
  -- Stripe
  stripe_session_id       VARCHAR(200),
  stripe_payment_intent_id VARCHAR(200),
  -- documentos
  certificado_pdf_path    TEXT,
  justificante_path       TEXT,
  notas                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- USUARIOS (Auth0)
-- =============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id         SERIAL PRIMARY KEY,
  auth0_sub  VARCHAR(200) NOT NULL UNIQUE,
  email      VARCHAR(254),
  nombre     VARCHAR(200),
  rol        VARCHAR(30) NOT NULL DEFAULT 'socio',
  socio_id   INTEGER REFERENCES socios(id),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- ÍNDICES
-- =============================================================

-- Stripe idempotencia
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingresos_stripe_session
  ON ingresos (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Consultas por fecha
CREATE INDEX IF NOT EXISTS idx_facturas_fecha      ON facturas (fecha);
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha      ON ingresos (fecha);

-- FKs frecuentes
CREATE INDEX IF NOT EXISTS idx_facturas_lineas_factura   ON facturas_lineas (factura_id);
CREATE INDEX IF NOT EXISTS idx_facturas_lineas_seccion   ON facturas_lineas (seccion_id);
CREATE INDEX IF NOT EXISTS idx_facturas_lineas_equipo    ON facturas_lineas (equipo_id);
CREATE INDEX IF NOT EXISTS idx_socios_disciplinas_socio  ON socios_disciplinas (socio_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_socio            ON ingresos (socio_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_tipo             ON ingresos (tipo);

-- =============================================================
-- TRIGGERS updated_at
-- =============================================================

DROP TRIGGER IF EXISTS trg_socios_updated_at   ON socios;
CREATE TRIGGER trg_socios_updated_at
  BEFORE UPDATE ON socios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_facturas_updated_at ON facturas;
CREATE TRIGGER trg_facturas_updated_at
  BEFORE UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ingresos_updated_at ON ingresos;
CREATE TRIGGER trg_ingresos_updated_at
  BEFORE UPDATE ON ingresos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- VISTAS
-- =============================================================

CREATE OR REPLACE VIEW v_gasto_por_seccion AS
SELECT
  s.id                          AS seccion_id,
  s.nombre                      AS seccion,
  COALESCE(SUM(fl.total), 0)    AS total_gasto
FROM secciones s
LEFT JOIN facturas_lineas fl ON fl.seccion_id = s.id
GROUP BY s.id, s.nombre
ORDER BY total_gasto DESC;

CREATE OR REPLACE VIEW v_gasto_por_equipo AS
SELECT
  e.id                          AS equipo_id,
  e.nombre                      AS equipo,
  s.nombre                      AS seccion,
  COALESCE(SUM(fl.total), 0)    AS total_gasto
FROM equipos e
JOIN secciones s ON s.id = e.seccion_id
LEFT JOIN facturas_lineas fl ON fl.equipo_id = e.id
GROUP BY e.id, e.nombre, s.nombre
ORDER BY total_gasto DESC;

CREATE OR REPLACE VIEW v_gasto_por_proveedor AS
SELECT
  p.id                          AS proveedor_id,
  p.nombre                      AS proveedor,
  COUNT(DISTINCT f.id)          AS num_facturas,
  COALESCE(SUM(f.total), 0)     AS total_gasto
FROM proveedores p
LEFT JOIN facturas f ON f.proveedor_id = p.id
GROUP BY p.id, p.nombre
ORDER BY total_gasto DESC
LIMIT 30;

-- Balance mensual: gastos por mes vs ingresos reales por mes
-- Los adelantos del presidente (es_tesoreria=true) se excluyen de ingresos
CREATE OR REPLACE VIEW v_balance_mensual AS
SELECT
  mes,
  COALESCE(SUM(gastos), 0)   AS gastos,
  COALESCE(SUM(ingresos), 0) AS ingresos,
  COALESCE(SUM(ingresos), 0) - COALESCE(SUM(gastos), 0) AS neto
FROM (
  SELECT
    DATE_TRUNC('month', fecha) AS mes,
    SUM(total)                 AS gastos,
    0::NUMERIC                 AS ingresos
  FROM facturas
  WHERE fecha IS NOT NULL
  GROUP BY DATE_TRUNC('month', fecha)

  UNION ALL

  SELECT
    DATE_TRUNC('month', fecha) AS mes,
    0::NUMERIC                 AS gastos,
    SUM(importe)               AS ingresos
  FROM ingresos
  WHERE es_tesoreria = FALSE
  GROUP BY DATE_TRUNC('month', fecha)
) sub
GROUP BY mes
ORDER BY mes;
