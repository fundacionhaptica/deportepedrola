import json
import os
import httpx

DOLIBARR_URL     = os.getenv("DOLIBARR_URL", "http://club-erp-web:80")
DOLIBARR_API_KEY = os.getenv("DOLIBARR_API_KEY", "")


def _headers():
    return {"DOLAPIKEY": DOLIBARR_API_KEY, "Content-Type": "application/json"}


async def buscar_o_crear_proveedor(nombre: str) -> int:
    """Devuelve el ID del proveedor en Dolibarr, creándolo si no existe."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{DOLIBARR_URL}/api/index.php/thirdparties",
            headers=_headers(),
            params={"sqlfilters": f"(t.nom:like:'{nombre[:30]}%')", "limit": 1},
        )
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and data:
                return int(data[0]["id"])

        # Crear proveedor nuevo
        r2 = await client.post(
            f"{DOLIBARR_URL}/api/index.php/thirdparties",
            headers=_headers(),
            json={
                "name": nombre,
                "fournisseur": 1,
                "client": 0,
                "country_code": "ES",
                "status": 1,
            },
        )
        r2.raise_for_status()
        return int(r2.json())


async def crear_factura_proveedor(factura: dict) -> int:
    """
    Crea una factura de proveedor en Dolibarr y devuelve su ID.
    factura: {proveedor, fecha, importe_total, concepto, numero_factura, secciones}
    """
    if not DOLIBARR_API_KEY:
        raise ValueError("DOLIBARR_API_KEY no configurada")

    proveedor_id = await buscar_o_crear_proveedor(factura.get("proveedor", "Proveedor sin nombre"))

    # Convertir fecha DD/MM/YYYY → timestamp Unix
    fecha_str = factura.get("fecha", "")
    fecha_ts = None
    if fecha_str:
        from datetime import datetime
        try:
            fecha_ts = int(datetime.strptime(fecha_str, "%d/%m/%Y").timestamp())
        except ValueError:
            pass

    secciones = factura.get("secciones", [])
    nota = f"Secciones: {', '.join(secciones)}" if secciones else ""
    if factura.get("numero_factura"):
        nota = f"Ref. proveedor: {factura['numero_factura']} | {nota}"

    importe = float(factura.get("importe_total") or 0)

    payload = {
        "socid": proveedor_id,
        "type": 1,  # factura proveedor
        "ref_supplier": factura.get("numero_factura", ""),
        "date": fecha_ts,
        "note_public": nota,
        "lines": [
            {
                "desc": factura.get("concepto", ""),
                "qty": 1,
                "subprice": importe,
                "tva_tx": 0,  # club exento de IVA en la mayoría de gastos
                "product_type": 1,
            }
        ],
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{DOLIBARR_URL}/api/index.php/supplierinvoices",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        return int(r.json())
