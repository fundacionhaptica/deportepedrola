# CLAUDE.md

> Este archivo lo lee automáticamente Claude Code al entrar en el repositorio. Contiene el contexto permanente del proyecto, reglas y decisiones ya tomadas. **NO borrar ni renombrar.**

## Proyecto

Infraestructura digital del **Club Deportivo Elemental Deporte Pedrola** (CIF G99528549, registro #8714/1 del Registro de Entidades Deportivas de Aragón, Pedrola, Zaragoza).

Club multidisciplinar sin ánimo de lucro con ~419 socios y 11 secciones deportivas (atletismo, baloncesto, fútbol, F7, fútbol sala, gimnasia rítmica, kenpo, kickboxing, patinaje, trail running, voleibol, escuelas deportivas).

Mantenedor único: **Jaime** (presidente del club).

## Idioma

**Todas las comunicaciones, commits, documentación y comentarios en español.** Solo los nombres técnicos (variables, clases, tags de Docker) en inglés por convención.

## Reglas críticas (leer antes de actuar)

Estas reglas tienen prioridad sobre cualquier otra consideración:

1. **Nunca borrar ni mover archivos del NAS sin confirmación de Jaime.**
   Esto incluye cualquier ruta bajo `/volume1/docker/club/`, volúmenes de contenedores,
   backups y logs. En caso de duda, preguntar primero.

2. **Nunca hardcodear secretos.** Ninguna contraseña, token, API key ni clave secreta
   puede aparecer en ningún archivo versionado. Todo va en `.env` (solo en el NAS).

3. **`.env` nunca se commitea.** Solo `.env.example` es público. Si detectas un `.env`
   real en el working tree, abortar inmediatamente y avisar.

4. **Webhooks futuros deben validar HMAC.** Si algún servicio del stack expone un
   endpoint de webhook (n8n, GitHub Actions, etc.), debe verificar la firma HMAC
   antes de procesar la petición. Sin validación → rechazar la petición.

5. **SSH: usar ed25519 para claves nuevas.**
   `ssh-keygen -t ed25519 -C "nas-club"` — nunca RSA-1024 ni DSA.

## Objetivo del repositorio

Infraestructura como código (IaC) de los servicios autoalojados en el NAS Synology del club, desplegados con Docker Compose.

## Estado actual de los servicios

| Servicio  | Propósito                      | Subdominio                        | Estado        |
| --------- | ------------------------------ | --------------------------------- | ------------- |
| Portal    | Índice de acceso a servicios   | `erp.deportepedrola.com`          | 📝 Planificado |
| Paperless | Archivo documental + OCR       | `contabilidad.deportepedrola.com` | 🚧 En progreso |
| NocoDB    | BBDD de socios, cuotas, gastos | `socios.deportepedrola.com`       | 📝 Planificado |
| Metabase  | Dashboards junta/asamblea      | `stats.deportepedrola.com`        | 📝 Planificado |
| n8n       | Automatizaciones Stripe/email  | (ya existente, fuera del repo)    | ✅ Operativo   |

## Stack técnico

- **Host**: NAS Synology (DSM 7.x) con IP fija, Container Manager instalado.
- **Orquestación**: Docker Compose.
- **Red**: red Docker dedicada `club-network` (aislada de otros proyectos del NAS).
- **Exposición**: Cloudflare Tunnel (Zero Trust), sin puertos abiertos en el router.
- **DNS**: Cloudflare (dominio `deportepedrola.com`).
- **Registrar**: Namecheap.
- **CI/CD**: GitHub Actions valida PRs; el NAS hace `git pull` cada 5 min (cron).

## Mecanismo de deploy

**Solo cron pull — no hay webhook de deploy** (Decisión #6).

El NAS ejecuta `deploy.sh` cada 5 minutos vía crontab:

```
*/5 * * * * /ruta/al/repo/scripts/deploy.sh >> /volume1/docker/club/logs/deploy.log 2>&1
```

Flujo interno de `deploy.sh`:

1. Comprueba que el working tree está limpio → aborta ruidosamente si hay cambios locales.
2. `git fetch --quiet origin main`
3. Si `HEAD == origin/main` → sale silenciosamente (sin loguear, sin spam).
4. Si hay cambios: `git pull --ff-only origin main` — **FAIL-HARD** (sin `|| true`).
5. Para cada `services/*/` que tenga `docker-compose.yml` **y** `.env`:
   `docker compose pull && docker compose up -d`
6. Servicios sin `.env` → aviso en log, se saltan (no rompen el deploy global).

`bootstrap-nas.sh` se ejecuta **una sola vez** (con `sudo`) al instalar el stack por
primera vez. Es idempotente pero no es el deploy habitual.

## Estructura del repositorio

```
/
├── README.md                 # Índice maestro del proyecto
├── CLAUDE.md                 # Este archivo - contexto para Claude Code
├── .gitignore
├── .editorconfig
├── .github/
│   └── workflows/
│       └── validate.yml      # CI: valida compose y detecta .env accidentales
├── docs/
│   ├── 00-arquitectura.md
│   ├── 01-setup-inicial.md
│   ├── 02-deploy.md
│   ├── 03-paperless.md
│   ├── 04-nocodb.md          # placeholder
│   ├── 05-metabase.md        # placeholder
│   ├── 06-portal.md
│   ├── 07-backups.md
│   ├── 08-seguridad.md
│   └── 09-troubleshooting.md
├── services/
│   ├── paperless/
│   │   ├── docker-compose.yml
│   │   ├── .env.example
│   │   └── README.md
│   └── portal/
│       ├── docker-compose.yml
│       ├── Dockerfile
│       ├── html/
│       │   └── index.html
│       └── README.md
└── scripts/
    ├── bootstrap-nas.sh      # Primera instalación: crea red, carpetas
    ├── deploy.sh             # Pull + up -d (lo llama cron cada 5 min)
    └── new-service.sh        # Scaffold de un servicio nuevo
```

## Decisiones de diseño ya tomadas (NO revisitar sin motivo)

1. **Subdominios separados, no subrutas.** Paperless, NocoDB y Metabase tienen bugs conocidos con subrutas. Un subdominio por servicio + un portal índice en `erp.deportepedrola.com`.
2. **Cloudflare Tunnel, no port forwarding.** Aunque el NAS tiene IP fija, los puertos 80/443 no se abren en el router. El túnel ya existe en el NAS para otros servicios; se añaden hostnames nuevos al túnel existente.
3. **Aislamiento del otro ERP.** El NAS aloja otro ERP de una empresa distinta (otra persona jurídica). Por RGPD:
   - Red Docker separada (`club-network`).
   - Volúmenes en `/volume1/docker/club/` (distinto de donde esté el otro).
   - BBDD independientes, cada servicio con su PostgreSQL propio.
   - **No referenciar, conectar ni asumir nada del otro ERP.**
4. **Verifactu fuera del stack autoalojado.** El club emite <5 facturas con IVA/año. Obligado a Verifactu (RD 1007/2023) según confirmación del asesor fiscal. Invoice Ninja self-hosted NO soporta Verifactu. Decisión: **SaaS externo certificado** (Contasimple/Quipu/Holded), no se integra en este repo.
5. **Web pública sigue en Google Sites** (`www.deportepedrola.com`). No se toca desde aquí.
6. **Auto-deploy por pull, no por push.** El NAS hace `git pull` vía cron cada 5 min. No se expone SSH ni se guardan credenciales en GitHub.
7. **Secretos fuera del repo, siempre.** Cada servicio tiene un `.env.example` público (plantilla) y un `.env` real que SOLO existe en el NAS y está en `.gitignore`.
8. **n8n ya existe en otro subdominio del NAS**, gestionado aparte, fuera de este repo. Los servicios del club lo consumirán por webhook/API.

## Convenciones del proyecto

### Nombres de contenedores

`club-<servicio>-<rol>`, ej: `club-paperless-web`, `club-paperless-db`, `club-paperless-redis`.

### Rutas de volúmenes

`/volume1/docker/club/<servicio>/<subdir>/`, ej: `/volume1/docker/club/paperless/media/`.

### Subdominios

Descriptivos en español, no nombres de producto: `contabilidad` (no `paperless`), `socios` (no `nocodb`), `stats` (no `metabase`). Permite cambiar la herramienta sin cambiar la URL.

### Commits

Español, imperativo, descriptivo:

- `feat(paperless): añadir volumen de exportación`
- `fix(deploy): corregir permisos en script bootstrap`
- `docs(arquitectura): clarificar aislamiento de red`

### Ramas

- `main` → producción (lo que está en el NAS).
- `feat/xxx`, `fix/xxx`, `docs/xxx` → trabajo en curso.
- PR obligatorio para llegar a `main` (aunque el mantenedor sea uno solo — deja histórico revisable).

## Lo que NO debes hacer

- ❌ **No emitir facturas con IVA desde este stack.** Va contra Verifactu. Redirigir al SaaS externo.
- ❌ **No tocar el otro ERP del NAS.** Si encuentras contenedores/redes que no empiezan por `club-`, no son nuestros.
- ❌ **No mover la web pública aquí.** Sigue en Google Sites.
- ❌ **No comitear ningún `.env` real.** Si detectas uno, abortar y avisar.
- ❌ **No exponer puertos del NAS al router.** Todo vía Cloudflare Tunnel.
- ❌ **No asumir rutas, UIDs o configuración del NAS sin confirmar.** Preguntar si no está en este repo.
- ❌ **No usar herramientas de pago** salvo que expresamente se decida (el club es sin ánimo de lucro).
- ❌ **No generar contenido legal, fiscal o jurídico vinculante.** Sugerir consultar al asesor fiscal cuando aplique.
- ❌ **No borrar ni mover carpetas del NAS** (`/volume1/docker/club/`). Contienen datos de producción. Siempre confirmar con Jaime antes.

## Qué hacer cuando tengas dudas

1. Revisar los `docs/` del repo primero.
2. Si la duda es sobre infraestructura del NAS concreta (qué UID, qué puertos libres), **preguntar al usuario antes de asumir**.
3. Si la duda es sobre una decisión de arquitectura ya tomada, respetar esta decisión salvo que el usuario pida explícitamente revisarla.
4. Si el usuario propone algo que contradice una decisión de esta sección, señalarlo con cortesía y pedir confirmación antes de implementar.

## Contexto útil adicional

- **Cuotas del club 2026/2027**: 20€ (no federados/colaboradores), 27€ (JJEE Aragón), 32€ (fútbol/patinaje), 45€ (kenpo/kickboxing), 105€ (atletismo). Si un socio está en varias secciones, se suman.
- **Renovación anual**: junio. Sistema de cobro mediante formulario + Stripe + n8n.
- **Colores del club**: amarillo y negro; escudo con verde predominante.
- **Facilities**: Calle Acceso Piscina s/n, 50690 Pedrola (usadas mediante convenio con el Ayuntamiento de Pedrola).
- **Contacto**: 976 619 158 / sdmpedrola@dpz.es.
