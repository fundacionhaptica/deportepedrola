# 01 — Setup inicial del NAS

Guía paso a paso para dejar un NAS Synology limpio sirviendo los servicios del
club. **Solo se ejecuta una vez**, en la primera instalación o tras una
reinstalación completa del NAS.

## Requisitos previos

- NAS Synology con DSM 7.x.
- Container Manager (antes "Docker") instalado desde el Centro de Paquetes.
- Acceso SSH habilitado (Panel de control → Terminal y SNMP → Habilitar SSH).
- Cuenta de administrador del NAS.
- Cloudflare Tunnel ya operativo en el NAS (lo gestiona el otro ERP, ver
  [`docs/00-arquitectura.md`](00-arquitectura.md)).
- Acceso de lectura a este repositorio (PAT de GitHub o clave SSH de despliegue).

## 1. Acceder por SSH al NAS

```bash
ssh <usuario_admin>@<ip_nas>
```

Conviene usar un usuario con permisos de administrador y pertenencia al grupo
`docker`. Anota su `UID` y `GID` numéricos:

```bash
id
# uid=1026(jaime) gid=100(users) groups=100(users),101(administrators),65536(docker)
```

Estos valores se usarán más adelante para los permisos de los volúmenes de
Paperless.

## 2. Clonar el repositorio

El repo es privado. Hay dos opciones:

### Opción A — Personal Access Token (PAT)

Genera un PAT de GitHub con scope `repo` (o un fine-grained token con
permiso `Contents: Read` solo sobre este repositorio).

```bash
sudo mkdir -p /volume1/docker/club
sudo chown $USER:users /volume1/docker/club
cd /volume1/docker/club
git clone https://<usuario>:<PAT>@github.com/fundacionhaptica/deportepedrola.git repo
```

### Opción B — Clave SSH de despliegue (recomendado)

```bash
ssh-keygen -t ed25519 -C "nas-club-deploy" -f ~/.ssh/club_deploy
cat ~/.ssh/club_deploy.pub
# Pegar como Deploy Key (read-only) en GitHub → Settings del repo → Deploy keys
```

Configurar SSH para usar esta clave:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-club
  HostName github.com
  User git
  IdentityFile ~/.ssh/club_deploy
  IdentitiesOnly yes
EOF

cd /volume1/docker/club
git clone git@github-club:fundacionhaptica/deportepedrola.git repo
```

## 3. Bootstrap

```bash
cd /volume1/docker/club/repo
sudo bash scripts/bootstrap-nas.sh
```

El script:

- Verifica que existe Docker y Docker Compose.
- Crea la red Docker `club-network` si no existe.
- Crea la jerarquía de carpetas `/volume1/docker/club/<servicio>/...` para
  todos los servicios definidos en `services/`.
- Imprime tu `UID` y `GID` para que los copies a los `.env`.

## 4. Configurar Paperless

Sigue paso a paso [`docs/03-paperless.md`](03-paperless.md), sección
"Primera instalación":

1. Copiar `services/paperless/.env.example` a `.env`.
2. Generar `POSTGRES_PASSWORD` y `PAPERLESS_SECRET_KEY`.
3. Rellenar `USERMAP_UID` / `USERMAP_GID` con los valores del paso 1.
4. Levantar contenedores: `docker compose up -d`.
5. Crear superusuario.
6. Añadir el hostname `contabilidad.deportepedrola.com` al Cloudflare Tunnel.

## 5. Activar el cron de auto-deploy

Edita el cron del usuario administrador:

```bash
crontab -e
```

Añade:

```cron
*/5 * * * * /volume1/docker/club/repo/scripts/deploy.sh >> /volume1/docker/club/logs/deploy.log 2>&1
```

A partir de aquí, cada cambio que llegue a `main` en GitHub se desplegará
automáticamente en el NAS en menos de 5 minutos.

## 6. Configurar backups

Sigue [`docs/07-backups.md`](07-backups.md): Hyper Backup respaldando
`/volume1/docker/club/` entera, con rotación diaria/semanal y al menos un
destino externo (cloud cifrada o disco USB).

## Checklist final

- [ ] SSH al NAS funciona con el usuario operador.
- [ ] `id` devuelve el UID/GID correctos.
- [ ] Repo clonado en `/volume1/docker/club/repo/`.
- [ ] `docker network ls | grep club-network` devuelve la red.
- [ ] `bootstrap-nas.sh` se ejecutó sin errores.
- [ ] `services/paperless/.env` existe y tiene los secretos generados.
- [ ] `docker compose ps` en `services/paperless/` muestra los 3 contenedores `Up`.
- [ ] Superusuario de Paperless creado y login funciona en `localhost:8010`.
- [ ] Hostname `contabilidad.deportepedrola.com` en Cloudflare Tunnel apunta a
      `http://localhost:8010` con WebSockets habilitados.
- [ ] `crontab -l` muestra la línea del deploy cada 5 minutos.
- [ ] `tail -f /volume1/docker/club/logs/deploy.log` muestra ejecuciones limpias.
- [ ] Hyper Backup configurado y primera copia completa hecha.
- [ ] Backup restaurado de prueba en una carpeta temporal y verificado.
