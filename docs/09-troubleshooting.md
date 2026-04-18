# 09 — Troubleshooting

Catálogo de problemas comunes y comandos de diagnóstico.

## Comandos de diagnóstico generales

```bash
# Estado de todos los contenedores del NAS
docker ps

# Solo los del club
docker ps --filter "name=club-"

# Logs de un contenedor (últimas 200 líneas)
docker logs --tail 200 club-paperless-web

# Logs en tiempo real
docker logs -f club-paperless-web

# Inspeccionar la red del club (qué contenedores la usan)
docker network inspect club-network

# Ver el cron del usuario actual
crontab -l

# Estado del cron del sistema
sudo systemctl status crond

# Logs del deploy automático
tail -f /volume1/docker/club/logs/deploy.log

# Estado de Cloudflare Tunnel (depende del nombre del contenedor o servicio)
docker logs --tail 100 cloudflared 2>/dev/null \
  || sudo systemctl status cloudflared
```

## El auto-deploy no aplica los cambios

**Síntoma**: hago push a `main`, pasan 5+ minutos y los contenedores siguen
con la versión anterior.

Diagnóstico ordenado:

1. **¿Está el cron activo?**
   ```bash
   crontab -l | grep deploy.sh
   sudo systemctl status crond
   ```

2. **¿Se está ejecutando el script?**
   ```bash
   tail -50 /volume1/docker/club/logs/deploy.log
   # Buscar marcas de tiempo recientes (cada 5 min).
   ```

3. **¿Hay cambios remotos visibles desde el NAS?**
   ```bash
   cd /volume1/docker/club/repo
   git fetch
   git log HEAD..origin/main --oneline
   # Si lista commits, el NAS aún no los ha pulido.
   ```

4. **¿Working tree limpio?** El `git pull` aborta si hay modificaciones
   locales sin comitear. Esto pasa si alguien edita los archivos del repo
   desde una carpeta compartida SMB.
   ```bash
   git status
   # Debe decir "nothing to commit, working tree clean".
   ```
   Si está sucio, identificar qué cambió y descartarlo o comitearlo.
   **No usar `git reset --hard` sin antes mirar qué se va a perder.**

5. **¿Falla `docker compose pull` por rate limit de Docker Hub?** Mirar el
   log del deploy. Solución: esperar o autenticar `docker login`.

## Un contenedor está caído (`Restarting` o `Exited`)

```bash
docker ps -a --filter "name=club-"
docker logs --tail 100 <nombre>
```

Causas frecuentes:

- **`.env` ausente o mal formado**: el contenedor sale al instante con
  error de variable de entorno faltante.
- **CRLF en `.env`**: ver [`docs/08-seguridad.md`](08-seguridad.md), sección
  "Editar `.env` en el NAS". Verificar con `sudo cat -A /volume1/docker/club/<servicio>/.env | grep -c '\^M'`.
- **Permisos en volumen**: UID/GID del `.env` no coincide con el dueño de
  la carpeta de datos. Corregir con `chown` o ajustar el `.env`.
- **Puerto ya en uso** por otro servicio del NAS. Cambiar el mapeo en el
  `docker-compose.yml`.
- **Conflicto de `COMPOSE_PROJECT_NAME`**: si el directorio del servicio
  fue renombrado, el nuevo `docker compose up` intentará crear contenedores
  con un project name distinto y chocarán por nombre. Pinear
  `COMPOSE_PROJECT_NAME=<nombre original>` en el `.env`.

## El subdominio devuelve 502/504

**Síntoma**: `https://contabilidad.deportepedrola.com` devuelve 502 Bad
Gateway o 504 Gateway Timeout en el navegador.

1. **¿Está el contenedor `Up`?**
   ```bash
   docker ps --filter "name=club-paperless-web"
   ```

2. **¿Responde en local?**
   ```bash
   curl -I http://localhost:8010
   # Debe devolver 200 o 302.
   ```
   Si responde local pero el subdominio no, el problema está en
   Cloudflare Tunnel.

3. **¿Está el túnel apuntando al puerto correcto?** En Cloudflare Zero
   Trust → Networks → Tunnels → editar túnel → Public Hostnames, verificar
   que el hostname apunta a `localhost:<puerto-correcto>`.

4. **¿Está el túnel vivo?**
   ```bash
   docker logs --tail 50 cloudflared 2>/dev/null \
     || sudo systemctl status cloudflared
   ```

5. **¿Hay Cloudflare Access bloqueando?** Si la cabecera de respuesta
   tiene `Cf-Access-*`, Access está interceptando. Verificar la policy
   de la Application en Cloudflare Zero Trust.

## Login en Paperless da error de CSRF / cierra sesión al instante

Falta una de las variables de hostname en el `.env`:

- `PAPERLESS_URL=https://contabilidad.deportepedrola.com`
- `PAPERLESS_ALLOWED_HOSTS=contabilidad.deportepedrola.com,localhost`
- `PAPERLESS_CORS_ALLOWED_HOSTS=https://contabilidad.deportepedrola.com`
- `PAPERLESS_CSRF_TRUSTED_ORIGINS=https://contabilidad.deportepedrola.com`
- `PAPERLESS_USE_X_FORWARD_HOST=true`

Revisar `.env`, recrear contenedor:

```bash
cd /volume1/docker/club/repo/services/paperless
docker compose up -d --force-recreate web
```

## OCR no se actualiza en tiempo real en la UI

WebSocket apagado en el túnel. Cloudflare Zero Trust → Networks → Tunnels →
editar túnel → Public Hostnames → editar el hostname → *Additional
application settings* → *Connection* → **WebSocket: ON**.

## La carpeta `consume/` no procesa los PDFs que dejo dentro

```bash
ls -la /volume1/docker/club/paperless/consume/
# Verificar dueño = UID del .env.

docker logs --tail 100 club-paperless-web | grep -i consume
```

Causas frecuentes:

- Permisos: el contenedor no puede leer/borrar el fichero. Ajustar
  `chown -R <UID>:<GID> /volume1/docker/club/paperless/consume`.
- Fichero corrupto: el log lo dirá; mover a `trash/` manualmente.
- Demasiada cola: si llegan muchos a la vez, esperar.

## Recrear un contenedor desde cero

```bash
cd /volume1/docker/club/repo/services/<servicio>
docker compose down
docker compose up -d
```

Si quieres además tirar la imagen y volver a descargarla:

```bash
docker compose pull
docker compose up -d --force-recreate
```

> ⚠️ `docker compose down -v` borra los **volúmenes anónimos**, no los
> bind mounts del NAS. Aun así, **no usar `-v`** en este proyecto: los
> datos de los servicios viven en bind mounts a `/volume1/docker/club/`,
> que no se ven afectados, pero la flag invita a confusión.

## Limpiar imágenes y contenedores huérfanos

```bash
# Ver qué se liberaría (no borra nada)
docker system df

# Borrar imágenes sin contenedor que las use, redes huérfanas, etc.
# CUIDADO: confirma antes de aceptar el prompt interactivo.
docker system prune

# Si quieres también borrar volúmenes huérfanos (no asociados a contenedor):
# REVISAR antes con `docker volume ls -f dangling=true`.
docker volume ls -f dangling=true
docker volume prune  # solo después de revisar
```

## Restaurar el repo en el NAS si queda corrupto

```bash
cd /volume1/docker/club/
mv repo repo.broken_$(date +%F)
git clone <URL-del-repo> repo
cd repo
# Verificar que el cron sigue apuntando aquí.
crontab -l | grep deploy.sh
```

Los `.env` de cada servicio viven en
`services/<servicio>/.env` y **se perderán** con esta operación. Tener una
copia segura antes de borrar `repo/`.
