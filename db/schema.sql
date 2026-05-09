-- Schema principal del sistema de gestión CDE Deporte Pedrola
-- Ejecutar con: npm run migrate  (idempotente — seguro repetir)

CREATE TABLE IF NOT EXISTS socios (
    id          SERIAL      PRIMARY KEY,
    auth0_sub   TEXT        UNIQUE,
    nombre      TEXT        NOT NULL,
    email       TEXT        UNIQUE NOT NULL,
    seccion     TEXT,
    rol         TEXT        NOT NULL DEFAULT 'socio',   -- socio | junta | admin
    activo      BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
