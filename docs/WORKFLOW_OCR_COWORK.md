# Workflow OCR Cowork — Deporte Pedrola

> **Por qué este workflow:** la app tiene tres capas OCR montadas (`lib/ocr.js` con Kimi/Gemini, `vision-router` con Claude, Ollama local) pero ninguna funciona end-to-end sin una API de pago que el club no tiene. Este documento describe el flujo manual asistido por Cowork (Claude desktop) que sí funciona hoy, con coste cero y calidad alta gracias al prompt versionado específico del club.

---

## 1. Cuándo usar este workflow

| Situación | Usa Cowork | Usa OCR automático |
|---|---|---|
| Procesar facturas nuevas, una o varias a la vez | Sí | No disponible hoy |
| Importar histórico desde `Movimientos_caja.xlsx` (con metadatos ya en columnas) | No (usa SQL desde sandbox) | — |
| Procesar justificantes bancarios de Ibercaja | Sí (tras `procesar_justificantes.py` que parte el PDF) | No |
| Procesar más de 50 facturas seguidas | Lento; mejor en lotes de 10–20 | — |

> El día que el club active **una** API (Anthropic / Mistral / Gemini Pro), `lib/ocr.js` puede llamarla automáticamente y este flujo pasa a ser fallback. Hasta entonces es el flujo principal.

---

## 2. Las 4 etapas del workflow

```
   1. SUBIR              2. EXTRAER           3. CONFIRMAR        4. GUARDAR
   ┌─────────┐          ┌──────────┐         ┌──────────┐         ┌────────┐
   │ Tú      │          │ Cowork   │         │ Tú       │         │ Cowork │
   │ pegas   │ ───PDF──▶│ lee PDF, │ ──JSON─▶│ revisas, │ ─OK────▶│ llama  │
   │ PDF en  │          │ aplica   │         │ corriges │         │ subir_ │
   │ el chat │          │ prompt   │         │ los      │         │ docu-  │
   │         │          │ deporte- │         │ campos   │         │ mento  │
   │         │          │ pedrola  │         │ que vea  │         │ .py    │
   └─────────┘          └──────────┘         └──────────┘         └────┬───┘
                                                                       │
                                                                       ▼
                                                                  ┌─────────┐
                                                                  │ ERP +   │
                                                                  │ BD club │
                                                                  │ + PDF   │
                                                                  │ guardado│
                                                                  └─────────┘
```

### 2.1 Subir

- Arrastras 1–20 PDFs al chat de Cowork (o me indicas la ruta dentro de la carpeta conectada).
- Yo verifico que son PDFs válidos y los abro con la herramienta `Read`.

### 2.2 Extraer

- Aplico **el prompt del club, versión vigente**: `/volume1/docker/proyecto-ia/prompts/facturas.deporte-pedrola.v3.txt` (o `justificantes-transferencia.deporte-pedrola.v1.txt` o `recibos-banco.deporte-pedrola.v1.txt` según el tipo).
- El JSON que produzco respeta exactamente esos campos y reglas (incluye `es_autobus`, `deporte`, `equipo_categoria`, líneas con `ruta_o_destino` y `deporte_linea`/`equipo_categoria_linea`).
- **Cambios v1 → v2 → v3:**
  - **v1:** no extraía equipo/categoría.
  - **v2:** añadió `deporte` y `equipo_categoria` pero usaba identificadores internos (`futbol`, `fs`) incoherentes con el Excel.
  - **v3 (vigente):** deportes en formato natural (Fútbol, Fútbol Sala, Pádel...) alineados con las 324 filas reales del Excel. JJEE se trata como **sufijo de liga**, no como deporte (sólo aplica a fichas Prebenjamín-Cadete). Conceptos ampliados a 17 (añadidos Seguros, Material, Premios, Maratón, Aguinaldos, Dietas...). 'Regional' y 'Femenino' aceptados solos. Proveedores habituales del club incluidos como pistas de inferencia.
  - Si la factura no menciona equipo, devuelvo `"Club"` (default, con C mayúscula como en el Excel).
- Si el PDF está borroso o tiene varias facturas mezcladas, lo digo y propongo una opción (sin inventar datos).

### 2.3 Confirmar

- Te muestro los campos extraídos en una tabla.
- Tú confirmas o corriges; especialmente importante:
  - `deporte` → si la factura no lo dice, propongo "Club" pero lo marco para tu validación.
  - `equipo_categoria` (Benjamín A, Cadete Femenino...) → casi siempre necesita revisión humana.
  - `concepto` (categoría de gasto entre las 17 válidas).
- Cualquier campo que no esté seguro 100% queda marcado como `ocr_revisado=false` para revisar después.

### 2.4 Guardar

- Llamo a `subir_documento.py` con los argumentos confirmados y `skip_ocr=true`.
- El script POSTea a `https://erp.deportepedrola.com/api/facturas/upload` con header `X-Internal-Key: $INTERNAL_API_KEY`.
- El backend (`routes/facturas.js`, ramificación `skipOcr`) inserta la fila con `ocr_revisado=true` y guarda el PDF en `/app/uploads/facturas/`.
- Te devuelvo el ID en BD y el enlace `/facturas` para verificar.

---

## 3. Valores válidos (alineados con `subir_documento.py` y Excel)

```
TIPOS:        factura, recibo, justificante, remesa, ingreso  (minúsculas)
CONCEPTOS:    Federación, Autobuses, Hotel, Fichas/Licencias, Arbitraje,
              Ropa, Gestoría, Sanciones, Cuotas, Seguros, Comité Entrenadores,
              Material, Premios, Inscripciones torneos, Maratón, Aguinaldos, Dietas
DEPORTES:     Fútbol, Fútbol Sala, F7, Baloncesto, Atletismo, Gimnasia Rítmica,
              Kenpo, Kickboxing, Patinaje, Trail, Voleibol, Pádel
              (formato natural con acentos, como en el Excel)
CATEGORIAS:   Escuelas, Prebenjamín, Benjamín, Alevín, Infantil,
              Cadete, Juvenil, Junior, Senior, Veteranos, Absoluto
SUFIJOS:      A | B | C ... (letra para varios equipos misma categoría)
              Masculino | Femenino | Mixto (género)
              JJEE | Federativa | Regional | Escolar (liga)
DEFAULT:      'Club' (mayúscula inicial) cuando no hay equipo identificable
```

Ejemplos válidos de `equipo_categoria`:
  - `Benjamín A`
  - `Cadete Femenino`
  - `Alevín JJEE`
  - `Senior Masculino A`
  - `Infantil B Federativa`
  - `Junior Masculino`, `Junior Femenino`
  - `Regional` (cuando es liga sin edad explícita)
  - `Femenino` (cuando es género sin edad)
  - `Club` (gastos generales, gestoría, comisiones, seguros generales)

Deportes que NO usan categorías por edad/equipo: `Kenpo`, `Kickboxing`, `Patinaje`, `Gimnasia Rítmica` → `equipo_categoria` habitualmente `"Club"` salvo que la factura mencione algo concreto.

**Sobre JJEE:** los Juegos Escolares de Aragón **no son un deporte**, son un programa institucional que afecta a las fichas federativas de categorías Prebenjamín-Cadete en algunos deportes. Si una factura es ficha JJEE de Fútbol, entonces `deporte = "Fútbol"` y `equipo_categoria = "Alevín JJEE"` (por ejemplo). Sólo si la factura cubre varios deportes y no se puede separar, `deporte = "Club"` con nota explicativa.

---

## 4. Casos especiales

### 4.1 Facturas con varios equipos/conceptos (desglose)

Una misma factura PDF puede repartirse entre varios equipos (ej: factura de PINA-BUS de 800 € que cubre viajes de Cadete Fútbol 300 €, Junior Baloncesto 250 €, Alevín FS 250 €). En la BD:
- 1 fila en `facturas` con totales agregados (importe = 800).
- N filas en `factura_distribuciones` con el reparto por deporte/equipo/concepto/importe parcial.

Esto cuadra con el modelo del schema y permite dashboards detallados por equipo.

### 4.2 Facturas con varios IVAs

Uso `tipo_iva_pct` mayoritario en el campo principal y meto el desglose completo en `notas`. La conciliación del libro de caja respeta el total.

### 4.3 PDF con varias facturas dentro

Te aviso y dividimos antes de procesar. Cada factura se sube por separado.

### 4.4 Justificantes de Ibercaja

Antes de pasar por Cowork, hay que partir el PDF de extracto mensual/trimestral con `procesar_justificantes.py` (en `C:\DeportePedrola\DocumentosDP\` o en `/volume1/docker/club/ibercaja/`). Ese script genera una página por movimiento con nombre `YYYYMMDD-CONCEPTO.pdf`. Después de eso, los pasamos uno a uno por Cowork con `tipo=justificante`.

---

## 5. Qué hacer si Cowork no está disponible

- **No hay degradación silenciosa.** `lib/ocr.js` está limpio: si no hay OCR_API_URL activa, los PDFs subidos por la web se quedan con `ocr_revisado=false` y los campos vacíos, esperando revisión manual.
- Como puente, puedes subir el PDF a la web con metadatos a mano (la web acepta edición tras subida).
- Como alternativa, ejecutar `subir_documento.py` desde terminal con todos los `--` rellenos a mano.

---

## 6. Trazabilidad y auditoría

- **Cada subida queda en BD** con `created_at`, `ocr_revisado` (true/false), y el PDF original guardado en `/volume1/docker/club/documentos/facturas/`.
- Si subes el mismo PDF dos veces, el backend NO lo deduplica automáticamente todavía (TODO). De momento, comprueba con `python3 subir_documento.py --listar` antes de subir.
- El `ocr_raw_json` queda a `NULL` en las subidas manuales (no hay raw OCR). Cuando se active vision-router, sí se guardará para reprocesar.

---

## 7. Mejoras pendientes (no bloqueantes)

1. **Dedupe por hash SHA-256** en el backend. Añadir columna `archivo_hash` a `facturas` y rechazar duplicados.
2. **Histórico de cambios** sobre `facturas` (tabla `facturas_audit`).
3. **Activar vision-router** el día que haya API de pago: añadir `ANTHROPIC_API_KEY` (o cambiar `PROVIDER_FACTURAS=kimi`) en `proyecto-ia/.env` y conectar `club-app-1` a la red `ia-net`. El stub para llamar a vision-router quedará preparado en `lib/ocr.js` (paso 3d del plan).
4. **Lote masivo desde Cowork**: hoy son uno a uno. Si los lotes son grandes, podemos hacer un script que recorra una carpeta y abra una pestaña por cada PDF.

---

Versión 1.1 — 2026-05-27. Mantener en sincronía con `subir_documento.py` y los prompts en `proyecto-ia/prompts/`.