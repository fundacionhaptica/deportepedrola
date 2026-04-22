# 02 — Deploy automático

## Mecanismo principal: webhook → deploy-panel → SSH

El deploy se dispara en segundos tras el merge a `main`. El cron actúa como
fallback de 5 minutos si el webhook falla.

```
   Desarrollador        GitHub            deploy-panel        NAS
        │                 │                    │               │
        │ 1. push feat/   │                    │               │
        ├────────────────►│                    │               │
        │                 │ 2. Actions valida  │               │
        │ 3. PR → main    │                    │               │
        ├────────────────►│                    │               │
        │                 │ 4. Merge a main    │               │
        ├────────────────►│                    │               │
        │                 │                    │               │
        │                 │ 5. webhook POST    │               │
        │                 │  /hooks/<repo>     │               │
        │                 ├───────────────────►│               │
        │                 │                    │ 6. valida HMAC│
        │                 │                    │ 7. SSH →      │
        │                 │                    │  deploy.sh    │
        │                 │                    ├──────────────►│
        │                 │                    │               │ 8. git pull
        │                 │                    │               │ 9. compose
        │                 │                    │               │    pull && up -d
        │                 │                    │               │10. log timestamp
```

### Fallback: cron en el NAS (cada 5 min)

Si el webhook no llega (red, reinicio del panel), el NAS recoge el cambio:

```
   NAS cron */5 * * * *
        │ lanza scripts/deploy.sh
        │ git fetch → ¿hay cambios? → git pull → compose up -d
        │ sin cambios → exit 0 silencioso
```

## Configurar webhooks en GitHub (una vez por repo)

Para cada repositorio: **Settings → Webhooks → Add webhook**

| Campo          | Valor                                              |
| -------------- | -------------------------------------------------- |
| Payload URL    | `https://deploy.ruizespana.com/hooks/<repo>`       |
| Content type   | `application/json`                                 |
| Secret         | valor de `WEBHOOK_SECRET` del `.env` del panel     |
| Events         | **Just the push event**                            |

`<repo>` debe coincidir exactamente con las claves del `REPO_MAP` en
`services/deploy-panel/app/main.py`:

| Repo GitHub       | URL webhook                                           |
| ----------------- | ----------------------------------------------------- |
| `club`            | `https://deploy.ruizespana.com/hooks/club`            |
| `ruizespana`      | `https://deploy.ruizespana.com/hooks/ruizespana`      |
| `ERP-haptica`     | `https://deploy.ruizespana.com/hooks/ERP-haptica`     |

Al guardar, GitHub envía un `ping` (evento especial). El panel responde `pong`
con HTTP 200 — bola verde en la UI de GitHub.

**Verificar**: tras un push a `main`, hacer **Redeliver** en la UI de GitHub y
comprobar la respuesta + el log del panel:

```bash
# En el NAS:
tail -20 /volume1/docker/club/logs/deploy-panel.log
```

## Configurar el fallback en DSM Task Scheduler (una vez por repo)

**Panel de control → Programador de tareas → Crear → Tarea programada → Script definido por el usuario**

| Campo        | Valor                        |
| ------------ | ---------------------------- |
| Usuario      | `root`                       |
| Programación | cada 5 min                   |
| Script       | ver abajo                    |

Script para el repo `club`:

```bash
bash /volume1/docker/club/repo/scripts/deploy.sh >> /volume1/docker/club/logs/deploy.log 2>&1
```

Repetir para cada repo con su ruta correspondiente.

## Validación previa en GitHub Actions

`.github/workflows/validate.yml` corre en cada push y cada PR. Verifica:

1. **Sintaxis de Compose** — `docker compose config` para cada `services/*/docker-compose.yml`.
2. **Sin secretos accidentales** — falla si encuentra cualquier `.env`
   versionado (excepto los `.env.example`).
3. **`.env.example` presente** — todo `services/<x>/` debe tener su plantilla.
4. **Lint de scripts** — `shellcheck` sobre `scripts/*.sh`.

Sin verde de Actions, no se mergea a `main`.

## Script deploy.sh (cron fallback)

El script `scripts/deploy.sh` es **idempotente y silencioso si no hay cambios**:
si el hash del remoto coincide con el local, sale con código 0 sin loguear ruido.

Alternativa al Task Scheduler de DSM — añadir al crontab del operador en el NAS:

```cron
*/5 * * * * /volume1/docker/club/repo/scripts/deploy.sh >> /volume1/docker/club/logs/deploy.log 2>&1
```

## Rollback manual

El historial está en git, así que el rollback es revertir el merge:

```bash
# En tu máquina, no en el NAS
git revert <hash-del-merge> -m 1
git push origin main
```

En menos de 5 minutos el cron del NAS recoge el revert y vuelve al estado anterior.

Si necesitas un rollback inmediato sin esperar al cron, en el NAS:

```bash
cd /volume1/docker/club/repo
git fetch
git reset --hard origin/main
# Para el servicio afectado:
cd services/<servicio>
docker compose pull && docker compose up -d
```

> ⚠️ `git reset --hard` descarta cualquier cambio local no comiteado. En el
> NAS no debería haber ninguno (el repo es solo lectura desde aquí), pero
> conviene comprobar `git status` antes.

## Logs

- **Deploy**: `/volume1/docker/club/logs/deploy.log` (rotar manualmente si crece).
- **Contenedores**: `docker logs <nombre>` o desde Container Manager en DSM.
- **GitHub Actions**: pestaña *Actions* del repo en GitHub.

## Añadir un servicio nuevo

1. En tu máquina:

   ```bash
   bash scripts/new-service.sh <nombre>
   ```

   El script copia `services/paperless/` como base a `services/<nombre>/`.

2. Edita `services/<nombre>/docker-compose.yml`:
   - Cambia los `container_name` siguiendo `club-<nombre>-<rol>`.
   - Define los volúmenes en `/volume1/docker/club/<nombre>/...`.
   - Conecta a la red externa `club-network`.

3. Crea `services/<nombre>/.env.example` con la plantilla de variables.

4. Documenta el servicio en `docs/NN-<nombre>.md` (siguiente número libre).

5. Añádelo al `README.md` y al `CLAUDE.md` (tabla de servicios).

6. Abre PR. Al mergear, el cron del NAS:
   - hace `git pull`,
   - detecta el nuevo `services/<nombre>/`,
   - **no levanta nada** porque falta el `.env`.

7. En el NAS, copia `.env.example` a `.env`, rellena los secretos y haz
   `docker compose up -d` manualmente la primera vez. A partir de ahí, el
   cron lo mantendrá actualizado.

8. Añade el subdominio al Cloudflare Tunnel (Zero Trust → Tunnels → editar
   túnel → Public Hostnames).
