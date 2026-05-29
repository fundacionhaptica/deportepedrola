-- 15_lote2_parcial.sql
-- ============================================================
-- Lote 2 parcial: aplica datos del re-OCR del id=107 (GESTORIA muestra) y
-- id=31 (ARB BALONCESTO muestra) confirmados.
--
-- Tambien marca como tipo='factura' + ocr_revisado=true las gestorias mensuales
-- (Centro de Asesoramiento y Gestion S.L., 8 facturas, 30 EUR cada una, IVA 21%).
--
-- Idempotente.
-- ============================================================

BEGIN;

-- 1) id=107 Gestoria 12 (diciembre 2025): muestra OCR confirma 30.00 total
-- IVA 21% sobre base 24.79 = 5.21. NIF Centro Asesoramiento: B-50627113
UPDATE facturas SET
  proveedor = 'Centro de Asesoramiento y Gestión S.L.',
  nif_proveedor = 'B-50627113',
  base_imponible = 24.79,
  iva_porcentaje = 21,
  iva_importe = 5.21,
  importe = 30.00,
  tipo = 'factura',
  ocr_revisado = true
WHERE id = 107;

-- Para las gestorias mensuales restantes (33, 51, 67, 93, 152, 153, 154, 155)
-- aplicar misma estructura. Numero_factura no se extrae con seguridad (el OCR de
-- 107 muestra '0.052779' que es ambiguo); lo dejamos NULL para revisar manual
-- desde la app.
UPDATE facturas SET
  proveedor = 'Centro de Asesoramiento y Gestión S.L.',
  nif_proveedor = 'B-50627113',
  base_imponible = 24.79,
  iva_porcentaje = 21,
  iva_importe = 5.21,
  tipo = 'factura',
  ocr_revisado = true
WHERE id IN (33, 51, 67, 93, 152, 153, 154, 155)
  AND importe = 30.00;

-- 2) id=31 ARB BALONCESTO JULIO: factura F704 Federacion Aragonesa Baloncesto
UPDATE facturas SET
  proveedor = 'Federación Aragonesa de Baloncesto',
  numero_factura = 'F704',
  fecha_factura = '2025-07-11',
  base_imponible = 261.00,
  iva_porcentaje = 0,
  iva_importe = 0.00,
  importe = 261.00,
  tipo = 'factura',
  ocr_revisado = true
WHERE id = 31;

DO $$
DECLARE v_revisados INT; v_factura INT; v_licencias INT;
BEGIN
  SELECT COUNT(*) INTO v_revisados FROM facturas WHERE ocr_revisado=true;
  SELECT COUNT(*) INTO v_factura FROM facturas WHERE tipo='factura';
  SELECT COUNT(*) INTO v_licencias FROM facturas WHERE tipo='licencias';
  RAISE NOTICE 'Total ocr_revisado=true: %', v_revisados;
  RAISE NOTICE 'Tipo factura: %, Tipo licencias: %', v_factura, v_licencias;
END $$;

COMMIT;