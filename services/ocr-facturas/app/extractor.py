"""
Extrae datos estructurados de una imagen de factura usando vision-router.
Incluye few-shot learning: si ya hay facturas corregidas del mismo proveedor,
las usa como ejemplos para mejorar la extracción.
"""

import base64
import json
import os
import re
import httpx
from pathlib import Path

VISION_ROUTER_URL = os.getenv("VISION_ROUTER_URL", "http://vision-router:8000")
VISION_MODEL      = os.getenv("VISION_MODEL", "qwen2.5-vl:3b")

SECCIONES_CLUB = os.getenv(
    "SECCIONES",
    "Atletismo,Baloncesto,F7,Fútbol,Fútbol Sala,Gimnasia Rítmica,Kenpo,Kickboxing,Patinaje,Trail Running,Voleibol,General"
).split(",")

PROMPT_BASE = """Eres un asistente de contabilidad para el Club Deportivo Elemental Deporte Pedrola (España).
Analiza este documento (factura, recibo o justificante de pago) y extrae los campos indicados.

Secciones deportivas del club: {secciones}

Devuelve ÚNICAMENTE un JSON válido con esta estructura (sin texto adicional):
{{
  "proveedor": "nombre del emisor del documento",
  "fecha": "DD/MM/YYYY",
  "importe_total": 0.00,
  "concepto": "descripción breve del gasto en español",
  "numero_factura": "número o referencia si existe, vacío si no",
  "secciones": ["sección1", "sección2"]
}}

Reglas:
- Si el documento es de árbitros de fútbol → secciones: ["Fútbol"] o ["Fútbol Sala"] según corresponda
- Si es gestoría, seguros o licencias federativas generales → secciones: ["General"]
- Si el concepto afecta a varias secciones, incluye todas
- importe_total debe ser un número decimal (sin €)
- Si no puedes determinar un campo, usa cadena vacía o null
"""

PROMPT_CON_EJEMPLOS = """
Ejemplos de facturas anteriores ya verificadas del mismo proveedor:
{ejemplos}

Usando estos ejemplos como referencia, extrae los datos del nuevo documento.
"""


def imagen_a_base64(ruta: Path) -> str:
    with open(ruta, "rb") as f:
        return base64.b64encode(f.read()).decode()


def construir_prompt(ejemplos: list[dict]) -> str:
    prompt = PROMPT_BASE.format(secciones=", ".join(SECCIONES_CLUB))
    if ejemplos:
        ejs_txt = "\n".join(
            f"- Proveedor: {e['proveedor']} | Fecha: {e['fecha']} | "
            f"Importe: {e['importe']}€ | Concepto: {e['concepto']} | "
            f"Secciones: {e['secciones']}"
            for e in ejemplos
        )
        prompt += PROMPT_CON_EJEMPLOS.format(ejemplos=ejs_txt)
    return prompt


def extraer_json(texto: str) -> dict:
    """Extrae el JSON de la respuesta aunque venga con texto adicional."""
    match = re.search(r'\{.*\}', texto, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {
        "proveedor": "", "fecha": "", "importe_total": None,
        "concepto": texto[:200], "numero_factura": "", "secciones": []
    }


async def extraer_factura(imagen_path: Path, ejemplos: list[dict] = None) -> tuple[dict, str]:
    """
    Llama a vision-router con la imagen y devuelve (datos_extraidos, raw_response).
    Si hay ejemplos previos corregidos, los incluye en el prompt (few-shot).
    """
    ejemplos = ejemplos or []
    prompt = construir_prompt(ejemplos)
    b64 = imagen_a_base64(imagen_path)

    # Determinar mime type
    ext = imagen_path.suffix.lower()
    mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"

    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                ],
            }
        ],
        "temperature": 0.1,
        "max_tokens": 512,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{VISION_ROUTER_URL}/v1/chat/completions",
            json=payload,
        )
        resp.raise_for_status()

    raw = resp.json()["choices"][0]["message"]["content"]
    datos = extraer_json(raw)
    return datos, raw
