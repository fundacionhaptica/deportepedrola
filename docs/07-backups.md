# 07 — Backups

> **Regla de oro**: un backup que nunca se ha restaurado no es un backup, es
> una creencia.

## Estrategia general

- **Herramienta**: Hyper Backup de Synology, ya instalado en el NAS.
- **Origen**: la carpeta completa `/volume1/docker/club/`.
- **Destinos**: dos como mínimo, en sitios físicos distintos.

## Qué se respalda

```
/volume1/docker/club/
├── repo/                # Clon del repositorio (recuperable de GitHub)
├── logs/                # Útil para postmortem
├── paperless/
│   ├── data/            # Imprescindible: índice de búsqueda + config
│   ├── media/           # Imprescindible: documentos originales
│   ├── consume/         # Vacío en condiciones normales
│   ├── export/          # Útil pero recuperable desde data+media
│   ├── trash/           # Configurado a 30 días
│   └── db-data/         # Imprescindible: BBDD PostgreSQL
├── portal/              # Recuperable del repo
└── ...                  # (futuros servicios)
```

Las carpetas **imprescindibles** son las que no se pueden reconstruir
desde el repo: `paperless/media/`, `paperless/data/`, `paperless/db-data/`,
y los equivalentes de NocoDB y Metabase cuando entren.

`repo/` es recuperable clonando desde GitHub, pero incluirlo en el backup
da una restauración de un solo paso.

## Periodicidad

| Tipo            | Frecuencia | Retención       |
| --------------- | ---------- | --------------- |
| Incremental     | Diaria     | 30 días         |
| Completo        | Semanal    | 8 semanas       |
| Mensual         | Mensual    | 12 meses        |
| Anual (cierre)  | 1 vez/año  | Indefinido      |

## Destinos

1. **Disco USB cifrado** conectado al NAS — restauración rápida ante caída
   del NAS.
2. **Cloud cifrada** (Backblaze B2, Synology C2 o equivalente, con
   cifrado client-side) — protección ante incendio, robo o cifrado
   por ransomware.

> ⚠️ **Cifrado client-side obligatorio en el destino cloud**. Hyper Backup
> permite cifrar antes de subir; usa contraseña fuerte y guárdala en el
> gestor de contraseñas del club, NO en este repo.

## Antes del backup

Para minimizar inconsistencias en BBDD vivas, programar Hyper Backup para
ejecutarse de madrugada. PostgreSQL tolera bien snapshots a nivel
filesystem, pero si quieres extra seguridad:

```bash
# Pre-script de Hyper Backup (opcional)
docker exec club-paperless-db pg_dump -U paperless paperless \
  > /volume1/docker/club/paperless/db-data/dump_$(date +%F).sql
```

## Restauración

### Restauración parcial (un fichero)

Hyper Backup → Versionado → seleccionar versión → restaurar a carpeta
temporal. Comparar y mover manualmente.

### Restauración total (NAS nuevo)

1. Instalar DSM y Container Manager en el NAS de reemplazo.
2. Restaurar `/volume1/docker/club/` desde Hyper Backup.
3. Verificar permisos y UID/GID (ver [`docs/01-setup-inicial.md`](01-setup-inicial.md)).
4. Levantar contenedores: `cd services/<x> && docker compose up -d` para cada
   servicio.
5. Reconfigurar Cloudflare Tunnel apuntando al NAS nuevo.
6. Reactivar cron de deploy.

## Prueba de restauración trimestral

**Obligatoria**. Cada 3 meses:

1. Restaurar el último backup completo en una carpeta temporal del NAS
   (`/volume1/docker/club_restore_test/`).
2. Levantar Paperless en esa carpeta con un compose modificado en puerto
   distinto (ej. `8011:8000`).
3. Verificar:
   - Login funciona.
   - Búsqueda devuelve resultados.
   - Se abre un PDF aleatorio.
4. Anotar fecha y resultado en una tabla del README del backup (o en
   NocoDB cuando esté operativo).
5. Eliminar la carpeta temporal.

Sin esta prueba periódica, el backup es una creencia.

## Qué NO hace Hyper Backup

- **No es alta disponibilidad.** Si el NAS cae, los servicios están abajo
  hasta que se restaure. Para HA habría que duplicar hardware, fuera del
  alcance del club.
- **No protege contra borrado intencionado del backup.** Por eso conviene
  que la cuenta cloud tenga MFA y que el operador del NAS no tenga
  permiso de borrar versiones antiguas (configurar bucket en modo
  "object lock" si el proveedor lo soporta).
