-- 21_proveedores.sql
-- ============================================================
-- Tabla `proveedores` con ficha canónica.
-- Vincula con `facturas.proveedor_id` (FK opcional, mantenemos también el
-- campo texto facturas.proveedor por compatibilidad).
-- Pre-poblada desde proveedores distintos ya presentes en facturas.
-- Idempotente.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS proveedores (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL,
  nif          TEXT,
  direccion    TEXT,
  email        TEXT,
  telefono     TEXT,
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS proveedores_nif_idx ON proveedores (nif);
CREATE INDEX IF NOT EXISTS proveedores_nombre_lower_idx ON proveedores (LOWER(nombre));

-- Añadir referencia desde facturas (FK soft, no rompe inserciones nuevas)
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores(id);
CREATE INDEX IF NOT EXISTS facturas_proveedor_id_idx ON facturas (proveedor_id);

-- Pre-poblar con los proveedores distintos que aparecen en facturas
INSERT INTO proveedores (nombre, nif)
SELECT DISTINCT trim(proveedor),
       MAX(nif_proveedor) AS nif
FROM facturas
WHERE proveedor IS NOT NULL AND trim(proveedor) <> ''
  AND proveedor NOT ILIKE '%via IberCaja%'  -- los justificantes IberCaja no son proveedores reales
GROUP BY trim(proveedor)
ON CONFLICT (nombre) DO NOTHING;

-- Vincular facturas existentes con sus proveedores
UPDATE facturas f SET proveedor_id = p.id
FROM proveedores p
WHERE f.proveedor_id IS NULL
  AND trim(f.proveedor) = p.nombre;

DO $$
DECLARE v_total INT; v_vinc INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM proveedores;
  SELECT COUNT(*) INTO v_vinc FROM facturas WHERE proveedor_id IS NOT NULL;
  RAISE NOTICE 'Total proveedores: %', v_total;
  RAISE NOTICE 'Facturas vinculadas a proveedor: %', v_vinc;
END $$;

COMMIT;