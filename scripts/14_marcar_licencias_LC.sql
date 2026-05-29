-- 14_marcar_licencias_LC.sql
-- ============================================================
-- Marca como tipo='licencias' todas las facturas cuyo nombre_archivo empieza
-- por LC seguido de digitos (patron de liquidaciones Mutualidad Futbolistas /
-- Real Federacion Aragonesa de Futbol).
--
-- Extrae el numero LC###### del nombre_archivo y lo pone en numero_factura.
-- Marca ocr_revisado=true.
--
-- Verificado manualmente con muestras id=160 (LC156543), 164 (LC159889), 159
-- (LC156541). Patron 100% confirmado.
--
-- Idempotente.
-- ============================================================

BEGIN;

UPDATE facturas SET
  tipo = 'licencias',
  numero_factura = substring(nombre_archivo from '^(LC[0-9]+)'),
  ocr_revisado = true
WHERE nombre_archivo ~ '^LC[0-9]+'
  AND (numero_factura IS NULL OR trim(numero_factura) = '');

DO $$
DECLARE v_lic INT; v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_lic FROM facturas WHERE tipo='licencias';
  SELECT COUNT(*) INTO v_total FROM facturas
    WHERE nombre_archivo ~ '^LC[0-9]+';
  RAISE NOTICE 'Total tipo=licencias tras esta migracion: %', v_lic;
  RAISE NOTICE 'Total PDFs con patron LC#####: %', v_total;
END $$;

COMMIT;