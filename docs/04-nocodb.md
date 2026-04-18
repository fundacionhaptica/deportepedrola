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

## Pendientes

- Decidir esquema final de tablas con la junta.
- Importar el listado actual de socios (CSV exportado del sistema previo).
- Configurar permisos por rol (junta directiva ve todo, responsables de sección
  solo su sección).
- Documentar el flujo de renovación anual de junio.

Cuando se configure, esta documentación se sustituirá por la guía operativa
completa siguiendo el patrón de [`03-paperless.md`](03-paperless.md).
