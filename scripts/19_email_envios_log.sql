-- 19_email_envios_log.sql
-- ============================================================
-- Tabla de log de envios de correos a socios.
-- Cada llamada a /api/cuotas/email-prevision inserta una fila por destinatario.
-- Idempotente.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS email_envios_log (
  id            SERIAL PRIMARY KEY,
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo          TEXT NOT NULL,            -- 'prevision_cuotas', etc.
  temporada     TEXT,
  socio_id      INTEGER,
  email_destino TEXT,
  asunto        TEXT,
  estado        TEXT NOT NULL,            -- 'enviado' | 'error' | 'omitido' | 'dry_run'
  motivo        TEXT,
  message_id    TEXT,
  total_eur     NUMERIC(10,2)
);

CREATE INDEX IF NOT EXISTS email_envios_log_fecha_idx ON email_envios_log (fecha DESC);
CREATE INDEX IF NOT EXISTS email_envios_log_socio_idx ON email_envios_log (socio_id);

DO $$
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM email_envios_log;
  RAISE NOTICE 'Total filas email_envios_log: %', v;
END $$;

COMMIT;