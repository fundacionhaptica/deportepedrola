import json
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pdf2image import convert_from_path
from pydantic import BaseModel

import db
import dolibarr as doli
import extractor

UPLOADS = Path("/app/uploads")
UPLOADS.mkdir(exist_ok=True)

app = FastAPI(title="OCR Facturas · CDE Deporte Pedrola")


@app.on_event("startup")
async def startup():
    await db.init_db()


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


# ── Servir frontend ──────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse("static/index.html")


# ── API ──────────────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_factura(file: UploadFile = File(...)):
    """Sube un PDF o imagen y extrae los datos con IA."""
    ext = Path(file.filename).suffix.lower()
    if ext not in (".pdf", ".png", ".jpg", ".jpeg"):
        raise HTTPException(400, "Formato no soportado. Usa PDF, PNG o JPG.")

    uid = uuid.uuid4().hex
    dest = UPLOADS / f"{uid}{ext}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Si es PDF, convertir primera página a imagen
    if ext == ".pdf":
        pages = convert_from_path(dest, dpi=200, first_page=1, last_page=1)
        img_path = UPLOADS / f"{uid}.jpg"
        pages[0].save(img_path, "JPEG", quality=90)
    else:
        img_path = dest

    # Extracción inicial sin ejemplos previos (proveedor desconocido aún)
    datos, raw = await extractor.extraer_factura(img_path)

    # Si detectó proveedor, buscar ejemplos pasados para refinar
    if datos.get("proveedor"):
        ejemplos = await db.ejemplos_por_proveedor(datos["proveedor"])
        if ejemplos:
            datos, raw = await extractor.extraer_factura(img_path, ejemplos)

    factura_id = await db.guardar_factura(file.filename, datos, raw, str(img_path))

    return {
        "id": factura_id,
        "filename": file.filename,
        "datos": datos,
        "ejemplos_usados": len(await db.ejemplos_por_proveedor(datos.get("proveedor", ""))),
    }


class DatosCorreccion(BaseModel):
    proveedor: str = ""
    fecha: str = ""
    importe_total: float | None = None
    concepto: str = ""
    numero_factura: str = ""
    secciones: list[str] = []


@app.put("/api/facturas/{factura_id}")
async def corregir(factura_id: int, datos: DatosCorreccion):
    """Guarda correcciones del usuario — estas mejoran extracciones futuras."""
    factura = await db.get_factura(factura_id)
    if not factura:
        raise HTTPException(404, "Factura no encontrada")
    await db.corregir_factura(factura_id, datos.model_dump())
    return {"ok": True, "id": factura_id}


@app.post("/api/facturas/{factura_id}/dolibarr")
async def enviar_a_dolibarr(factura_id: int):
    """Crea la factura en Dolibarr y registra el ID devuelto."""
    factura = await db.get_factura(factura_id)
    if not factura:
        raise HTTPException(404, "Factura no encontrada")
    if factura.get("dolibarr_id"):
        raise HTTPException(409, f"Ya enviada a Dolibarr con ID {factura['dolibarr_id']}")

    datos = {
        "proveedor":     factura["proveedor"],
        "fecha":         factura["fecha"],
        "importe_total": factura["importe"],
        "concepto":      factura["concepto"],
        "numero_factura": factura["num_factura"],
        "secciones":     json.loads(factura["secciones"] or "[]"),
    }
    try:
        doli_id = await doli.crear_factura_proveedor(datos)
    except Exception as e:
        raise HTTPException(502, f"Error al crear en Dolibarr: {e}")

    await db.marcar_enviada(factura_id, doli_id)
    return {"ok": True, "dolibarr_id": doli_id}


@app.post("/api/facturas/{factura_id}/reocr")
async def reintentar_ocr(factura_id: int):
    """Reintenta el OCR usando la imagen procesada guardada, sin necesidad de re-subir el PDF."""
    factura = await db.get_factura(factura_id)
    if not factura:
        raise HTTPException(404, "Factura no encontrada")

    img_path_str = factura.get("img_path") or ""
    if not img_path_str or not Path(img_path_str).exists():
        raise HTTPException(400, "Archivo original no disponible para reintento")

    img_path = Path(img_path_str)
    proveedor = factura.get("proveedor") or ""
    ejemplos = await db.ejemplos_por_proveedor(proveedor) if proveedor else []

    datos, raw = await extractor.extraer_factura(img_path, ejemplos or None)
    await db.actualizar_ocr(factura_id, datos, raw)

    return {
        "id": factura_id,
        "datos": datos,
        "ejemplos_usados": len(ejemplos),
    }


@app.get("/api/facturas")
async def listar():
    return await db.listar_facturas()


@app.get("/api/facturas/{factura_id}")
async def detalle(factura_id: int):
    f = await db.get_factura(factura_id)
    if not f:
        raise HTTPException(404, "Factura no encontrada")
    return f
