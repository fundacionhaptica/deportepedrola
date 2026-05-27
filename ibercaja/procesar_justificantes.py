"""
procesar_justificantes.py
Lee cada pagina de un PDF de Ibercaja, extrae fecha y concepto,
y genera un PDF individual por pagina en la carpeta destino.
Nombre: YYYYMMDD-CONCEPTO.pdf

Uso:
  python3 procesar_justificantes.py <archivo.pdf> <carpeta_destino>

Ejemplo:
  python3 procesar_justificantes.py pendientes/20260601-20260930.pdf justificantes/

Nota sobre EXTRACTO DE CUENTA CORRIENTE:
  Si el extracto ocupa varias paginas (pag 1 + continuaciones), se agrupa
  todo en un unico PDF en lugar de cortar por pagina.

Tipos de documento reconocidos:
  ESTRATEGIA DIGITAL          -> COBRO / PAGO (transferencias)
  TRATAMIENTOS ESPECIALES     -> CARGO_DGA (tributos DGA)
  GESTION REMESAS DE ADEUDOS  -> DEVOLUCION_RECIBO / DEVOLUCION_CARGO / REMESA_LIQUIDACION
  TRANSFERENCIA ABONO         -> ABONO (cobros recibidos por transferencia)
  ADEUDO RECIBO               -> RECIBO (domiciliaciones)
  EXTRACTO DE CUENTA CORRIENTE -> EXTRACTO_CUENTA (paginas agrupadas en 1 PDF)
  EXTRACTO-LIQUIDACION        -> EXTRACTO_LIQUIDACION
  ADEUDO LIQUIDACION DE CUENTA -> ADEUDO_LIQUIDACION_CUENTA
  ZARAGOZA, ...               -> NOTIFICACION_IBERCAJA
  Rango de fechas             -> EXTRACTO_SEMANAL
  ADEUDO generico             -> ADEUDO_COMISION
  RECHAZADA LA ORDEN DE PAGO  -> AVISO_RECHAZO_ADEUDO
  COMUNICACION DE RECHAZO     -> COMUNICACION_RECHAZO
"""

import re, os, sys, unicodedata
from pypdf import PdfReader, PdfWriter
import pdfplumber

MESES_ES = {
    "enero":"01","febrero":"02","marzo":"03","abril":"04",
    "mayo":"05","junio":"06","julio":"07","agosto":"08",
    "septiembre":"09","octubre":"10","noviembre":"11","diciembre":"12",
}

def sanitize(texto, max_len=50):
    texto = unicodedata.normalize("NFKD", texto).encode("ascii","ignore").decode("ascii")
    texto = re.sub(r"[^\w\s\-]","_", texto)
    texto = re.sub(r"[\s]+","_", texto.strip())
    texto = re.sub(r"_+","_", texto).strip("_")
    return texto[:max_len].upper()

def parse_date_ddmmyy(texto):
    m = re.search(r"\b(\d{2})-(\d{2})-(\d{2,4})\b", texto)
    if m:
        dd,mm,yy = m.group(1),m.group(2),m.group(3)
        if len(yy)==2: yy="20"+yy
        return f"{yy}{mm}{dd}"
    return None

def parse_date_natural(texto):
    m = re.search(r"\b(\d{1,2})\s+DE\s+([A-Za-z]+)\s+DE\s+(\d{4}|\d\.\d{3})\b", texto, re.IGNORECASE)
    if m:
        dd = m.group(1).zfill(2)
        mes = MESES_ES.get(m.group(2).lower())
        if not mes: return None
        yyyy = m.group(3).replace(".","")
        return f"{yyyy}{mes}{dd}"
    return None

def limpiar_nombre(texto):
    for patron in ["DEPORTE PEDROLA","FUTBOL PEDROLA","FUTBOL SALA PEDROLA"]:
        texto = texto.replace(patron,"").strip()
    return texto.strip()

def unique_filename(path):
    if not os.path.exists(path): return path
    base,ext = os.path.splitext(path)
    c=2
    while True:
        cand=f"{base}-{c}{ext}"
        if not os.path.exists(cand): return cand
        c+=1

def extraer_fecha_concepto(lines):
    """Clasifica una pagina y devuelve (fecha_YYYYMMDD, tipo)."""
    texto = "\n".join(lines)
    def l(i): return lines[i] if i < len(lines) else ""

    if "ESTRATEGIA DIGITAL E INNOVACION" in l(0):
        fecha = parse_date_ddmmyy(l(0)) or "SINDATA"
        linea2_limpia = limpiar_nombre(l(1))
        concepto_raw = l(2) if l(2) and l(2) not in ("PZ ESPA/A 1","") else linea2_limpia
        if not concepto_raw.strip(): concepto_raw = linea2_limpia if linea2_limpia else "TRANSFERENCIA"
        prefijo = "PAGO" if l(1).startswith("DEPORTE PEDROLA") else "COBRO"
        dest = sanitize(linea2_limpia, 35) if linea2_limpia else ""
        conc = sanitize(concepto_raw, 30)
        if dest and conc and conc not in dest:
            concepto = f"{prefijo}_{dest}_{conc}"
        elif dest:
            concepto = f"{prefijo}_{dest}"
        else:
            concepto = f"{prefijo}_{conc}" if conc else "TRANSFERENCIA"
        return fecha, concepto

    if "TRATAMIENTOS ESPECIALES" in l(0) and "CARGO DIPUTACION GENERAL DE ARAGON" in l(1):
        fecha = parse_date_ddmmyy(l(0)) or "SINDATA"
        m = re.search(r"MODELO[:\s]+(\d+)\s+(.+)", texto, re.IGNORECASE)
        if m:
            concepto = f"CARGO_DGA_M{m.group(1)}_{sanitize(m.group(2),30)}"
        else:
            concepto = "CARGO_DGA"
        return fecha, concepto

    if "GESTION REMESAS DE ADEUDOS" in l(0):
        fecha = parse_date_ddmmyy(l(1)) or parse_date_ddmmyy(texto) or "SINDATA"
        if "DETALLE LIQUIDACION INICIAL" in l(0):
            m_r = re.search(r"REMESA[:\s]+(\S+)", texto, re.IGNORECASE)
            num = sanitize(m_r.group(1),15) if m_r else ""
            return fecha, f"REMESA_LIQUIDACION_{num}" if num else "REMESA_LIQUIDACION"
        m_sde = re.search(r"SDE\S+\s+(.+?)\s+\d{4}\s+\d{4}\s+\d+\s+[\d,.]+\s+EUR", texto)
        if m_sde:
            return fecha, f"DEVOLUCION_RECIBO_{sanitize(m_sde.group(1),35)}"
        m_r = re.search(r"REMESA\s+([\d\-]+)", texto, re.IGNORECASE)
        return fecha, f"DEVOLUCION_CARGO_REMESA_{sanitize(m_r.group(1),15)}" if m_r else "DEVOLUCION_CARGO"

    if "-TRANSFERENCIA-" in l(0) and "ABONO" in l(0):
        fecha = parse_date_ddmmyy(l(1)) or "SINDATA"
        nombre = limpiar_nombre(l(2))
        conc_abono = l(3) if l(3) and not l(3).startswith(("RTE.","CTA.")) else ""
        n = sanitize(nombre, 40) if nombre else ""
        c = sanitize(conc_abono, 30) if conc_abono else ""
        if n and c: return fecha, f"ABONO_{n}_{c}"
        elif n:     return fecha, f"ABONO_{n}"
        else:       return fecha, "ABONO"

    if "A D E U D O" in l(0) and "RECIBO" in l(0):
        fecha = parse_date_ddmmyy(l(1)) or "SINDATA"
        nombre = sanitize(limpiar_nombre(l(2)), 45)
        m_mod = re.search(r"MODELO\s+(\d+)", texto, re.IGNORECASE)
        if m_mod:
            return fecha, f"RECIBO_{nombre}_M{m_mod.group(1)}" if nombre else f"RECIBO_M{m_mod.group(1)}"
        return fecha, f"RECIBO_{nombre}" if nombre else "RECIBO"

    # Pagina 1 de extracto de cuenta
    if "EXTRACTO DE CUENTA CORRIENTE" in l(0):
        return parse_date_ddmmyy(texto) or "SINDATA", "EXTRACTO_CUENTA"

    # Pagina de continuacion de extracto (empieza con digito + cabecera de tabla)
    # Se marca como _CONT para que procesar_pdf() la agrupe con la pagina anterior
    if re.match(r"^\d$", l(0)) and "F.APUNTE" in l(1):
        return parse_date_ddmmyy(texto) or "SINDATA", "_EXTRACTO_CUENTA_CONT"

    if "EXTRACTO-LIQUIDACION DE CUENTA" in l(0):
        return parse_date_ddmmyy(texto) or "SINDATA", "EXTRACTO_LIQUIDACION"

    if "ADEUDO LIQUIDACION DE CUENTA" in l(0):
        return parse_date_ddmmyy(l(1)) or "SINDATA", "ADEUDO_LIQUIDACION_CUENTA"

    if re.match(r"ZARAGOZA,", l(0), re.IGNORECASE):
        return parse_date_natural(l(0)) or "SINDATA", "NOTIFICACION_IBERCAJA"

    if "IBAN" in texto and re.search(r"\d{2}-\d{2}-\d{4} AL \d{2}-\d{2}-\d{4}", texto):
        m_r = re.search(r"(\d{2}-\d{2}-\d{4}) AL (\d{2}-\d{2}-\d{4})", texto)
        return (parse_date_ddmmyy(m_r.group(2)) if m_r else "SINDATA"), "EXTRACTO_SEMANAL"

    if "COMUNICACION DE RECHAZO" in texto:
        return parse_date_ddmmyy(l(0)) or "SINDATA", "COMUNICACION_RECHAZO"

    if "RECHAZADA LA ORDEN DE PAGO" in texto or "RECHAZO DE ADEUDOS" in texto:
        return parse_date_ddmmyy(l(0)) or "SINDATA", "AVISO_RECHAZO_ADEUDO"

    if l(0).startswith("ADEUDO"):
        return parse_date_ddmmyy(texto) or "SINDATA", "ADEUDO_COMISION"

    fecha = parse_date_ddmmyy(texto) or "SINDATA"
    return fecha, sanitize(l(0),40) if l(0) else "DOCUMENTO"


def procesar_pdf(input_pdf, output_dir):
    """
    Divide el PDF en documentos individuales.
    Los extractos de cuenta multi-pagina se agrupan en un solo PDF.
    """
    os.makedirs(output_dir, exist_ok=True)
    reader_pypdf = PdfReader(input_pdf)
    resultados = []

    # --- Paso 1: clasificar todas las paginas ---
    clasificacion = []  # lista de (fecha, concepto) por pagina
    with pdfplumber.open(input_pdf) as pdf_plumber:
        total = len(pdf_plumber.pages)
        print(f"Total paginas: {total}")
        for page in pdf_plumber.pages:
            texto = page.extract_text() or ""
            lines = [ln.strip() for ln in texto.split("\n") if ln.strip()]
            clasificacion.append(extraer_fecha_concepto(lines))

    # --- Paso 2: escribir PDFs agrupando continuaciones ---
    i = 0
    while i < total:
        fecha, concepto = clasificacion[i]

        # Extracto de cuenta: agrupar pagina 1 + todas las continuaciones seguidas
        if concepto == "EXTRACTO_CUENTA":
            paginas_grupo = [i]
            j = i + 1
            while j < total and clasificacion[j][1] == "_EXTRACTO_CUENTA_CONT":
                paginas_grupo.append(j)
                j += 1

            filename  = f"{fecha}-{concepto}.pdf"
            full_path = unique_filename(os.path.join(output_dir, filename))
            writer = PdfWriter()
            for idx in paginas_grupo:
                writer.add_page(reader_pypdf.pages[idx])
            with open(full_path, "wb") as f:
                writer.write(f)

            nombre_final = os.path.basename(full_path)
            sufijo = f" ({len(paginas_grupo)} pags)" if len(paginas_grupo) > 1 else ""
            print(f"  [{i+1:03d}/{total}] {nombre_final}{sufijo}")
            resultados.append({"pagina": i+1, "fecha": fecha, "concepto": concepto,
                               "archivo": nombre_final, "paginas": len(paginas_grupo)})
            i = j

        # Pagina de continuacion huerfana (sin extracto previo detectado): ignorar
        elif concepto == "_EXTRACTO_CUENTA_CONT":
            print(f"  [{i+1:03d}/{total}] [omitida - continuacion sin extracto padre]")
            i += 1

        # Documento normal: una pagina = un PDF
        else:
            filename  = f"{fecha}-{concepto}.pdf"
            full_path = unique_filename(os.path.join(output_dir, filename))
            writer = PdfWriter()
            writer.add_page(reader_pypdf.pages[i])
            with open(full_path, "wb") as f:
                writer.write(f)
            nombre_final = os.path.basename(full_path)
            print(f"  [{i+1:03d}/{total}] {nombre_final}")
            resultados.append({"pagina": i+1, "fecha": fecha, "concepto": concepto,
                               "archivo": nombre_final, "paginas": 1})
            i += 1

    return resultados


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python3 procesar_justificantes.py <input.pdf> <carpeta_destino>")
        sys.exit(1)
    INPUT_PDF, OUTPUT_DIR = sys.argv[1], sys.argv[2]
    if not os.path.exists(INPUT_PDF):
        print(f"Error: no se encuentra '{INPUT_PDF}'")
        sys.exit(1)
    print(f"\nProcesando: {os.path.basename(INPUT_PDF)}")
    print(f"Destino:    {OUTPUT_DIR}\n")
    resultados = procesar_pdf(INPUT_PDF, OUTPUT_DIR)
    sin_data = [r for r in resultados if r["fecha"] == "SINDATA"]
    multi   = [r for r in resultados if r.get("paginas",1) > 1]
    print(f"\nCompletado: {len(resultados)} documentos generados")
    if multi:
        print(f"Extractos multi-pagina ({len(multi)}): " + ", ".join(r['archivo'] for r in multi))
    if sin_data:
        print(f"Paginas sin fecha ({len(sin_data)}): " + ", ".join(str(r['pagina']) for r in sin_data))