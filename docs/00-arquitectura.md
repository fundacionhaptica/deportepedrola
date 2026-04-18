# 00 — Arquitectura

Visión global del sistema y decisiones de diseño que dan forma a todo lo demás.

## Diagrama del sistema

```
                           Internet
                              │
                              ▼
                     ┌──────────────────┐
                     │   Cloudflare     │  DNS + WAF + Access (Zero Trust)
                     │  (deportepedrola │  · contabilidad.deportepedrola.com
                     │       .com)      │  · socios.deportepedrola.com
                     └────────┬─────────┘  · stats.deportepedrola.com
                              │            · erp.deportepedrola.com
                  Cloudflare Tunnel (saliente)
                              │
                              ▼
              ┌───────────────────────────────┐
              │     NAS Synology (DSM 7)      │
              │     IP fija, sin puertos      │
              │     abiertos en el router     │
              │                               │
              │  ┌─────────────────────────┐  │
              │  │  cloudflared (existente)│  │
              │  └────────────┬────────────┘  │
              │               │               │
              │   ┌───────────▼───────────┐   │
              │   │  Red Docker:          │   │
              │   │  club-network         │   │
              │   │                       │   │
              │   │  ┌──────────────┐     │   │
              │   │  │  portal      │     │   │
              │   │  │  nginx       │     │   │
              │   │  └──────────────┘     │   │
              │   │  ┌──────────────┐     │   │
              │   │  │  paperless   │     │   │
              │   │  │  web/db/redis│     │   │
              │   │  └──────────────┘     │   │
              │   │  ┌──────────────┐     │   │
              │   │  │  nocodb      │     │   │
              │   │  │  (futuro)    │     │   │
              │   │  └──────────────┘     │   │
              │   │  ┌──────────────┐     │   │
              │   │  │  metabase    │     │   │
              │   │  │  (futuro)    │     │   │
              │   │  └──────────────┘     │   │
              │   └───────────────────────┘   │
              │                               │
              │   /volume1/docker/club/       │
              │   ├── paperless/              │
              │   ├── portal/                 │
              │   └── ...                     │
              │                               │
              │   ┌───────────────────────┐   │
              │   │ cron */5 * * * *      │   │
              │   │ scripts/deploy.sh     │   │
              │   │   git pull + up -d    │   │
              │   └───────────────────────┘   │
              └───────────────────────────────┘
                              ▲
                              │ git pull (HTTPS, PAT/SSH read-only)
                              │
                     ┌────────┴─────────┐
                     │      GitHub      │
                     │ deportepedrola   │  ← PRs validados por GitHub Actions
                     └──────────────────┘
```

## Decisiones de diseño y justificación

### Cloudflare Tunnel en lugar de port forwarding

El NAS tiene IP fija pero **no se abren los puertos 80/443 en el router**.
El túnel saliente de Cloudflare ya está montado para otros servicios; añadir
un servicio del club consiste en sumar un hostname a la configuración del
túnel existente. Beneficios: sin exposición directa a Internet, WAF
gratuito, certificados gestionados, posibilidad de poner Cloudflare Access
delante de subdominios sensibles.

### Subdominios separados, no subrutas

Paperless-ngx, NocoDB y Metabase tienen bugs conocidos cuando se sirven bajo
una subruta. Cada servicio recibe su propio subdominio. El portal índice
(`erp.deportepedrola.com`) es solo HTML estático con enlaces.

### Subdominio descriptivo en español

`contabilidad`, no `paperless`. Si mañana se sustituye Paperless por otra
herramienta, la URL no cambia y los marcadores de la junta siguen siendo válidos.

### Red Docker dedicada

`club-network` aísla los servicios del club del otro ERP que convive en el
mismo NAS. Cada servicio del club tiene además su propio PostgreSQL — no se
comparten BBDD entre servicios.

### Auto-deploy por pull, no por push

Un cron en el NAS hace `git pull` cada 5 minutos. **No se expone SSH al
exterior**, no se guardan credenciales en GitHub, y no hay riesgo de que
un compromiso del CI deje código en producción sin revisar. El precio es
hasta 5 minutos de latencia entre merge y despliegue, asumible.

### Secretos fuera del repositorio

Cada servicio publica un `.env.example` (plantilla, sin valores). El `.env`
real solo existe en el NAS y está cubierto por `.gitignore`. CI falla si
detecta un `.env` versionado.

### Verifactu fuera del stack

El club emite menos de cinco facturas con IVA al año pero sigue obligado a
Verifactu (RD 1007/2023). Las herramientas autoalojadas evaluadas (Invoice
Ninja, Crater) **no están certificadas**. Decisión: usar un SaaS externo
certificado y solo enlazarlo desde el portal. No se integra en este repo.

## Qué NO hace este repo

- **No aloja la web pública** del club (`www.deportepedrola.com` sigue en
  Google Sites).
- **No emite facturas con IVA** (eso lo hace el SaaS Verifactu externo).
- **No gestiona n8n** (instalado y administrado aparte en el NAS, fuera del
  repo). Los servicios del club lo consumirán por webhook/API.
- **No toca el otro ERP** que convive en el NAS — recursos ajenos al
  prefijo `club-` son de otra entidad y se ignoran por completo.
- **No abre puertos** del router. Toda exposición pasa por Cloudflare Tunnel.
