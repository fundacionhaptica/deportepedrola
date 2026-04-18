# services/paperless

Stack Docker Compose de Paperless-ngx para el club.

- **Web**: `club-paperless-web` (`ghcr.io/paperless-ngx/paperless-ngx:latest`).
- **DB**: `club-paperless-db` (`postgres:16-alpine`).
- **Redis**: `club-paperless-redis` (`redis:7-alpine`).
- **Red**: `club-network` (externa, creada por `scripts/bootstrap-nas.sh`).
- **Puerto local**: `8010 → 8000`.
- **Volúmenes**: `/volume1/docker/club/paperless/{data,media,export,consume,trash,db-data}`.

URL pública (vía Cloudflare Tunnel): **`https://contabilidad.deportepedrola.com`**.

## Documentación completa

Ver [`docs/03-paperless.md`](../../docs/03-paperless.md):

- Primera instalación (generar secretos, crear `.env`, levantar contenedores).
- Configuración recomendada (corresponsales, tipos, etiquetas).
- Flujo típico de una factura.
- Mantenimiento.
- Troubleshooting específico del servicio.

## Operativa rápida

```bash
cd /volume1/docker/club/repo/services/paperless

# Estado
docker compose ps

# Logs
docker compose logs -f web

# Recrear el web tras cambiar el .env
docker compose up -d --force-recreate web

# Crear superusuario
docker compose exec web python3 manage.py createsuperuser

# Reindexar búsqueda
docker compose exec web python3 manage.py document_index reindex
```
