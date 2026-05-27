# Auditoría inicial — App `club` Deporte Pedrola

Fecha: 2026-05-27. Auditor: Cowork (asistente Claude).
Objetivo: documentar el estado real de la app antes de tocar nada, para no romper 42 h de uptime ni datos reales en producción.

---

## 1. Estado de los contenedores en NAS

| Contenedor | Estado | Puerto | Notas |
|---|---|---|---|
| `club-app-1` | Up 42 h | `3011:3000` | Node.js + Express, build local |
| `club-db-1` | Up 42 h (healthy) | interno | PostgreSQL 16-alpine |
| `vision-router` | Up 2 semanas (healthy) | interno 8003 | **Servicio OCR propio del usuario, no conectado a la app** |
| `cloudflare-maja-2` | Up 2 semanas | — | Tunnel Cloudflare a erp.deportepedrola.com |

URL pública: `https://erp.deportepedrola.com` (apunta al 3011, según el usuario; el `CLAUDE.md` interno indica 3010, hay que reconfirmar).

---

## 2. Stack real (vs. README desactualizado)

| Capa | README dice | Realidad en código |
|---|---|---|
| Auth | Auth0 (JWT + JWKS RS256) | **JWT propio HS256** con `JWT_SECRET` y `AUTH_ADMIN_PASS/JUNTA_PASS/SOCIO_PASS` en `.env` |
| OCR | Anthropic Claude API | **Kimi (Moonshot) + Gemini fallback**. Nunca se usó Anthropic. |
| Frontend | HTML+JS vanilla + Chart.js | OK (no SPA, regla 10 de `CLAUDE.md`) |
| Pagos | Stripe Checkout | OK, sólo `mode:'payment'` (regla 9) |
| Importes | NUMERIC(10,2) | OK (regla 8) |

El README necesita actualizarse en cuanto cerremos las fases. No es bloqueante hoy.

---

## 3. Datos reales en producción

### 3.1 Base de datos PostgreSQL

| Tabla | Filas | Notas |
|---|---|---|
| `socios` | **420** | 406 con email, 1 sin fecha de nacimiento, 0 con `auth0_sub`, 0 con rol admin/junta, 0 con `pagado=true`. Todos del año `socio_desde=2025`. |
| `facturas` | **102 → 99 tras limpieza mojibake/duplicados** | 91 marcadas como revisadas, 24 proveedores distintos. Importadas por `importar-facturas.py` desde un Excel anterior. |
| `precios_actividades` | 12 | Seed inicial, todos a 0 €. Pendiente rellenar tarifas 2025/2026. |
| `fichas_deportivas` | 22 | Seed inicial, todos a 0 €. Pendiente rellenar. |
| `movimientos` | **0** | Tabla vacía — el libro de caja aún no se está alimentando. |
| `pagos` | **0** | Sin pagos registrados. |
| `cuotas_socio` | **0** | Cuotas por socio sin generar todavía. |
| `factura_distribuciones` | **0** | Reparto factura ↔ deporte sin usar. Pendiente importar 324 distribuciones desde Excel. |

> Anomalía detectada: hay un socio con `edad_max=2006 años` calculados. Algún `fecha_nacimiento` está mal cargado. No es bloqueante, lo arreglamos al verificar Fase 1.

### 3.2 Fuentes locales en `C:\DeportePedrola\`

| Archivo | Tamaño | Fecha | Estado |
|---|---|---|---|
| `Movimientos_caja.xlsx` | 47 KB | **2026-05-27 07:21** (hoy) | **324 movimientos** — 193 PDFs únicos + 131 desgloses por equipo |
| `Socios_DP.xlsx` | 94 KB | 2026-05-18 | 419 filas (formulario Google Forms) |
| `Libro_Caja_DeportePedrola_v4.xlsx` | 158 KB | 2026-05-27 | Formato de salida deseado |
| `Manual_Libro_Caja_DeportePedrola.docx` | 26 KB | 2026-05-26 | Documentación del libro de caja |
| `PROMPT_Web_NAS_OCR.md` | 10 KB | 2026-05-11 | Prompt inicial con propuesta FastAPI + HTMX |
| `DocumentosDP/Facturas/` | — | — | **Vacía** (0 archivos) |
| `DocumentosDP/justificantes/` | — | — | **Vacía** (0 archivos) |
| `DocumentosDP/procesar_justificantes.py` | 10.7 KB | 2026-05-23 | Parser regex de extractos Ibercaja, parte el PDF en páginas individuales |
| `DocumentosDP/subir_documento.py` | 9.3 KB | 2026-05-25 | Cliente HTTP que postea a /api/facturas/upload con skip_ocr=true |

Los **340 PDFs de facturas reales** están en `NAS:/volume1/docker/club/scripts/`, no en la ruta local.

### 3.3 Discrepancia importante

El Excel local tiene **324 filas** de movimientos pero sólo **193 nombres de PDF únicos**: las 131 filas "duplicadas" son **desgloses legítimos** (una misma factura PDF repartida entre varios equipos/conceptos). El script `importar-facturas.py` tenía un bug: sólo importaba la primera línea de cada PDF (descartaba los desgloses por `if fname in ya_en_bd: continue`). Por eso la BD tenía 102 facturas y `factura_distribuciones` estaba vacía. El plan ajustado importa **193 facturas con totales agregados + 324 distribuciones**.

---

## 4. Causa raíz del problema de OCR

El usuario tiene **3 servicios OCR disponibles**, pero ninguno funciona end-to-end sin API de pago:

| Proveedor | Implementado en `lib/ocr.js` | Configurado en `.env` | Estado real |
|---|---|---|---|
| Kimi (Moonshot) | Sí (primario) | Sí | Falla con PDFs escaneados (sin texto extraíble) |
| Gemini | Sí (fallback) | Sí | Resultados de baja calidad según el usuario |
| **`vision-router` propio** | **NO** | **Sí (`OCR_API_URL` + `VISION_INTERNAL_API_KEY`)** | **Corriendo y healthy, pero requiere ANTHROPIC_API_KEY que no existe → endpoint /facturas devuelve 503** |
| Anthropic / Cowork | No (eliminado) | No (nunca tuvo API) | Usuario sin acceso |

**Conclusión:** la única vía sin coste es el **workflow Cowork manual** (yo, asistente Claude desktop, leo los PDFs aplicando el prompt versionado y subo metadatos al backend con `skip_ocr=true`). Ver `WORKFLOW_OCR_COWORK.md` para el detalle. La fontanería del backend ya está (`routes/facturas.js` con ramificación `skipOcr`).

Además, `routes/facturas.js` ya implementa un **modo manual** (`POST /api/facturas/upload` con `skip_ocr=true`) protegido por `INTERNAL_API_KEY`, diseñado para subidas desde Cowork.

---

## 5. Cobertura actual de los 9 requisitos del usuario

| # | Requisito | Estado |
|---|---|---|
| 1 | Listado de socios + import masivo + cambio de categoría por edad | **Parcial.** 420 socios cargados. Import script existe (`importar-socios.js`). La vista `index.html` está; falta verificar paginación y filtros. No hay lógica de cambio de categoría por edad implementada. |
| 2 | Pago Stripe para eventos | **Hecho a nivel código.** Rutas y 6 eventos (`cuotas`, `10k`, `donacion`, `maraton-futbolsala`, `copa-futbol`, `san-silvestre`). Webhook con raw body OK. **Falta probar end-to-end.** |
| 3 | Login 3 roles (admin/junta/socio) | **Hecho.** JWT propio con 3 contraseñas. Pero **0 socios tienen rol admin/junta hoy**. |
| 4 | Libro de caja | **No hecho.** Tabla `movimientos` vacía. Hay que sincronizar con `Movimientos_caja.xlsx` local. |
| 5 | Conciliación pagos/facturas + gastos sin factura (TPV, bancos) | **No hecho.** No hay endpoint ni vista. Idea base requiere extender `routes/facturas.js` o crear `routes/conciliacion.js`. |
| 6 | Dashboard completo | **Parcial.** `gastos.html` (23 KB) e `ingresos.html` (28 KB) existen y hay rutas `dashboard`, `gastos-dashboard`, `ingresos-dashboard`. Falta verificar agregaciones reales con datos. |
| 7 | Tarifas por deporte/categoría | **Esqueleto hecho.** `precios_actividades` y `fichas_deportivas` existen pero con precio 0. Falta rellenar desde la web del club. |
| 8 | Certificados de donación | **Hecho.** `lib/certificado-donacion.js` (11 KB) + ruta + plantilla LINDE como referencia. **Aviso fiscal Ley 49/2002** (regla 5 del `CLAUDE.md`) — hay que confirmar con asesor antes de generar certificados reales. |
| 9 | Manual de usuario | **No hecho** (sólo existe `Manual_Libro_Caja_DeportePedrola.docx` del usuario). |

---

## 6. Reglas críticas vigentes (no tocar)

Heredadas del `CLAUDE.md` actual y que mantenemos:

1. Nunca commitear `.env`. Solo `.env.example`.
2. No borrar/mover ficheros sin confirmación de Jaime.
3. Webhook Stripe con `express.raw` **antes** de `express.json`.
4. OCR no destructivo: guardar `ocr_raw_json` íntegro.
5. Certificados Ley 49/2002 → confirmar con asesor antes de modificar.
6. `adelanto_presidente` siempre con `es_tesoreria=true`, no computa como ingreso real.
7. Migraciones idempotentes (`CREATE TABLE IF NOT EXISTS`).
8. Importes `NUMERIC(10,2)`. Nunca `FLOAT`.
9. Stripe sólo `mode:'payment'`.
10. Frontend sin frameworks ni build step (HTML + JS vanilla).

Convención: variables/funciones en inglés, mensajes/comentarios/commits en español.

---

## 7. Plan ajustado (basado en el estado real)

### Fase A (urgente) — OCR funcional
1. Workflow Cowork como flujo principal (sin coste). Documentado en `docs/WORKFLOW_OCR_COWORK.md`.
2. Prompt v3 versionado en `/volume1/docker/proyecto-ia/prompts/facturas.deporte-pedrola.v3.txt`.
3. Limpiar `lib/ocr.js` quitando Kimi/Gemini y dejando hook para vision-router cuando se active.
4. Mantener `subir_documento.py` (cliente Cowork → backend con `skip_ocr=true`).

### Fase B — Sincronización de datos
5. Limpiar BD: arreglar mojibake en 9 facturas y borrar 3 duplicados (script `scripts/01_limpiar_mojibake_y_duplicados.sql`). HECHO.
6. Importar 193 facturas + 324 distribuciones desde `Movimientos_caja.xlsx` local. EN CURSO.
7. Promocionar a Jaime como `rol='admin'` en BD.

### Fase C — Completar fases 4–7
8. Importar `Movimientos_caja.xlsx` → tabla `movimientos` (libro de caja).
9. Rellenar `precios_actividades` y `fichas_deportivas` con tarifas 2025/2026.
10. Verificar dashboard, certificados, Stripe end-to-end.

### Fase D — Manual + verificación final
11. Manual de usuario (docx) para admin/junta/socio.
12. Checklist de revisión humana.

---

## 8. Preguntas críticas pendientes para Jaime

1. ~~`vision-router`: ¿qué endpoint expone y qué JSON devuelve?~~ RESUELTO: expone POST /facturas pero requiere `ANTHROPIC_API_KEY` que no existe → devuelve 503. Por eso usamos workflow Cowork.
2. ~~Datos locales vacíos: `DocumentosDP/Facturas`, `/justificantes`~~ Las carpetas están vacías pero hay scripts útiles (procesar_justificantes.py, subir_documento.py) que ya conocíamos.
3. ~~Discrepancia 324 vs 102~~ RESUELTO: son 193 facturas únicas + 131 desgloses, no 222 facturas "que faltan". Importar como facturas + distribuciones.
4. **Admin**: pendiente saber qué usuario/contraseña del .env quiere usar Jaime para entrar como admin.
5. **Junta**: pendiente lista de personas con rol junta.
6. **Ley 49/2002 (certificados)**: pendiente que Jaime confirme con asesor fiscal antes de emitir certificados.