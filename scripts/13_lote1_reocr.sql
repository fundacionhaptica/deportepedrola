-- 13_lote1_reocr.sql
-- ============================================================
-- Aplica los datos extraidos del Re-OCR del lote 1 (24 facturas top-importe)
-- a partir del CSV outputs/reocr_lote1/hallazgos.csv
--
-- Decisiones acordadas con Jaime (Fase 10):
--   - Justificantes bancarios: mantener en facturas con tipo='justificante_bancario'
--   - Recibos premios torneos: tipo='recibo_premio'
--   - Liquidaciones Mutualidad: tipo='licencias'
--   - Recibo arbitraje (multipagina): tipo='recibo_arbitraje'
--   - Facturas reales: tipo='factura'
--   - Confiar en PDF: corregir importe BD al valor del PDF.
--
-- Bugs corregidos en este lote:
--   - id=188 importe BD 6213.35 -> real 600.00 (justificante banco LCM Skates)
--   - id=52 importe BD 4023.00 -> real 680.00 (factura F674 FAB)
--   - id=151 importe BD 5524.20 -> real 5522.00 (PINA-BUS FV26/395, dif 2.20)
--
-- id=38 e id=150 ya tratadas previamente (commit/limpieza anterior).
--
-- Idempotente: se puede correr N veces.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) Normalizar tipo='Factura' -> 'factura' (mojibake antiguo)
-- ============================================================
UPDATE facturas SET tipo = 'factura' WHERE tipo = 'Factura';

-- ============================================================
-- 2) Facturas reales del lote 1 (11 + id=38 ya aplicada)
-- ============================================================

-- id=147 PINA-BUS FV26/241
UPDATE facturas SET
  tipo='factura', proveedor='PINA-BUS, S.L.', nif_proveedor='B-50127015',
  numero_factura='FV26/241', fecha_factura='2026-02-28',
  base_imponible=6596.00, iva_porcentaje=10, iva_importe=659.60, importe=7255.60,
  ocr_revisado=true
WHERE id=147;

-- id=151 PINA-BUS FV26/395 (corregir importe BD 5524.20 -> 5522.00)
UPDATE facturas SET
  tipo='factura', proveedor='PINA-BUS, S.L.', nif_proveedor='B-50127015',
  numero_factura='FV26/395', fecha_factura='2026-03-31',
  base_imponible=5020.00, iva_porcentaje=10, iva_importe=502.00, importe=5522.00,
  ocr_revisado=true
WHERE id=151;

-- id=134 PINA-BUS FV26/13
UPDATE facturas SET
  tipo='factura', proveedor='PINA-BUS, S.L.', nif_proveedor='B-50127015',
  numero_factura='FV26/13', fecha_factura='2026-01-31',
  base_imponible=4833.00, iva_porcentaje=10, iva_importe=483.30, importe=5316.30,
  ocr_revisado=true
WHERE id=134;

-- id=148 PINA-BUS FV26/564
UPDATE facturas SET
  tipo='factura', proveedor='PINA-BUS, S.L.', nif_proveedor='B-50127015',
  numero_factura='FV26/564', fecha_factura='2026-04-30',
  base_imponible=1444.00, iva_porcentaje=10, iva_importe=144.40, importe=1588.40,
  ocr_revisado=true
WHERE id=148;

-- id=52 Fed.Arag.Baloncesto F674 (corregir importe BD 4023 -> 680)
UPDATE facturas SET
  tipo='factura', proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F674', fecha_factura='2025-10-01',
  base_imponible=680.00, iva_porcentaje=0, iva_importe=0.00, importe=680.00,
  ocr_revisado=true
WHERE id=52;

-- id=144 Fed.Arag.Baloncesto F82
UPDATE facturas SET
  tipo='factura', proveedor='Federación Aragonesa de Baloncesto',
  numero_factura='F82', fecha_factura='2026-01-19',
  base_imponible=1780.00, iva_porcentaje=0, iva_importe=0.00, importe=1780.00,
  ocr_revisado=true
WHERE id=144;

-- id=145 Fed.Arag.Patinaje 0148
UPDATE facturas SET
  tipo='factura', proveedor='Federación Aragonesa de Patinaje', nif_proveedor='G-50313185',
  numero_factura='0148', fecha_factura='2026-01-30',
  base_imponible=1677.00, iva_porcentaje=0, iva_importe=0.00, importe=1677.00,
  ocr_revisado=true
WHERE id=145;

-- id=198 Fed.Arag.Karate y D.A. 006/2026
UPDATE facturas SET
  tipo='factura', proveedor='Federación Aragonesa de Karate y D.A.', nif_proveedor='G-50165248',
  numero_factura='006/2026', fecha_factura='2026-01-30',
  base_imponible=2978.00, iva_porcentaje=0, iva_importe=0.00, importe=2978.00,
  ocr_revisado=true
WHERE id=198;

-- id=208 Tagoya Sport 2A000332
UPDATE facturas SET
  tipo='factura', proveedor='TAGOYA SPORT, S.L.', nif_proveedor='B22177314',
  numero_factura='2A000332', fecha_factura='2026-01-09',
  base_imponible=1254.69, iva_porcentaje=21, iva_importe=263.48, importe=1518.17,
  ocr_revisado=true
WHERE id=208;

-- id=79 Cristobal Lopez-Zaro SL F25-005028
UPDATE facturas SET
  tipo='factura', proveedor='Cristobal Lopez-Zaro SL (Aguinaldos Aragón)', nif_proveedor='B50624447',
  numero_factura='F25-005028', fecha_factura='2025-11-14',
  base_imponible=539.01, iva_porcentaje=21, iva_importe=75.44, importe=614.45,
  ocr_revisado=true
WHERE id=79;

-- ============================================================
-- 3) Justificantes bancarios (7 transferencias IberCaja)
-- ============================================================

-- id=140 IberCaja -> Sports Emotion Hub S.L.
UPDATE facturas SET
  tipo='justificante_bancario',
  proveedor='Sports Emotion Hub S.L. (via IberCaja)',
  concepto='FACTURAS PENDIENTES DEPORTE PEDROLA (transferencia)',
  fecha_factura='2026-02-02', importe=6551.19, ocr_revisado=true
WHERE id=140;

-- id=188 IberCaja -> LCM Skates (corregir importe 6213.35 -> 600.00)
UPDATE facturas SET
  tipo='justificante_bancario',
  proveedor='LCM Skates (via IberCaja)',
  concepto='Maillots Pedrola 1 (transferencia)',
  fecha_factura='2025-11-21', importe=600.00, ocr_revisado=true
WHERE id=188;

-- id=211 IberCaja -> Fed.Arag.Kickboxing
UPDATE facturas SET
  tipo='justificante_bancario',
  proveedor='Federación Aragonesa Kickboxing (via IberCaja)',
  concepto='Licencias Pedrola Kickboxing (transferencia)',
  fecha_factura='2026-02-12', importe=1019.00, ocr_revisado=true
WHERE id=211;

-- id=195 IberCaja -> Porteromania SL
UPDATE facturas SET
  tipo='justificante_bancario',
  proveedor='Porteromania SL (via IberCaja)',
  concepto='WWW 202500536987 Deporte Pedrola (transferencia)',
  fecha_factura='2025-09-12', importe=1010.97, ocr_revisado=true
WHERE id=195;

-- id=203 IberCaja -> Santiago Alfonso Rodriguez (ropa kick)
UPDATE facturas SET
  tipo='justificante_bancario',
  proveedor='Santiago Alfonso Rodríguez (via IberCaja)',
  concepto='ROPA KICK PEDROLA (transferencia)',
  fecha_factura='2026-02-04', importe=682.00, ocr_revisado=true
WHERE id=203;

-- id=200 IberCaja -> Santiago Alfonso Rodriguez (material kick)
UPDATE facturas SET
  tipo='justificante_bancario',
  proveedor='Santiago Alfonso Rodríguez (via IberCaja)',
  concepto='Material Kick Pedrola (transferencia)',
  fecha_factura='2026-02-25', importe=610.00, ocr_revisado=true
WHERE id=200;

-- id=201 IberCaja -> Santiago Alfonso Rodriguez (material kickboxing)
UPDATE facturas SET
  tipo='justificante_bancario',
  proveedor='Santiago Alfonso Rodríguez (via IberCaja)',
  concepto='MATERIAL KICKBOXING PEDROLA (transferencia)',
  fecha_factura='2026-03-02', importe=550.00, ocr_revisado=true
WHERE id=201;

-- ============================================================
-- 4) Recibos premios torneos (2)
-- ============================================================

-- id=28 17º al 32º Maratón Fútbol Sala
UPDATE facturas SET
  tipo='recibo_premio',
  proveedor='Premios XXXVI Maratón Fútbol Sala Villa de Pedrola',
  concepto='Recibos premios efectivo, puestos 17º al 32º',
  fecha_factura='2026-02-05', importe=2200.00, ocr_revisado=true
WHERE id=28;

-- id=27 9º al 16º Maratón Fútbol Sala
UPDATE facturas SET
  tipo='recibo_premio',
  proveedor='Premios XXXVI Maratón Fútbol Sala Villa de Pedrola',
  concepto='Recibos premios efectivo, puestos 9º al 16º (8 x 200€)',
  fecha_factura='2026-04-05', importe=1600.00, ocr_revisado=true
WHERE id=27;

-- ============================================================
-- 5) Licencias federativas (Mutualidad Futbolistas)
-- ============================================================

-- id=160 Mutualidad LC156543
UPDATE facturas SET
  tipo='licencias',
  proveedor='Mutualidad de Futbolistas Españoles (Delegación Aragonesa)', nif_proveedor='G-78706660',
  numero_factura='LC156543', fecha_factura='2025-08-20',
  importe=1812.34, ocr_revisado=true
WHERE id=160;

-- id=164 Mutualidad LC159889
UPDATE facturas SET
  tipo='licencias',
  proveedor='Mutualidad de Futbolistas Españoles (Delegación Aragonesa)', nif_proveedor='G-78706660',
  numero_factura='LC159889', fecha_factura='2025-09-12',
  importe=816.26, ocr_revisado=true
WHERE id=164;

-- ============================================================
-- 6) Recibos arbitraje (1, posible multipagina)
-- ============================================================

-- id=112 Comite Aragones de Arbitros - MARZO
-- Primera pagina muestra Designacion 572946 (33.98 EUR) pero BD tiene 453.61
-- Probablemente es un PDF con varios recibos. No tocamos importe, anotamos.
UPDATE facturas SET
  tipo='recibo_arbitraje',
  proveedor='Comité Aragonés de Árbitros de Fútbol',
  concepto='Designaciones arbitrales MARZO 2026 (PDF multipágina, revisar)',
  fecha_factura='2026-03-07', ocr_revisado=false
WHERE id=112;

-- ============================================================
-- 7) Verificacion final
-- ============================================================
DO $$
DECLARE
  v_revisados INT;
  v_facturas INT;
  v_justif INT;
  v_recibo_premio INT;
  v_licencias INT;
  v_arbitraje INT;
BEGIN
  SELECT COUNT(*) INTO v_revisados FROM facturas WHERE ocr_revisado=true;
  SELECT COUNT(*) INTO v_facturas FROM facturas WHERE tipo='factura';
  SELECT COUNT(*) INTO v_justif FROM facturas WHERE tipo='justificante_bancario';
  SELECT COUNT(*) INTO v_recibo_premio FROM facturas WHERE tipo='recibo_premio';
  SELECT COUNT(*) INTO v_licencias FROM facturas WHERE tipo='licencias';
  SELECT COUNT(*) INTO v_arbitraje FROM facturas WHERE tipo='recibo_arbitraje';
  RAISE NOTICE 'Total ocr_revisado=true: %', v_revisados;
  RAISE NOTICE 'Tipos: factura=%, justificante_bancario=%, recibo_premio=%, licencias=%, recibo_arbitraje=%',
    v_facturas, v_justif, v_recibo_premio, v_licencias, v_arbitraje;
END $$;

COMMIT;