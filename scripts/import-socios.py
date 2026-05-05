#!/usr/bin/env python3
"""
Convierte el Excel de socios (exportado como CSV desde Google Sheets)
al formato de importación de Dolibarr (módulo Adherentes).

Uso:
    python3 import-socios.py socios.csv > socios_dolibarr.csv

El CSV de entrada es la exportación directa de "Socios_DP.xlsx".
El CSV de salida se sube en Dolibarr → Adherentes → Importar.

IMPORTANTE: Este archivo contiene datos personales (RGPD).
Solo ejecutar en el NAS. No commitear datos reales.
"""

import csv
import sys
import re
from datetime import datetime

SECCIONES = [
    "ATLETISMO", "BALONCESTO", "F7", "FUTBOL", "FS",
    "G.RITMICA", "KENPO", "KICKBOXING", "PATINAJE", "TRAIL", "VOLEIBOL",
]

# Equivalencia sección → tipo en Dolibarr (deben existir creados previamente)
TIPO_DOLIBARR = {
    "ATLETISMO":  "Atletismo",
    "BALONCESTO": "Baloncesto",
    "F7":         "Fútbol 7",
    "FUTBOL":     "Fútbol",
    "FS":         "Fútbol Sala",
    "G.RITMICA":  "Gimnasia Rítmica",
    "KENPO":      "Kenpo",
    "KICKBOXING": "Kickboxing",
    "PATINAJE":   "Patinaje",
    "TRAIL":      "Trail Running",
    "VOLEIBOL":   "Voleibol",
}

# Cuotas 2025/26 por sección (para nota informativa)
CUOTA = {
    "ATLETISMO": 105, "TRAIL": 105,
    "KENPO": 45, "KICKBOXING": 45,
    "FUTBOL": 32, "PATINAJE": 32,
    "BALONCESTO": 27, "F7": 27, "FS": 27, "G.RITMICA": 27,
    "VOLEIBOL": 20,
}


def limpiar_dni(valor):
    v = valor.strip()
    if v.upper() in ("ZXXXXXXXX", "NO TIENE", ""):
        return ""
    return v.upper()


def limpiar_telefono(valor):
    v = valor.strip()
    if v.upper() in ("NO TIENE", ""):
        return ""
    return re.sub(r"[^\d+]", "", v)


def convertir_fecha(valor):
    """M/D/YYYY → DD/MM/YYYY (formato Dolibarr)."""
    v = valor.strip()
    for fmt in ("%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(v, fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return ""


def limpiar_iban(valor):
    v = re.sub(r"\s+", "", valor.strip()).upper()
    if len(v) < 15:
        return ""
    return v


def calcular_cuota(secciones_inscritas):
    total = sum(CUOTA.get(s, 0) for s in secciones_inscritas)
    return total


def procesar(ruta_entrada):
    cabecera_dolibarr = [
        "ref_ext",
        "lastname",
        "firstname",
        "email",
        "phone",
        "address",
        "zip",
        "town",
        "country",
        "birth",
        "typelabel",
        "login",
        "note_public",
        "note_private",
    ]

    writer = csv.writer(sys.stdout, quoting=csv.QUOTE_ALL)
    writer.writerow(cabecera_dolibarr)

    with open(ruta_entrada, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)

        # Saltar filas hasta encontrar la cabecera real
        cabecera_real = None
        for fila in reader:
            if "APELLIDOS" in fila and "NOMBRE" in fila:
                cabecera_real = [c.strip().upper() for c in fila]
                break

        if not cabecera_real:
            print("ERROR: No se encontró la cabecera del fichero.", file=sys.stderr)
            sys.exit(1)

        def idx(nombre):
            try:
                return cabecera_real.index(nombre)
            except ValueError:
                return None

        i_num        = idx("Nº") or idx("N")
        i_email      = cabecera_real.index("DIRECCIÓN DE CORREO ELECTRÓNICO")
        i_apellidos  = cabecera_real.index("APELLIDOS")
        i_nombre     = cabecera_real.index("NOMBRE")
        i_dni        = cabecera_real.index("DNI DEL ALUMNO/A CON LETRA (SI NO TIENE DNI CONTESTAR NO TIENE)")
        i_fnac       = cabecera_real.index("FECHA DE NACIMIENTO")
        i_domicilio  = cabecera_real.index("DOMICILIO")
        i_localidad  = cabecera_real.index("LOCALIDAD")
        i_cp         = cabecera_real.index("CÓDIGO POSTAL")
        i_tel        = cabecera_real.index("TELÉFONO DEL ALUMNO/A (SI NO TIENE TELÉFONO CONTESTAR NO TIENE)")
        i_tutor_ape  = cabecera_real.index("APELLIDOS DEL O DE LA TITULAR DE LA CUENTA")
        i_tutor_dni  = cabecera_real.index("DNI TUTOR")
        i_tutor_tel  = cabecera_real.index("TELÉFONOS TUTOR")
        i_iban       = cabecera_real.index("NUMERODECUENTA")

        # Índices de secciones
        idx_sec = {}
        for sec in SECCIONES:
            col = sec if sec in cabecera_real else None
            # Alias
            aliases = {"FS": "FS", "G.RITMICA": "G.RITMICA", "F7": "F7"}
            if col is None and sec in aliases:
                col = aliases[sec]
            if col and col in cabecera_real:
                idx_sec[sec] = cabecera_real.index(col)

        for fila in reader:
            if not fila or not fila[0].strip():
                continue

            num = fila[i_num].strip() if i_num is not None else ""
            email      = fila[i_email].strip().lower()
            apellidos  = fila[i_apellidos].strip().title()
            nombre     = fila[i_nombre].strip().title()
            dni        = limpiar_dni(fila[i_dni])
            fnac       = convertir_fecha(fila[i_fnac])
            domicilio  = fila[i_domicilio].strip().title()
            localidad  = fila[i_localidad].strip().title()
            cp         = fila[i_cp].strip()
            tel        = limpiar_telefono(fila[i_tel])
            tutor_ape  = fila[i_tutor_ape].strip().title()
            tutor_dni  = limpiar_dni(fila[i_tutor_dni])
            tutor_tel  = limpiar_telefono(fila[i_tutor_tel])
            iban       = limpiar_iban(fila[i_iban])

            # Secciones inscritas
            inscritas = [
                sec for sec, i in idx_sec.items()
                if i < len(fila) and fila[i].strip() == "1"
            ]

            if not inscritas:
                inscritas = ["FUTBOL"]  # fallback

            tipo_principal = TIPO_DOLIBARR.get(inscritas[0], inscritas[0])
            cuota = calcular_cuota(inscritas)

            # Login: primera letra nombre + apellido (sin espacios, minúsculas)
            login_base = (nombre[0] + apellidos.replace(" ", "")).lower()
            login = re.sub(r"[^a-z0-9]", "", login_base)[:20]
            if num:
                login = f"{login}{num}"

            secciones_str = ", ".join(TIPO_DOLIBARR.get(s, s) for s in inscritas)

            nota_publica = f"Temporada 2025/26 | Secciones: {secciones_str} | Cuota: {cuota}€/año"

            nota_privada_parts = []
            if dni:
                nota_privada_parts.append(f"DNI alumno: {dni}")
            if tutor_ape:
                nota_privada_parts.append(f"Tutor: {tutor_ape}")
            if tutor_dni:
                nota_privada_parts.append(f"DNI tutor: {tutor_dni}")
            if tutor_tel:
                nota_privada_parts.append(f"Tel. tutor: {tutor_tel}")
            if iban:
                nota_privada_parts.append(f"IBAN: {iban}")
            nota_privada = " | ".join(nota_privada_parts)

            writer.writerow([
                num,           # ref_ext
                apellidos,     # lastname
                nombre,        # firstname
                email,         # email
                tel or tutor_tel,  # phone
                domicilio,     # address
                cp,            # zip
                localidad,     # town
                "ES",          # country
                fnac,          # birth
                tipo_principal,# typelabel
                login,         # login
                nota_publica,  # note_public
                nota_privada,  # note_private
            ])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Uso: python3 {sys.argv[0]} socios.csv > socios_dolibarr.csv", file=sys.stderr)
        sys.exit(1)
    procesar(sys.argv[1])
