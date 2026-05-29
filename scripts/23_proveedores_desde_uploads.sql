-- 23_proveedores_desde_uploads.sql
-- Crea entradas en `proveedores` para los nuevos proveedores que aparecen en
-- las 470 facturas recién subidas y aún no estaban en la tabla. Las vincula.
-- Excluye etiquetas genéricas tipo IberCaja.
-- Idempotente.

BEGIN;

-- 1) Insertar proveedores nuevos
INSERT INTO proveedores (nombre)
SELECT DISTINCT trim(proveedor)
FROM facturas f
WHERE f.proveedor IS NOT NULL
  AND trim(f.proveedor) <> ''
  AND f.proveedor_id IS NULL
  AND trim(f.proveedor) NOT ILIKE 'IberCaja%'
GROUP BY trim(proveedor)
ON CONFLICT (nombre) DO NOTHING;

-- 2) Vincular facturas con su proveedor_id
UPDATE facturas f SET proveedor_id = p.id
FROM proveedores p
WHERE f.proveedor_id IS NULL
  AND trim(f.proveedor) = p.nombre;

DO $$
DECLARE v_total INT; v_vinc INT; v_sin_prov INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM proveedores;
  SELECT COUNT(*) INTO v_vinc FROM facturas WHERE proveedor_id IS NOT NULL;
  SELECT COUNT(*) INTO v_sin_prov FROM facturas WHERE proveedor_id IS NULL AND tipo IN ('factura','justificante_bancario','cobro_bancario');
  RAISE NOTICE 'Total proveedores: %', v_total;
  RAISE NOTICE 'Facturas vinculadas: %', v_vinc;
  RAISE NOTICE 'Movimientos importantes sin proveedor: %', v_sin_prov;
END $$;

COMMIT;