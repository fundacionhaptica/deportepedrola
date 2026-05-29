# Checklist de verificación final — ERP Deporte Pedrola

Fecha: 2026-05-29. Verificador: Cowork (asistente Claude).
Rama: `feat/cowork-ocr-workflow` (al día con `origin/main`).
Último commit: `7a01967 fix(facturas): agregar MAX(numero_factura) en endpoint duplicados`.

Este documento cierra la Fase 9 del plan. Recoge lo que se ha verificado de forma reproducible, lo que queda pendiente y el porqué de cada cosa. Está pensado para que cualquier persona (Jaime o un futuro asistente) pueda re-correr las comprobaciones sin reinventarlas.

---

## 1. Estado de la infraestructura

Contenedores activos sobre el proyecto `club`:

| Contenedor | Estado | Puerto | Comentario |
|---|---|---|---|
| `club-app-1` | Up (recreate tras rebuild Fase 9) | `3011:3000` | Node 20 + Express, imagen `club-app:latest` |
| `club-db-1` | Up 34 h, healthy | interno | PostgreSQL 16-alpine, healthcheck OK |
| `cloudflare-maja-2` | Up 2 semanas | — | Tunnel Cloudflare → `erp.deportepedrola.com` |

Verificación rápida:

```bash
docker ps --filter name=club --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
```

---

## 2. Login (3 roles) y JWT

Las credenciales se leen del `.env` con la convención `AUTH_<ROL>_PASS`. El payload del POST es `{usuario, clave}` (no `email/password`); la respuesta devuelve `{jwt, rol}` con expiración de 12 h.

| Rol | usuario | Resultado |
|---|---|---|
| admin | `admin` | 200, JWT firmado, permisos `read/write/delete:datos` |
| junta | `junta` | 200, JWT firmado, permisos `read/write:datos` |
| socio | `socio` | 200, JWT firmado, permisos `read:datos` |

Cualquier `usuario` desconocido o `clave` incorrecta devuelve 401. `JWT_SECRET` está en `.env`, nunca commiteado.

---

## 3. Endpoints GET (todos 200 OK tras el fix)

Probados con `curl` desde un contenedor en la red `club_deporte-net`:

| Endpoint | HTTP |
|---|---|
| `GET /api/socios` | 200 |
| `GET /api/facturas` | 200 |
| `GET /api/facturas/duplicados` | **200 (antes 500 — fix Fase 9)** |
| `GET /api/facturas/ocr-stats` | 200 |
| `GET /api/gastos/resumen` | 200 |
| `GET /api/ingresos/resumen` | 200 |
| `GET /api/movimientos` | 200 |
| `GET /api/movimientos/libro-caja` | 200 |
| `GET /api/movimientos/resumen/deporte` | 200 |
| `GET /api/movimientos/resumen/concepto` | 200 |
| `GET /api/movimientos/resumen/equipo` | 200 |
| `GET /api/precios` | 200 |
| `GET /api/cuotas` | 200 |
| `GET /api/dashboard` | 200 |
| `GET /api/pagos` | 200 |

### Bug corregido en esta fase

`GET /api/facturas/duplicados` devolvía 500 con el error:

> `column "facturas.numero_factura" must appear in the GROUP BY clause or be used in an aggregate function`

Causa: la consulta seleccionaba `numero_factura` sin agregarlo, pero el `GROUP BY` usaba `lower(trim(numero_factura))` (expresión, no la columna cruda). PostgreSQL exige que las columnas del SELECT estén en `GROUP BY` exactamente como aparecen, o envueltas en un agregado.

Fix aplicado en `routes/facturas.js` línea 86: `numero_factura,` → `MAX(numero_factura) AS numero_factura,`. Funciona porque dentro de cada grupo todas las filas tienen el mismo `numero_factura` (sólo difieren en mayúsculas/espacios que normaliza el `lower(trim(...))`), así que `MAX` devuelve una representación canónica.

Tras rebuild (`docker compose -p club build app && up -d app`) el endpoint responde 200 con `{grupos: [], ids: []}` — no hay duplicados después de la limpieza de mojibake hecha en sesión previa.

Commit: `7a01967`.

---

## 4. Endpoints de escritura (POST/PATCH/DELETE)

Probados de forma idempotente (creo → modifico → borro → la BD queda como estaba):

| Operación | Endpoint | Resultado | Observación |
|---|---|---|---|
| POST | `/api/movimientos` | 201 — devuelve `id`, `tipo`, `importe`, `es_tesoreria`, `fecha`, `created_at` | Crea un movimiento `ingreso` de 1,00 € con fecha 2026-05-29 |
| PATCH | `/api/movimientos/:id` | 200 — concepto actualizado | Sólo aplica los campos enviados; resto intactos |
| DELETE | `/api/movimientos/:id` | 200 `{ok:true}` | El borrado deja la tabla `movimientos` en 0 filas (estado previo) |

Estas pruebas confirman la cadena de auth → BD → respuesta JSON sin tocar datos reales.

---

## 5. Estado de la base de datos (conteos al cierre)

```
socios: 420
facturas: 205
factura_distribuciones: 324
cuotas_socio: 486
precios_actividades: 12
movimientos: 0
pagos: 0
```

Notas:

- `movimientos = 0` y `pagos = 0` son esperados: el libro de caja todavía no se ha alimentado y aún no se ha cobrado nada por Stripe en producción.
- Las 205 facturas son las 99 que ya estaban en BD + 106 nuevas importadas desde `Movimientos_caja.xlsx` con `02_importar_facturas_y_distribuciones.SQL` (idempotente).
- Las 324 distribuciones cubren el 100 % de las líneas del Excel, incluidas las 131 desgloses por equipo/categoría que el importador antiguo perdía.
- Las 486 cuotas son las generadas para la temporada 2025/2026 con `10_generar_cuotas_2025_2026.sql` (14.499 € teóricos).

---

## 6. Reglas críticas (CLAUDE.md) — recordatorio

Mantenidas intactas durante toda la verificación:

1. Nunca commitear `.env` (sólo `.env.example`). Confirmado: `git status` limpio en cuanto al `.env`.
2. No borrar/mover ficheros sin confirmación de Jaime. Cumplido.
3. Webhook Stripe con `express.raw` antes de `express.json`. Sin cambios.
4. OCR no destructivo (`ocr_raw_json` íntegro). Sin cambios; `lib/ocr.js` sigue siendo el hook a `vision-router` documentado en sesión previa.
5. Certificados Ley 49/2002 confirmados con asesor (commit `aa539c2`).
6. `adelanto_presidente` con `es_tesoreria=true`. Comprobado en `routes/movimientos.js` línea 134.
7. Migraciones idempotentes (`CREATE TABLE IF NOT EXISTS`, `ALTER ... IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). Cumplido en `01_*` a `11_*`.
8. Importes `NUMERIC(10,2)`. Confirmado en schema.
9. Stripe sólo `mode:'payment'`. Sin cambios.
10. Frontend HTML+JS vanilla. Sin cambios.

---

## 7. Cobertura de los 9 requisitos del usuario

| # | Requisito | Estado | Notas |
|---|---|---|---|
| 1 | Listado socios + import + categoría por edad | ✅ | 420 socios cargados, vista `v_socios_con_categoria` activa, 11 categorías oficiales |
| 2 | Stripe Checkout para eventos | ⚠️ E2E | Código corregido (bug de INSERT pagos), eventos listos. Falta cobro real (tarea #27) |
| 3 | Login 3 roles | ✅ | JWT propio HS256, contraseñas en `.env`, 3 roles probados |
| 4 | Libro de caja | ✅ código | `routes/movimientos.js` + 5 vistas SQL (`v_libro_caja_*`). Tabla vacía, alimentar a discreción |
| 5 | Conciliación pagos/facturas + gastos sin factura | ✅ | Endpoints `/gastos/resumen` y `/ingresos/resumen` funcionando |
| 6 | Dashboard asambleas | ✅ | `/api/dashboard` usa `v_libro_caja` con datos reales |
| 7 | Tarifas por deporte/categoría | ✅ | 12 actividades con precios 2025/2026 |
| 8 | Certificados donación Ley 49/2002 | ✅ | Confirmado por asesor, generación PDF probada |
| 9 | Manual de usuario | ✅ | `outputs/Manual_ERP_DeportePedrola.docx` (21 KB, 321 párrafos) |

---

## 8. Pendientes (pasarán a respaldo de Jaime, no son bloqueantes)

1. **Tarea #27 — Stripe real**. Probar un cobro de 0,50 € con tarjeta de Jaime y reembolsar. Requiere acción humana (no se puede automatizar con LIVE keys sin riesgo). El código está cerrado y testeado en modo no destructivo.
2. **Cargar movimientos**. La tabla `movimientos` está en 0. Importar el Excel `Movimientos_caja.xlsx` cuando Jaime quiera empezar a usar el libro de caja como fuente única.
3. **Llenar `Documentos DP/Facturas` local si interesa**. Hoy los 332 PDFs viven sólo en `/volume1/docker/club/scripts/` del NAS, que es lo que consume la app. La carpeta local en `C:\DeportePedrola\Documentos DP\Facturas` está vacía y sólo haría falta sincronizarla si Jaime quiere copia local.
4. **Manual**. Decidir si se mueve a `C:\DeportePedrola\` o se deja en `outputs/` para futuros editados.

---

## 9. Cómo re-correr esta verificación

Copiar y pegar:

```bash
# 1. Infra
docker ps --filter name=club --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'

# 2. Conteos BD
docker exec club-db-1 psql -U deporte -d deporte_pedrola -c "
  SELECT 'socios' tabla, COUNT(*) FROM socios UNION ALL
  SELECT 'facturas', COUNT(*) FROM facturas UNION ALL
  SELECT 'distribuciones', COUNT(*) FROM factura_distribuciones UNION ALL
  SELECT 'cuotas', COUNT(*) FROM cuotas_socio UNION ALL
  SELECT 'precios', COUNT(*) FROM precios_actividades UNION ALL
  SELECT 'movimientos', COUNT(*) FROM movimientos UNION ALL
  SELECT 'pagos', COUNT(*) FROM pagos;"

# 3. Endpoints GET (desde el propio contenedor)
JWT=$(docker exec club-app-1 wget -qO- \
  --post-data='{"usuario":"admin","clave":"'$AUTH_ADMIN_PASS'"}' \
  --header='Content-Type: application/json' \
  http://localhost:3000/api/auth/login | jq -r .jwt)

for ep in /socios /facturas /facturas/duplicados /dashboard /pagos; do
  docker exec club-app-1 wget -S --spider \
    --header="Authorization: Bearer $JWT" \
    http://localhost:3000/api$ep 2>&1 | grep 'HTTP/' | tail -1
done

# 4. Ciclo POST→PATCH→DELETE seguro
docker run --rm --network club_deporte-net curlimages/curl:latest -s \
  -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $JWT" \
  -d '{"tipo":"ingreso","concepto":"TEST","importe":1,"fecha":"2026-05-29"}' \
  http://app:3000/api/movimientos
# (capturar id; PATCH y DELETE igual)
```

---

## 10. Resumen ejecutivo

- **Fase 9 cerrada.** Todos los endpoints GET en 200 OK. POST/PATCH/DELETE del módulo nuevo de movimientos probados sin dejar residuos.
- **Bug encontrado y corregido** durante la verificación: `GET /api/facturas/duplicados`. Commit `7a01967`.
- **0 cambios destructivos** sobre datos reales. La BD termina con los mismos conteos con los que empezó.
- **Único pendiente humano**: prueba E2E de Stripe con cargo real (tarea #27).

Fin del checklist.