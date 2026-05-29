-- 17_lote3_cierre.sql
-- ============================================================
-- Cierre del re-OCR Fase 10c con los 7 ARB FAB confirmados.
--
-- Posible duplicado detectado: id=111 y id=115 ambas son FAB factura F348
-- 31/03/2026 116.00 EUR. Se anota como posible duplicado pero NO se borra.
-- Que Jaime decida.
--
-- Las 9 gestorias y las 10 JJEE Gobierno Aragon NO se modifican (numero
-- ambiguo en PDF), se pueden completar manual desde la app.
--
-- Idempotente.
-- ============================================================

BEGIN;

-- id=109 FAB F742 ARB BALONCESTO 02/02/2026 116.00 (JR FEM 3a 12/2025)
UPDATE facturas SET
  proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F742', fecha_factura='2026-02-02',
  importe=116.00, base_imponible=116.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true
WHERE id=109;

-- id=110 FAB F428 ARB BALONCESTO 30/04/2026 261.00 (JR FEM 3a 03/2026)
UPDATE facturas SET
  proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F428', fecha_factura='2026-04-30',
  importe=261.00, base_imponible=261.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true
WHERE id=110;

-- id=111 FAB F348 ARB BALONCESTO 31/03/2026 116.00 (JR FEM 3a 02/2026)
UPDATE facturas SET
  proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F348', fecha_factura='2026-03-31',
  importe=116.00, base_imponible=116.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true,
  concepto='Arbitraje JR MASC 3a 02/2026 + JR FEM 3a 02/2026 (posible duplicado con id=115)'
WHERE id=111;

-- id=115 FAB F348 (parece duplicado de 111)
UPDATE facturas SET
  proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F348', fecha_factura='2026-03-31',
  importe=116.00, base_imponible=116.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true,
  concepto='Arbitraje JR MASC 3a 02/2026 + JR FEM 3a 02/2026 (POSIBLE DUPLICADO con id=111, revisar antes de cerrar)'
WHERE id=115;

-- id=138 FAB F215 DES.ARB.BALONCESTO FEM 13/02/2026 58.00
UPDATE facturas SET
  proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F215', fecha_factura='2026-02-13',
  importe=58.00, base_imponible=58.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true,
  concepto='Desplaz. Arbitraje JR FEM 3a 12/2025'
WHERE id=138;

-- id=95 FAB F1203 ARB BALONCESTO 11/2025 29.00
UPDATE facturas SET
  proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F1203', fecha_factura='2025-12-01',
  importe=29.00, base_imponible=29.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true,
  concepto='Desplaz. Arbitraje JR MASC 3a 10/2025'
WHERE id=95;

-- id=114 FAB F362 ARB JR.MASC 26/02/2026 29.00
UPDATE facturas SET
  proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F362', fecha_factura='2026-02-26',
  importe=29.00, base_imponible=29.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true,
  concepto='Desplaz. Arbitraje JR MASC 3a 01/2026'
WHERE id=114;

DO $$
DECLARE v_rev INT; v_sin_num INT; v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_rev FROM facturas WHERE ocr_revisado=true;
  SELECT COUNT(*) INTO v_sin_num FROM facturas
    WHERE tipo='factura' AND (numero_factura IS NULL OR trim(numero_factura)='');
  SELECT COUNT(*) INTO v_total FROM facturas;
  RAISE NOTICE 'Total facturas: %', v_total;
  RAISE NOTICE 'Total ocr_revisado=true: %', v_rev;
  RAISE NOTICE 'Tipo factura sin numero (gestorias + JJEE pequenos sobre todo): %', v_sin_num;
END $$;

COMMIT;