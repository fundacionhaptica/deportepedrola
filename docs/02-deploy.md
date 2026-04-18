# 02 — Deploy automático (pull desde el NAS)

## Flujo completo

```
   Desarrollador                      GitHub                         NAS
        │                               │                             │
        │ 1. push a rama feat/xxx       │                             │
        ├──────────────────────────────►│                             │
        │                               │ 2. GitHub Actions valida    │
        │                               │    (compose + secretos +    │
        │                               │     shellcheck)             │
        │ 3. PR a main                  │                             │
        ├──────────────────────────────►│                             │
        │                               │ 4. Validate.yml verde       │
        │ 5. Merge a main               │                             │
        ├──────────────────────────────►│                             │
        │                               │                             │
        │                               │  ◄──────────────────────────┤ 6. cron */5 lanza
        │                               │      git fetch              │    scripts/deploy.sh
        │                               │                             │
        │                               │  ──────────────────────────►│ 7. ¿hay cambios?
        │                               │      hash diferente            sí → git pull
        │                               │                                no → salir
        │                               │                             │
        │                               │                             │ 8. para cada
        │                               │                             │    services/<x>:
        │                               │                             │      docker compose
        │                               │                             │      pull && up -d
        │                               │                             │
        │                               │                             │ 9. log con timestamp
```

## Validación previa en GitHub Actions

`.github/workflows/validate.yml` corre en cada push y cada PR. Verifica:

1. **Sintaxis de Compose** — `docker compose config` para cada `services/*/docker-compose.yml`.
2. **Sin secretos accidentales** — falla si encuentra cualquier `.env`
   versionado (excepto los `.env.example`).
3. **`.env.example` presente** — todo `services/<x>/` debe tener su plantilla.
4. **Lint de scripts** — `shellcheck` sobre `scripts/*.sh`.

Sin verde de Actions, no se mergea a `main`.

## Configurar el cron

Una sola línea en el `crontab` del usuario operador del NAS:

```cron
*/5 * * * * /volume1/docker/club/repo/scripts/deploy.sh >> /volume1/docker/club/logs/deploy.log 2>&1
```

El script es **idempotente y silencioso si no hay cambios**: si el hash del
remoto coincide con el local, sale con código 0 sin tocar nada y sin loguear
ruido.

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
