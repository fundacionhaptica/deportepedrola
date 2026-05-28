-- 11_pagos_stripe_completar.sql
-- Añade columnas para asociar pagos con sesiones de Stripe Checkout.
--
-- Problema detectado: el webhook hacía UPDATE pagos WHERE stripe_pi_id=$1
-- pero NINGÚN endpoint hacía INSERT en pagos al crear la sesión. Resultado:
-- los pagos reales nunca se registraban en BD.
--
-- Solución:
--   1) Añadir stripe_session_id (id de la sesión de Checkout, ej cs_test_...)
--   2) Añadir metadata jsonb para guardar evento + datos del pagador
--   3) Añadir nombre_pagador y email para pagos públicos (sin socio_id)
--   4) Añadir evento (10k | maraton-futbolsala | ...)
--
-- El nuevo flujo:
--   POST /api/inscripciones/checkout → crea Stripe session + INSERT pagos (estado='pendiente', stripe_session_id, evento, nombre_pagador, email)
--   Usuario paga en Stripe → webhook checkout.session.completed → UPDATE pagos SET estado='pagado', stripe_pi_id WHERE stripe_session_id=$1
--
-- Idempotente: ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

BEGIN;

ALTER TABLE pagos ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metadata          JSONB;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS evento            TEXT;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS nombre_pagador    TEXT;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS email             TEXT;

-- Índice para que el lookup por session_id en el webhook sea rápido
CREATE UNIQUE INDEX IF NOT EXISTS pagos_stripe_session_id_idx
  ON pagos(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

DO $a$
DECLARE v_cols INT;
BEGIN
  SELECT COUNT(*) INTO v_cols
  FROM information_schema.columns
  WHERE table_name='pagos'
    AND column_name IN ('stripe_session_id','metadata','evento','nombre_pagador','email');
  RAISE NOTICE 'Columnas añadidas: % de 5', v_cols;
  IF v_cols <> 5 THEN
    RAISE EXCEPTION 'FAIL: esperaba 5 columnas, hay %', v_cols;
  END IF;
END $a$;

COMMIT;