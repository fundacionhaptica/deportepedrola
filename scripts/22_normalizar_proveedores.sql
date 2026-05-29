-- 22_normalizar_proveedores.sql
-- Unifica variantes mismas mayusculas/minusculas/tildes detectadas.
-- Idempotente: utiliza patrones LIKE para detectar duplicados conocidos.

BEGIN;

-- Centro de Asesoramiento y Gestion S.L. (3 variantes)
UPDATE facturas SET proveedor_id = (SELECT id FROM proveedores WHERE nombre = 'Centro de Asesoramiento y Gestión S.L.' LIMIT 1)
WHERE proveedor_id IN (
  SELECT id FROM proveedores WHERE nombre IN ('CENTRO DE ASESORAMIENTO Y GESTION S.L.', 'Centro de Asesoramiento y Gestion SL')
);
DELETE FROM proveedores WHERE nombre IN ('CENTRO DE ASESORAMIENTO Y GESTION S.L.', 'Centro de Asesoramiento y Gestion SL');

-- Actualizar campo texto facturas.proveedor para mantener consistencia
UPDATE facturas SET proveedor = 'Centro de Asesoramiento y Gestión S.L.'
WHERE proveedor_id = (SELECT id FROM proveedores WHERE nombre = 'Centro de Asesoramiento y Gestión S.L.' LIMIT 1)
  AND proveedor <> 'Centro de Asesoramiento y Gestión S.L.';

DO $$
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM proveedores;
  RAISE NOTICE 'Proveedores tras normalizar: %', v;
END $$;

COMMIT;