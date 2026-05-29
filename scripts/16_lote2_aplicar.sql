-- 16_lote2_aplicar.sql
-- ============================================================
-- Aplica datos del re-OCR del lote 2 (importes 250-450 EUR):
--   - 7 facturas verificadas individualmente (137, 193, 190, 156, 194, 64, 71)
--   - Bloque masivo arbitrajes FAB (ARB BALONCESTO, DES.ARB, ARB.JR.MASC, etc.)
--   - JJEE Gobierno de Aragon seguros (209 ya en tipo=factura, 89, 65, etc.)
--
-- Idempotente.
-- ============================================================

BEGIN;

-- 1) id=137 Cromos Base Aragon SL CROMOS ALEVIN (borrador sin numero)
UPDATE facturas SET
  proveedor='Cromos Base Aragón SL', nif_proveedor='B23932576',
  fecha_factura='2026-04-28',
  base_imponible=312.45, iva_porcentaje=21, iva_importe=65.61, importe=378.06,
  tipo='factura', ocr_revisado=true,
  concepto='Cromos álbumes Alevín F8 + Cromos Alevín (temporada 2025/2026)'
WHERE id=137;

-- 2) id=193 Fed.Arag.Patinaje 0224 PATINAJE FEBRERO
UPDATE facturas SET
  proveedor='Federación Aragonesa de Patinaje', nif_proveedor='G-50313185',
  numero_factura='0224', fecha_factura='2026-02-11',
  importe=350.00, base_imponible=350.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true
WHERE id=193;

-- 3) id=190 Main-Draw Tennis Pro P-1025 MATERIAL PADEL (pedido)
UPDATE facturas SET
  proveedor='Main-Draw Tennis Pro (CADIABANK)',
  numero_factura='P-1025', fecha_factura='2026-02-20',
  base_imponible=146.28, iva_porcentaje=21, iva_importe=30.72, importe=177.00,
  tipo='factura', ocr_revisado=true
WHERE id=190;

-- 4) id=156 IMPRENTA -> realmente JUSTIFICANTE BANCARIO IberCaja
UPDATE facturas SET
  proveedor='Jose Antonio Causin Fontan (via IberCaja)',
  concepto='F25000200 DEPORTE PEDROLA (transferencia)',
  fecha_factura='2026-02-06', importe=121.00,
  tipo='justificante_bancario', ocr_revisado=true
WHERE id=156;

-- 5) id=194 Sports Emotion AD_NT2425.RFEAF PELOTAS
UPDATE facturas SET
  proveedor='Sports Emotion Hub S.L.', nif_proveedor='B50967259',
  numero_factura='AD_NT2425.RFEAF', fecha_factura='2026-02-19',
  base_imponible=74.38, iva_porcentaje=21, iva_importe=15.62, importe=90.00,
  tipo='factura', ocr_revisado=true,
  concepto='Balón Adidas Tiro League 62 - Real Federación Aragonesa de Fútbol White-Solar Red-Iron'
WHERE id=194;

-- 6) id=64 Fed.Territorial Aragon Voleibol Inscripcion JJEE
UPDATE facturas SET
  proveedor='Federación Territorial de Aragón de Voleibol',
  fecha_factura='2025-10-28',
  importe=50.00, base_imponible=50.00, iva_porcentaje=0, iva_importe=0.00,
  tipo='factura', ocr_revisado=true,
  concepto='Inscripción Juegos Escolares 2025/2026 (Infantil-Infantil X)'
WHERE id=64;

-- 7) id=71 FUJI SPORT (FUJIMAE) 25020245
UPDATE facturas SET
  proveedor='FUJI SPORT, S.L. (FUJIMAE)', nif_proveedor='B58066674',
  numero_factura='25020245', fecha_factura='2025-11-07',
  base_imponible=31.65, iva_porcentaje=21, iva_importe=6.65, importe=43.25,
  tipo='factura', ocr_revisado=true,
  concepto='Casco Máscara Advantage Flexión Negro L + portes'
WHERE id=71;

-- ============================================================
-- 8) BLOQUE MASIVO: arbitrajes FAB sin numero_factura
--    Patron del Excel: "ARB BALONCESTO" / "DES.ARB.BALONCESTO" / "ARB.JR.MASC"
--    Tipo: factura (es factura federativa). Mantener importe BD.
--    Numero: dejar NULL, hay que ver el PDF (cada uno es F### distinto).
--    Normalizar proveedor.
-- ============================================================
UPDATE facturas SET
  proveedor='Federación Aragonesa de Baloncesto',
  tipo='factura',
  ocr_revisado=true
WHERE (nombre_archivo ILIKE 'ARB.%BALONCESTO%' OR nombre_archivo ILIKE 'ARB %BALONCESTO%'
       OR nombre_archivo ILIKE 'DES.ARB.BALONCESTO%'
       OR nombre_archivo ILIKE 'ARB.JR.MASC%')
  AND tipo='factura'
  AND (numero_factura IS NULL OR trim(numero_factura)='');

-- ============================================================
-- 9) JJEE Gobierno de Aragon Seguros (importes pequenos 6.96-20.88)
--    Ya tenian proveedor correcto, solo marcar ocr_revisado.
-- ============================================================
UPDATE facturas SET
  ocr_revisado=true, tipo='factura'
WHERE proveedor ILIKE '%Gobierno%Arag%n%' 
  AND nombre_archivo ILIKE 'jjee%'
  AND tipo IS DISTINCT FROM 'factura'
  AND importe IS NOT NULL;

DO $$
DECLARE v_rev INT; v_sin_num INT;
BEGIN
  SELECT COUNT(*) INTO v_rev FROM facturas WHERE ocr_revisado=true;
  SELECT COUNT(*) INTO v_sin_num FROM facturas
    WHERE tipo='factura' AND (numero_factura IS NULL OR trim(numero_factura)='');
  RAISE NOTICE 'Total ocr_revisado=true: %', v_rev;
  RAISE NOTICE 'Tipo factura sin numero: %', v_sin_num;
END $$;

COMMIT;