"""
Extrae datos estructurados de una imagen de factura usando vision-router.

Autenticación: VISION_INTERNAL_API_KEY (compartida con el proyecto IA).
Proveedor:     PROVIDER_FACTURAS → kimi | ollama:qwen2.5-vl:3b
               (debe estar también en el .env del proyecto IA)

Aprendizaje few-shot: si ya hay facturas corregidas del mismo proveedor
en la BD local, se incluyen como ejemplos en el prompt para mejorar
la extracción progresivamente.
"""

import base64
import json
import os
import re
import httpx
from pathlib import Path

VISION_ROUTER_URL       = os.getenv("VISION_ROUTER_URL", "http://vision-router:8000")
VISION_INTERNAL_API_KEY = os.getenv("VISION_INTERNAL_API_KEY", "")
PROVIDER_FACTURAS       = os.getenv("PROVIDER_FACTURAS", "kimi")

SECCIONES_CLUB = os.getenv(
    "SECCIONES",
    "Atletismo,Baloncesto,F7,Fútbol,Fútbol Sala,Gimnasia Rítmica,Kenpo,Kickboxing,Patinaje,Trail Running,Voleibol,General"
).split(",")

# El modelo real lo elige vision-router según PROVIDER_FACTURAS.
# Aquí ponemos el identificador de caso de uso que reconoce el router.
_MODEL_POR_PROVEEDOR = {
    "kimi":              "moonshot-v1-32k",
    "ollama:qwen2.5-vl:3b": "qwen2.5-vl:3b",
}
VISION_MODEL = _MODEL_POR_PROVEEDOR.get(PROVIDER_FACTURAS, PROVIDER_FACTURAS)


PROMPT_BASE = """Eres un asistente de contabilidad para el Club Deportivo Elemental Deporte Pedrola (España).
Analiza este documento (factura, recibo o justificante de pago) y extrae los campos indicados.

Secciones deportivas del club: {secciones}

Devuelve ÚNICAMENTE un JSON válido con esta estructura (sin texto adicional, sin markdown):
{{
  "proveedor": "nombre del emisor del documento",
  "fecha": "DD/MM/YYYY",
  "importe_total": 0.00,
  "concepto": "descripción breve del gasto en español",
  "numero_factura": "número o referencia si existe, vacío si no",
  "secciones": ["sección1"]
}}

Reglas:
- Árbitros de fútbol → ["Fútbol"] o ["Fútbol Sala"] según corresponda
- Árbitros de baloncesto → ["Baloncesto"]
- Gestoría, seguros, licencias federativas generales → ["General"]
- Si afecta a varias secciones, incluye todas
- importe_total debe ser un número decimal (sin €)
- Si no puedes determinar un campo, usa cadena vacía o null
"""

PROMPT_EJEMPLOS = """
Ejemplos de documentos anteriores ya verificados del mismo proveedor:
{ejemplos}

Usa estos ejemplos como referencia para el nuevo documento.
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
        prompt += PROMPT_EJEMPLOS.format(ejemplos=ejs_txt)
    return prompt


def extraer_json(texto: str) -> dict:
    """Extrae el primer JSON válido del texto de respuesta."""
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
    Llama a vision-router y devuelve (datos_extraidos, raw_response).
    Los ejemplos previos corregidos se pasan como few-shot en el prompt.
    """
    ejemplos = ejemplos or []
    prompt = construir_prompt(ejemplos)

    b64 = imagen_a_base64(imagen_path)
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

    headers = {
        "Authorization": f"Bearer {VISION_INTERNAL_API_KEY}",
        "Content-Type": "application/json",
        # Indica al vision-router qué caso de uso enrutar
        "X-Use-Case": "facturas",
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{VISION_ROUTER_URL}/v1/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()

    raw = resp.json()["choices"][0]["message"]["content"]
    datos = extraer_json(raw)
    return datos, raw
