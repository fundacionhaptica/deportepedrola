-- Script 33: Vincular facturas huerfanas + trigger sincronizacion
-- Fecha: 2026-06-08

BEGIN;

-- PASO 1: Insertar proveedores que faltan
INSERT INTO proveedores (nombre, notas) VALUES
  ('IberCaja', 'Banco del club - movimientos generales')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO proveedores (nombre, notas) VALUES
  ('IberCaja (TPV)', 'IberCaja - cobros por TPV/datafono')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO proveedores (nombre, notas) VALUES
  ('IberCaja (comisiones)', 'IberCaja - comisiones bancarias')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO proveedores (nombre, notas) VALUES
  ('IberCaja (extracto)', 'IberCaja - extractos de cuenta')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO proveedores (nombre, notas) VALUES
  ('IberCaja (notificacion)', 'IberCaja - notificaciones bancarias')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO proveedores (nombre, notas) VALUES
  ('Gobierno de Aragon', 'Gobierno de Aragon - generico')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO proveedores (nombre, notas) VALUES
  ('Gobierno de Aragon - Deporte', 'Gobierno de Aragon - Direccion General del Deporte')
ON CONFLICT (nombre) DO NOTHING;

-- PASO 2: Vincular facturas huerfanas por coincidencia de nombre
UPDATE facturas f
SET proveedor_id = p.id
FROM proveedores p
WHERE f.proveedor_id IS NULL
  AND LOWER(TRIM(f.proveedor)) = LOWER(TRIM(p.nombre));

-- PASO 3: Trigger proveedores -> facturas
CREATE OR REPLACE FUNCTION sync_proveedor_a_facturas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.nombre IS DISTINCT FROM OLD.nombre OR NEW.nif IS DISTINCT FROM OLD.nif THEN
    UPDATE facturas
    SET proveedor = NEW.nombre, nif_proveedor = NEW.nif
    WHERE proveedor_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_proveedor_facturas ON proveedores;
CREATE TRIGGER trg_sync_proveedor_facturas
AFTER UPDATE ON proveedores
FOR EACH ROW
EXECUTE FUNCTION sync_proveedor_a_facturas();

-- PASO 4: Trigger facturas -> rellena texto al asignar proveedor_id
CREATE OR REPLACE FUNCTION sync_factura_desde_proveedor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.proveedor_id IS NOT NULL AND
     (NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id OR OLD.proveedor_id IS NULL) THEN
    SELECT nombre, nif
    INTO NEW.proveedor, NEW.nif_proveedor
    FROM proveedores
    WHERE id = NEW.proveedor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_factura_proveedor ON facturas;
CREATE TRIGGER trg_sync_factura_proveedor
BEFORE INSERT OR UPDATE ON facturas
FOR EACH ROW
EXECUTE FUNCTION sync_factura_desde_proveedor();

-- PASO 5: Sincronizacion inicial de texto desde FK
UPDATE facturas f
SET proveedor = p.nombre, nif_proveedor = p.nif
FROM proveedores p
WHERE f.proveedor_id = p.id
  AND (f.proveedor IS DISTINCT FROM p.nombre OR f.nif_proveedor IS DISTINCT FROM p.nif);

COMMIT;

SELECT
  COUNT(*) AS total_facturas,
  COUNT(proveedor_id) AS con_proveedor_id,
  COUNT(*) FILTER (WHERE proveedor_id IS NULL AND proveedor IS NOT NULL) AS huerfanas_restantes
FROM facturas;
