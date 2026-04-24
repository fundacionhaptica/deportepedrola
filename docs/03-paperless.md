# 03 — Paperless-ngx (contabilidad documental)

## Qué es

[Paperless-ngx](https://docs.paperless-ngx.com/) es un gestor documental con
OCR. En el club lo usamos como **archivo digital de toda la documentación
contable y administrativa**: facturas recibidas, justificantes de gasto,
recibos bancarios, convenios, subvenciones, actas, certificados de
federaciones, etc.

URL: **`https://contabilidad.deportepedrola.com`**

## Qué hace

- OCR automático en español de cualquier PDF, imagen o documento de Office.
- Indexación full-text: búsqueda por contenido del documento.
- Etiquetado, corresponsales y tipos de documento.
- Carpeta `consume/` que ingiere automáticamente todo lo que se deja dentro.
- Exportación a `export/` para backups o migración.
- Papelera con retención configurable (30 días).

## Qué NO hace

- **No emite facturas.** Para eso usaremos el SaaS Verifactu externo.
- **No es contabilidad.** Solo archiva. La contabilidad real va en NocoDB
  (tabla de gastos enlazada por código de documento de Paperless).
- **No sustituye a Hyper Backup.** Su `export/` es una copia lógica útil para
  migrar, pero el respaldo serio es el backup del NAS al completo.

## Primera instalación

### 1. Generar secretos

En el NAS:

```bash
# POSTGRES_PASSWORD: 32 caracteres alfanuméricos
openssl rand -base64 32 | tr -d '/+=' | head -c 32

# PAPERLESS_SECRET_KEY: 50+ caracteres aleatorios
openssl rand -base64 60 | tr -d '\n'
```

### 2. Crear `.env`

```bash
cd /volume1/docker/club/repo/services/paperless
cp .env.example .env
nano .env
sudo chmod 600 .env
```

Rellena:

- `USERMAP_UID=` con tu UID (`id -u`).
- `USERMAP_GID=` con tu GID (`id -g`).
- `POSTGRES_PASSWORD=` con el primer secreto.
- `PAPERLESS_SECRET_KEY=` con el segundo.
- `PAPERLESS_ADMIN_USER=admin` (nombre del superusuario — se deja así).
- `PAPERLESS_ADMIN_PASSWORD=` con `openssl rand -base64 24`.
- `PAPERLESS_ADMIN_MAIL=sdmpedrola@dpz.es`.
- `CLUB_USER_JUNTA_PASSWORD=` con otra `openssl rand -base64 24` (referencia,
  Paperless no la lee — la usarás tú al crear el usuario desde la UI).
- `CLUB_USER_OFICINA_PASSWORD=` con otra `openssl rand -base64 24` (igual).

Apunta las tres contraseñas de usuario (admin, junta, oficina) en el gestor
de contraseñas del club **antes** de cerrar el fichero.

> ⚠️ El UID/GID deben coincidir con el propietario de
> `/volume1/docker/club/paperless/`. Si no, los contenedores no podrán
> escribir en los volúmenes.

### 3. Levantar contenedores

```bash
docker compose up -d
docker compose ps
# Los tres deben estar Up. paperless-web tarda ~30s en pasar el healthcheck.
```

Al arrancar por primera vez, Paperless lee `PAPERLESS_ADMIN_USER` /
`PAPERLESS_ADMIN_PASSWORD` / `PAPERLESS_ADMIN_MAIL` y crea el superusuario
`admin` automáticamente. **No hace falta `createsuperuser`**.

### 4. Verificar acceso local

Abre `http://<ip-del-nas>:8010` desde la red del club y entra con:

- Usuario: `admin`
- Contraseña: la que pusiste en `PAPERLESS_ADMIN_PASSWORD`.

### 5. Crear los usuarios de rol `junta` y `oficina`

Desde la UI, logueado como `admin`:

1. **Settings → Users & Groups → Groups → Add**:
   - Grupo `Junta`: marcar todos los permisos *except* los que empiezan por
     `User`, `Group` y `Permission` (gestión de usuarios reservada a admin).
   - Grupo `Oficina`: marcar permisos `view_document`, `add_document`,
     `change_document`, y los de tags (`view_tag`, `add_tag`,
     `change_tag`). Dejar SIN marcar `delete_document`,
     `*_correspondent` y `*_documenttype` (no puede borrar documentos ni
     editar corresponsales/tipos).
2. **Settings → Users & Groups → Users → Add**:
   - Usuario `junta`, grupo `Junta`, contraseña = `CLUB_USER_JUNTA_PASSWORD`
     del `.env`.
   - Usuario `oficina`, grupo `Oficina`, contraseña =
     `CLUB_USER_OFICINA_PASSWORD` del `.env`.

A partir de aquí los tres roles pueden entrar a
`https://contabilidad.deportepedrola.com` con sus credenciales. Se comparten
dentro del club vía el gestor de contraseñas (ver
[`docs/08-seguridad.md`](08-seguridad.md)).

### 6. Exponer por Cloudflare Tunnel

En Cloudflare Zero Trust → Networks → Tunnels → editar el túnel del NAS →
Public Hostnames → Add a public hostname:

- **Subdomain**: `contabilidad`
- **Domain**: `deportepedrola.com`
- **Type**: `HTTP`
- **URL**: `localhost:8010`

En *Additional application settings* → *TLS*:

- **No TLS Verify**: ON (porque hablamos HTTP plano dentro del NAS).

En *Additional application settings* → *HTTP Settings*:

- **HTTP2 connection**: ON.
- **Disable Chunked Encoding**: OFF.

En *Additional application settings* → *Connection*:

- **WebSocket**: **ON** (imprescindible para algunas vistas y para el OCR
  asíncrono que actualiza la UI).

Espera 30s y abre `https://contabilidad.deportepedrola.com`. Login.

## Configuración recomendada

### Corresponsales iniciales

Da de alta como mínimo:

- Federación Aragonesa de Atletismo
- Federación Aragonesa de Baloncesto
- Federación Aragonesa de Fútbol
- Federación Aragonesa de Gimnasia
- Federación Aragonesa de Patinaje
- Federación Aragonesa de Voleibol
- Federación Aragonesa de Kárate (kenpo)
- Federación Aragonesa de Kickboxing
- Diputación Provincial de Zaragoza (DPZ)
- Comarca de Ribera Alta del Ebro
- Ayuntamiento de Pedrola
- Gobierno de Aragón — Dirección General de Deporte
- Stripe (cuotas)
- (proveedores recurrentes según vayan apareciendo)

### Tipos de documento

- Factura recibida
- Recibo / Ticket
- Justificante bancario
- Convenio
- Solicitud de subvención
- Resolución de subvención
- Certificado federativo
- Acta
- Contrato
- Otros

### Etiquetas

Tres familias, con colores distintos para distinguirlas a primera vista en la
UI:

- **Sección** (color verde): `atletismo`, `baloncesto`, `fútbol`, `f7`,
  `fútbol-sala`, `gimnasia-rítmica`, `kenpo`, `kickboxing`, `patinaje`,
  `trail-running`, `voleibol`, `escuelas-deportivas`, `general` (para gastos
  no atribuibles a una sección concreta).
- **Tipo de gasto** (color azul): `material-deportivo`, `equipaciones`,
  `instalaciones`, `arbitrajes`, `licencias-federativas`, `desplazamientos`,
  `formación`, `seguros`, `gastos-bancarios`, `cuota-socio`,
  `subvención-recibida`, `donación`, `patrocinio`.
- **Estado** (color rojo): `pendiente-de-pago`, `pagado`, `subvencionable`,
  `subvencionado`, `imputado-cuenta-anual`, `revisar`.

### Configuración global

En *Settings* → *General*:

- **Date display**: `dd/mm/yyyy`.
- **Idioma**: Español.

En *Settings* → *Trash*:

- **Days until permanent deletion**: `30`.

## Flujo típico de una factura

1. Llega una factura por email de la Federación Aragonesa de Fútbol (licencias).
2. Se descarga el PDF y se deja caer en
   `/volume1/docker/club/paperless/consume/`. (Compartir esa carpeta como
   carpeta de red del NAS facilita el flujo.)
3. Paperless detecta el archivo, hace OCR y lo ingiere en ~30s.
4. Aparece en la bandeja de entrada de la UI.
5. Se asigna corresponsal (`Federación Aragonesa de Fútbol`), tipo
   (`Factura recibida`), etiquetas (`fútbol`, `licencias-federativas`,
   `pendiente-de-pago`).
6. Cuando se paga, se cambia la etiqueta a `pagado` y se enlaza el
   justificante bancario asociado.
7. En NocoDB se registra el gasto referenciando el ASN (Archive Serial
   Number) que Paperless ha asignado al documento. Así, desde la fila del
   gasto se puede saltar al PDF.

## Mantenimiento

- **Optimización del índice**: mensual.
  ```bash
  docker compose exec web python3 manage.py document_index reindex
  ```
- **Vaciado de papelera**: automático a los 30 días.
- **Backup de exportación lógica** (opcional, complementa el de Hyper Backup):
  ```bash
  docker compose exec web document_exporter ../export -na
  ```
- **Actualizaciones**: las hace solo el cron de deploy cuando se mergea un
  cambio del `image: latest`. Conviene hacer `docker compose pull` manual
  al menos una vez al mes para forzar refresh aunque la versión apunte a
  `latest`.

## Troubleshooting

| Síntoma                                         | Causa probable                                              | Solución                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 502/504 al abrir `contabilidad.deportepedrola.com` | El contenedor `web` no está `Up` o no pasa healthcheck. | `docker compose ps`, `docker compose logs web`. Si tarda, esperar 60s tras `up -d`.       |
| Logout instantáneo / CSRF errors                | Falta `PAPERLESS_USE_X_FORWARD_HOST=true` o falla CSRF      | Verificar `.env` y `PAPERLESS_CSRF_TRUSTED_ORIGINS`.                                       |
| OCR no se actualiza en tiempo real              | WebSocket apagado en Cloudflare Tunnel.                     | Activar WebSocket en el hostname del túnel.                                               |
| `consume/` no procesa nada                      | Permisos UID/GID incorrectos.                               | `ls -la /volume1/docker/club/paperless/consume/`. Ajustar `chown` con UID/GID del `.env`. |
| Errores de OCR en español                       | `PAPERLESS_OCR_LANGUAGES` no incluye `spa`.                 | Verificar `.env`. Reconstruir contenedor.                                                 |
| Búsqueda lenta o sin resultados nuevos          | Índice desactualizado.                                      | `document_index reindex` (ver arriba).                                                    |
