# 04 — NocoDB (BBDD del club)

> **Estado**: 📝 pendiente de configurar.

## Qué hará

NocoDB será la **base de datos central del club**, accesible como hoja de cálculo
desde el navegador y como API REST desde n8n y Metabase.

URL prevista: **`https://socios.deportepedrola.com`**

## Tablas previstas

- **socios**: nombre, apellidos, DNI, fecha de nacimiento, email, teléfono,
  fecha de alta, estado (activo / baja), tutor legal (si menor), consentimiento
  RGPD, consentimiento de imagen.
- **secciones**: nombre, color, federada (sí/no), responsable, calendario.
- **inscripciones**: socio ↔ sección ↔ temporada (M:N).
- **cuotas**: temporada, sección, importe, fecha de cobro, estado, ID Stripe,
  socio.
- **gastos**: fecha, concepto, importe, sección, tipo de gasto, ASN del
  documento en Paperless, estado, subvencionable.
- **subvenciones**: organismo, convocatoria, importe solicitado, importe
  concedido, fecha de resolución, estado, gastos imputables vinculados.
- **donaciones**: fecha, donante, importe, finalidad, certificado emitido.
- **pagos**: tabla técnica que enlaza un movimiento bancario con la cuota,
  gasto, subvención o donación que justifica.

## Integraciones previstas

- **n8n** consume la API REST de NocoDB para automatizaciones (renovación de
  cuotas, recordatorios, alta automática de socios desde formulario).
- **Metabase** se conecta a la BBDD PostgreSQL de NocoDB en modo lectura para
  los dashboards.
- **Paperless** no se integra técnicamente: el enlace es manual, se copia el
  ASN del documento en la fila correspondiente de NocoDB.

## Autenticación

Se aplicará el mismo modelo de roles que en Paperless (ver
[`docs/08-seguridad.md`](08-seguridad.md) § "Modelo de roles"):

- `admin` (presidencia): superadmin, gestión de esquema y usuarios.
- `junta` (vocales): lectura/escritura completa sobre todas las tablas.
- `oficina` (administrativo): lectura/escritura limitada a tablas
  operativas (`socios`, `inscripciones`, `cuotas`, `pagos`), sin acceso
  a `gastos` ni `subvenciones`.
- `socio` (futuro): vista limitada a su propia fila en `socios`,
  `inscripciones` y `cuotas`. Solo se habilitará si se decide exponer
  autoconsulta a los socios; inicialmente **no se activa**.

Bootstrap: NocoDB crea el admin en el primer arranque leyendo
`NC_ADMIN_EMAIL` + `NC_ADMIN_PASSWORD` del `.env`. Los roles `junta`,
`oficina` (y opcionalmente `socio`) se crean una sola vez desde la UI
(*Team & Settings → Users*), usando las contraseñas guardadas en el
`.env` como referencia.

## Pendientes

- Decidir esquema final de tablas con la junta.
- Importar el listado actual de socios (CSV exportado del sistema previo).
- Afinar permisos concretos por rol en cada tabla/vista de NocoDB.
- Documentar el flujo de renovación anual de junio.

Cuando se configure, esta documentación se sustituirá por la guía operativa
completa siguiendo el patrón de [`03-paperless.md`](03-paperless.md).
