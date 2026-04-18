# 11 — Cloudflare Tunnel (Zero Trust)

Cómo exponer los servicios del NAS al exterior **sin abrir puertos** en
el router. El túnel lo monta `cloudflared` como contenedor/paquete
saliente desde el NAS; Cloudflare recibe todo el tráfico HTTPS externo
y lo reenvía por el túnel al puerto local que corresponda.

## Estado de partida

Según [`CLAUDE.md`](../CLAUDE.md), el NAS **ya tiene un Cloudflare
Tunnel operativo** para el otro ERP. No creamos un túnel nuevo — **solo
añadimos hostnames al existente**. No se toca la configuración de ese
otro ERP.

> ⚠️ Si al abrir el túnel aparecen hostnames que no reconoces, son del
> otro proyecto. No los toques bajo ningún concepto.

## Prerrequisitos

- [`docs/10-dns-namecheap.md`](10-dns-namecheap.md) completado: dominio
  `deportepedrola.com` activo en Cloudflare.
- `cloudflared` corriendo en el NAS (ya operativo).
- Acceso a Cloudflare Zero Trust con la cuenta del equipo que creó el
  túnel. Si la cuenta la tiene otra persona, pedirle acceso de *Admin*
  sobre el túnel concreto.

## Paso 1 — Localizar el túnel existente

1. Cloudflare dashboard → **Zero Trust** (menú lateral izquierdo).
2. **Networks** → **Tunnels**.
3. Aparece la lista de túneles. El del NAS debería estar en estado
   **HEALTHY** (punto verde). Tómalo nota de su nombre (ej. `nas-home`).
4. Click sobre el túnel → pestaña **Public Hostnames**.

## Paso 2 — Añadir los hostnames del club

### `erp.deportepedrola.com` (portal índice)

**Add a public hostname** con:

| Campo       | Valor                      |
| ----------- | -------------------------- |
| Subdomain   | `erp`                      |
| Domain      | `deportepedrola.com`       |
| Path        | *(vacío)*                  |
| Service Type| `HTTP`                     |
| URL         | `localhost:8020`           |

Guardar. Cloudflare crea automáticamente el CNAME en DNS.

No necesita WebSocket — es HTML estático.

### `contabilidad.deportepedrola.com` (Paperless)

**Add a public hostname** con:

| Campo       | Valor                      |
| ----------- | -------------------------- |
| Subdomain   | `contabilidad`             |
| Domain      | `deportepedrola.com`       |
| Path        | *(vacío)*                  |
| Service Type| `HTTP`                     |
| URL         | `localhost:8010`           |

Antes de guardar, expandir **Additional application settings**:

- **TLS**:
  - No TLS Verify: **ON** (hablamos HTTP plano al contenedor).
- **HTTP Settings**:
  - HTTP2 connection: **ON**.
  - Disable Chunked Encoding: OFF.
- **Connection**:
  - **WebSocket: ON** — imprescindible para que la UI de Paperless
    actualice en vivo el estado del OCR asíncrono.

Guardar.

### Subdominios futuros

Cuando se monten NocoDB y Metabase, añadir los hostnames siguiendo el
mismo patrón:

| Hostname                          | URL local          | WebSocket | Notas                         |
| --------------------------------- | ------------------ | --------- | ----------------------------- |
| `socios.deportepedrola.com`       | `localhost:<port>` | ON        | NocoDB usa WS para realtime.  |
| `stats.deportepedrola.com`        | `localhost:<port>` | OFF       | Metabase no lo necesita.      |

## Paso 3 — Verificar extremo a extremo

1. Abre `https://erp.deportepedrola.com` en un navegador en red externa
   (móvil con datos, no wifi del NAS). Debe cargar el portal.
2. Abre `https://contabilidad.deportepedrola.com`. Debe cargar el login
   de Paperless.

Si da 502 / 504 → ver [`docs/09-troubleshooting.md`](09-troubleshooting.md),
sección "El subdominio devuelve 502/504".

Causas habituales (vistas en producción en otro repo del mismo NAS):

- **Puerto mal en el ingress** del hostname: el compose expone `8010`
  pero el hostname apunta a `localhost:8000`. Resultado: 502. Fix:
  revisar el mapeo de puertos del `docker-compose.yml` y ajustar en
  Zero Trust.
- **Contenedor caído** o aún arrancando (healthcheck en curso). Esperar
  60s tras `docker compose up -d` la primera vez.
- **Cloudflare Access bloqueando** (si lo activaste, ver paso 4).

## Paso 4 — Cloudflare Access (protección de subdominios sensibles)

Access es un proxy de autenticación que se **pone delante** de un
hostname. Obliga al visitante a probar identidad (email OTP, Google,
GitHub...) antes de que la petición llegue al NAS.

### Qué proteger

Según [`docs/08-seguridad.md`](08-seguridad.md):

- `erp.deportepedrola.com` → **sin Access** (portal público, solo enlaces).
- `contabilidad.deportepedrola.com` → Access, solo contable + presidencia.
- `socios.deportepedrola.com` (futuro) → Access, solo junta directiva.
- `stats.deportepedrola.com` (futuro) → Access, solo junta directiva.

### Crear una Application de Access

1. Zero Trust → **Access** → **Applications** → **Add an application** →
   **Self-hosted**.
2. Rellenar:
   - **Application name**: `Club Contabilidad`.
   - **Session Duration**: `24 hours` (ajustable).
   - **Application domain**: `contabilidad.deportepedrola.com`.
3. **Identity providers**: dejar al menos **One-time PIN** (envía un
   código al email del usuario). Puedes añadir Google o GitHub si
   prefieres.
4. Siguiente → **Add a policy**:
   - **Policy name**: `Junta contabilidad`.
   - **Action**: `Allow`.
   - **Configure rules** → *Include* → *Selector: Emails* → listar
     emails explícitos (no dominios enteros salvo que sea lo deseado).
5. Siguiente → dejar el resto por defecto → Guardar.

El primer acceso tras activar Access pedirá un código por email al
usuario. Las siguientes 24h lo recordará.

> ⚠️ **Gotcha visto en producción** (otro repo del mismo NAS): si Access
> bloquea pero el servicio detrás necesita recibir peticiones no-humanas
> (ej. un webhook de GitHub), da 403 con cabeceras `Cf-Access-*`. Para
> esos paths específicos, crear una Application adicional con policy
> `Bypass / Everyone` sobre ese path concreto. En este repo, de momento,
> no hay ningún servicio que reciba webhooks entrantes, así que no
> aplica — pero tenerlo en mente.

### Eximir al portal

`erp.deportepedrola.com` se deja **sin Access** (es público por
diseño). No crees Application para ese hostname.

## Paso 5 — Guardar capturas de la configuración

Cloudflare no versiona la configuración del túnel en git. Si se pierde
la cuenta o hay que migrar:

1. Una vez configurados todos los hostnames, haz capturas de:
   - La lista de Public Hostnames del túnel.
   - El detalle de cada hostname (con los *Additional application
     settings* expandidos).
   - La lista de Access Applications.
   - El detalle de las policies.
2. Guarda las capturas en un sitio **fuera del repo** (gestor de
   contraseñas del club, carpeta interna privada, etc.). **No en el
   repo** — pueden contener emails o metadatos sensibles.

## Checklist

- [ ] Túnel existente identificado y en estado HEALTHY.
- [ ] Hostname `erp.deportepedrola.com` → `localhost:8020` creado y
      accesible desde red externa.
- [ ] Hostname `contabilidad.deportepedrola.com` → `localhost:8010`
      creado con WebSocket ON, No TLS Verify ON, HTTP/2 ON.
- [ ] Access Application para `contabilidad.deportepedrola.com`
      con policy de emails autorizados.
- [ ] Prueba de acceso exterior a ambos subdominios OK.
- [ ] Capturas de la configuración guardadas fuera del repo.
