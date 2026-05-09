import aiosqlite
import json
from datetime import datetime
from pathlib import Path

DB_PATH = Path("/app/data/facturas.db")


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS facturas (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at  TEXT    NOT NULL,
                filename    TEXT    NOT NULL,
                proveedor   TEXT,
                fecha       TEXT,
                importe     REAL,
                concepto    TEXT,
                num_factura TEXT,
                secciones   TEXT,   -- JSON list
                raw_ai      TEXT,   -- respuesta cruda de la IA
                img_path    TEXT,   -- ruta de la imagen procesada (para reintento OCR)
                corregido   INTEGER DEFAULT 0,
                dolibarr_id INTEGER
            )
        """)
        # Migración: añadir img_path si la tabla ya existía sin esa columna
        try:
            await db.execute("ALTER TABLE facturas ADD COLUMN img_path TEXT DEFAULT ''")
            await db.commit()
        except Exception:
            pass  # columna ya existe
        await db.execute("""
            CREATE TABLE IF NOT EXISTS correcciones (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                factura_id  INTEGER NOT NULL REFERENCES facturas(id),
                campo       TEXT NOT NULL,
                valor_ia    TEXT,
                valor_human TEXT,
                created_at  TEXT NOT NULL
            )
        """)
        await db.commit()


async def guardar_factura(filename: str, datos: dict, raw_ai: str, img_path: str = "") -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("""
            INSERT INTO facturas
              (created_at, filename, proveedor, fecha, importe, concepto,
               num_factura, secciones, raw_ai, img_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now().isoformat(),
            filename,
            datos.get("proveedor", ""),
            datos.get("fecha", ""),
            datos.get("importe_total"),
            datos.get("concepto", ""),
            datos.get("numero_factura", ""),
            json.dumps(datos.get("secciones", []), ensure_ascii=False),
            raw_ai,
            img_path,
        ))
        await db.commit()
        return cur.lastrowid


async def corregir_factura(factura_id: int, datos_corregidos: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        # Leer valores actuales
        cur = await db.execute(
            "SELECT proveedor, fecha, importe, concepto, num_factura, secciones FROM facturas WHERE id=?",
            (factura_id,)
        )
        row = await cur.fetchone()
        if not row:
            return

        campos = ["proveedor", "fecha", "importe", "concepto", "num_factura", "secciones"]
        actuales = dict(zip(campos, row))

        nuevos = {
            "proveedor":   datos_corregidos.get("proveedor", actuales["proveedor"]),
            "fecha":       datos_corregidos.get("fecha", actuales["fecha"]),
            "importe":     datos_corregidos.get("importe_total", actuales["importe"]),
            "concepto":    datos_corregidos.get("concepto", actuales["concepto"]),
            "num_factura": datos_corregidos.get("numero_factura", actuales["num_factura"]),
            "secciones":   json.dumps(datos_corregidos.get("secciones", json.loads(actuales["secciones"] or "[]")), ensure_ascii=False),
        }

        # Registrar diferencias como correcciones
        for campo in campos:
            v_ia = actuales[campo]
            v_human = nuevos[campo]
            if str(v_ia) != str(v_human):
                await db.execute("""
                    INSERT INTO correcciones (factura_id, campo, valor_ia, valor_human, created_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (factura_id, campo, v_ia, v_human, datetime.now().isoformat()))

        await db.execute("""
            UPDATE facturas SET
                proveedor=?, fecha=?, importe=?, concepto=?,
                num_factura=?, secciones=?, corregido=1
            WHERE id=?
        """, (
            nuevos["proveedor"], nuevos["fecha"], nuevos["importe"],
            nuevos["concepto"], nuevos["num_factura"], nuevos["secciones"],
            factura_id,
        ))
        await db.commit()


async def marcar_enviada(factura_id: int, dolibarr_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE facturas SET dolibarr_id=? WHERE id=?",
            (dolibarr_id, factura_id)
        )
        await db.commit()


async def ejemplos_por_proveedor(proveedor: str, limite: int = 4) -> list[dict]:
    """Devuelve los últimos N ejemplos corregidos del mismo proveedor."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("""
            SELECT proveedor, fecha, importe, concepto, num_factura, secciones
            FROM facturas
            WHERE corregido=1
              AND proveedor LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (f"%{proveedor[:10]}%", limite))
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def listar_facturas(limite: int = 50) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("""
            SELECT id, created_at, filename, proveedor, fecha, importe,
                   concepto, secciones, corregido, dolibarr_id
            FROM facturas
            ORDER BY created_at DESC
            LIMIT ?
        """, (limite,))
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_factura(factura_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM facturas WHERE id=?", (factura_id,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def actualizar_ocr(factura_id: int, datos: dict, raw_ai: str):
    """Sobreescribe los datos OCR de una factura y resetea el flag corregido."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            UPDATE facturas SET
                proveedor=?, fecha=?, importe=?, concepto=?,
                num_factura=?, secciones=?, raw_ai=?, corregido=0
            WHERE id=?
        """, (
            datos.get("proveedor", ""),
            datos.get("fecha", ""),
            datos.get("importe_total"),
            datos.get("concepto", ""),
            datos.get("numero_factura", ""),
            json.dumps(datos.get("secciones", []), ensure_ascii=False),
            raw_ai,
            factura_id,
        ))
        await db.commit()
