# Club Deportivo Elemental Deporte Pedrola — Infraestructura

Repositorio de infraestructura como código (IaC) del club. Contiene la definición
declarativa de los servicios autoalojados (Docker Compose), la documentación
operativa y los scripts de despliegue automatizado en el NAS Synology.

> **Uso interno del club.** No redistribuir. La transferencia de mantenimiento
> sigue el procedimiento descrito en [`docs/08-seguridad.md`](docs/08-seguridad.md).

---

## Servicios

| Servicio       | Subdominio                        | Estado        | Documentación                                  |
| -------------- | --------------------------------- | ------------- | ---------------------------------------------- |
| Portal índice  | `erp.deportepedrola.com`          | 📝 Planificado | [`docs/06-portal.md`](docs/06-portal.md)       |
| Paperless-ngx  | `contabilidad.deportepedrola.com` | 🚧 En progreso | [`docs/03-paperless.md`](docs/03-paperless.md) |
| NocoDB         | `socios.deportepedrola.com`       | 📝 Planificado | [`docs/04-nocodb.md`](docs/04-nocodb.md)       |
| Metabase       | `stats.deportepedrola.com`        | 📝 Planificado | [`docs/05-metabase.md`](docs/05-metabase.md)   |
| n8n            | (gestionado fuera del repo)       | ✅ Operativo   | —                                              |
| Verifactu SaaS | (proveedor por elegir)            | 📝 Pendiente   | —                                              |

---

## Principios de diseño

- **Declarativo.** Todo el estado de los servicios vive en este repo. El NAS solo
  ejecuta lo que está aquí descrito.
- **Pull deploy.** El NAS hace `git pull` cada 5 minutos vía cron y reconcilia
  con `docker compose up -d`. No se expone SSH ni se hace push desde fuera.
- **Aislamiento.** Red Docker `club-network` y volúmenes en
  `/volume1/docker/club/`, separados de cualquier otro servicio del NAS.
- **Secretos fuera del repo.** Solo se versionan los `.env.example`. Los `.env`
  reales viven únicamente en el NAS.
- **Documentación en español**, porque la mantienen personas del club.
- **Subdominio descriptivo, no nombre de producto** (`contabilidad`, no `paperless`):
  permite cambiar la herramienta sin cambiar la URL.

---

## Estructura del repositorio

```
.
├── CLAUDE.md                  Contexto permanente para Claude Code
├── README.md                  Este archivo
├── docs/                      Documentación operativa numerada
├── services/                  Un directorio por servicio Docker Compose
│   ├── paperless/
│   └── portal/
├── scripts/                   Bootstrap, deploy automático, scaffolding
└── .github/workflows/         Validación CI (compose, secretos, shellcheck)
```

---

## Cómo navegar el repo

- **Primera instalación** del NAS desde cero → [`docs/01-setup-inicial.md`](docs/01-setup-inicial.md).
- **Cómo funciona el auto-deploy** y cómo añadir un servicio nuevo → [`docs/02-deploy.md`](docs/02-deploy.md).
- **DNS: Namecheap → Cloudflare** → [`docs/10-dns-namecheap.md`](docs/10-dns-namecheap.md).
- **Cloudflare Tunnel y Access** → [`docs/11-cloudflare-tunnel.md`](docs/11-cloudflare-tunnel.md).
- **Diagnóstico de problemas** comunes → [`docs/09-troubleshooting.md`](docs/09-troubleshooting.md).
- **Arquitectura global** del sistema → [`docs/00-arquitectura.md`](docs/00-arquitectura.md).
- **Backups y recuperación** → [`docs/07-backups.md`](docs/07-backups.md).
- **Seguridad y RGPD** → [`docs/08-seguridad.md`](docs/08-seguridad.md).

---

## Licencia

Uso interno del **Club Deportivo Elemental Deporte Pedrola**
(CIF G99528549). Todos los derechos reservados.
