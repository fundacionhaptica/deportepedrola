-- Schema principal del sistema de gestión CDE Deporte Pedrola
-- Ejecutar con: npm run migrate  (idempotente — seguro repetir)

CREATE TABLE IF NOT EXISTS socios (
    id               SERIAL        PRIMARY KEY,
    auth0_sub        TEXT          UNIQUE,
    -- Datos personales
    nombre           TEXT          NOT NULL,
    apellidos        TEXT,
    email            TEXT          UNIQUE NOT NULL,
    dni              TEXT,
    fecha_nacimiento DATE,
    domicilio        TEXT,
    localidad        TEXT,
    codigo_postal    TEXT,
    telefono         TEXT,
    -- Actividades (una columna booleana por deporte)
    act_atletismo    BOOLEAN       NOT NULL DEFAULT false,
    act_baloncesto   BOOLEAN       NOT NULL DEFAULT false,
    act_f7           BOOLEAN       NOT NULL DEFAULT false,
    act_futbol       BOOLEAN       NOT NULL DEFAULT false,
    act_fs           BOOLEAN       NOT NULL DEFAULT false,
    act_g_ritmica    BOOLEAN       NOT NULL DEFAULT false,
    act_kenpo        BOOLEAN       NOT NULL DEFAULT false,
    act_kickboxing   BOOLEAN       NOT NULL DEFAULT false,
    act_patinaje     BOOLEAN       NOT NULL DEFAULT false,
    act_trail        BOOLEAN       NOT NULL DEFAULT false,
    act_voleibol     BOOLEAN       NOT NULL DEFAULT false,
    act_dirigidas    BOOLEAN       NOT NULL DEFAULT false,
    -- Datos del tutor (menores)
    apellidos_tutor  TEXT,
    dni_tutor        TEXT,
    telefono_tutor   TEXT,
    -- Domiciliación bancaria
    numero_cuenta    TEXT,
    -- Cuota y pago
    cuota            NUMERIC(10,2),
    pagado           BOOLEAN       NOT NULL DEFAULT false,
    pagado_metodo    TEXT,          -- stripe | remesa | efectivo
    pagado_fecha     DATE,
    -- JJEE (Juegos Escolares de Aragón) — calculado por edad (<16) o flag manual
    es_jjee          BOOLEAN       NOT NULL DEFAULT false,
    -- Admin
    rol              TEXT          NOT NULL DEFAULT 'socio',   -- socio | junta | admin
    activo           BOOLEAN       NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Tabla de precios por actividad (regular + JJEE)
CREATE TABLE IF NOT EXISTS precios_actividades (
    actividad       TEXT          PRIMARY KEY,   -- mismo nombre que la columna act_* sin prefijo
    precio_regular  NUMERIC(10,2) NOT NULL DEFAULT 0,
    precio_jjee     NUMERIC(10,2),               -- NULL = esa actividad no tiene modalidad JJEE
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed inicial de actividades (si la tabla está vacía)
INSERT INTO precios_actividades (actividad) VALUES
  ('atletismo'),('baloncesto'),('f7'),('futbol'),('fs'),
  ('g_ritmica'),('kenpo'),('kickboxing'),('patinaje'),
  ('trail'),('voleibol'),('dirigidas')
ON CONFLICT DO NOTHING;

-- Añadir columnas nuevas a instalaciones existentes (idempotente)
ALTER TABLE socios ADD COLUMN IF NOT EXISTS apellidos        TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS dni              TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS domicilio        TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS localidad        TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS codigo_postal    TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS telefono         TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_atletismo    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_baloncesto   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_f7           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_futbol       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_fs           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_g_ritmica    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_kenpo        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_kickboxing   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_patinaje     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_trail        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_voleibol     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS act_dirigidas    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS apellidos_tutor  TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS dni_tutor        TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS telefono_tutor   TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS numero_cuenta    TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS cuota            NUMERIC(10,2);
ALTER TABLE socios ADD COLUMN IF NOT EXISTS pagado           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS pagado_metodo    TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS pagado_fecha     DATE;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS es_jjee          BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS pagos (
    id              SERIAL        PRIMARY KEY,
    socio_id        INTEGER       REFERENCES socios(id),
    concepto        TEXT          NOT NULL,
    importe         NUMERIC(10,2) NOT NULL,
    stripe_pi_id    TEXT,
    estado          TEXT          NOT NULL DEFAULT 'pendiente',   -- pendiente | pagado | fallido
    fecha           DATE          NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos (
    id              SERIAL        PRIMARY KEY,
    tipo            TEXT          NOT NULL,   -- ingreso | gasto | adelanto_presidente
    concepto        TEXT          NOT NULL,
    importe         NUMERIC(10,2) NOT NULL,
    es_tesoreria    BOOLEAN       NOT NULL DEFAULT false,
    fecha           DATE          NOT NULL,
    referencia      TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facturas (
    id              SERIAL        PRIMARY KEY,
    nombre_archivo  TEXT          NOT NULL,
    ruta_archivo    TEXT          NOT NULL,
    proveedor       TEXT,
    nif_proveedor   TEXT,
    numero_factura  TEXT,
    fecha_factura   DATE,
    concepto        TEXT,
    base_imponible  NUMERIC(10,2),
    iva_porcentaje  NUMERIC(5,2),
    iva_importe     NUMERIC(10,2),
    importe         NUMERIC(10,2),
    ocr_raw_json    JSONB,
    ocr_revisado    BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS ocr_revisado BOOLEAN NOT NULL DEFAULT FALSE;

-- Vista balance mensual — los adelantos del presidente (es_tesoreria=true) no computan
CREATE OR REPLACE VIEW v_balance_mensual AS
SELECT
    DATE_TRUNC('month', fecha) AS mes,
    COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe END), 0) AS ingresos,
    COALESCE(SUM(CASE WHEN tipo = 'gasto'   THEN importe END), 0) AS gastos
FROM movimientos
WHERE es_tesoreria = false
GROUP BY 1
ORDER BY 1 DESC;
