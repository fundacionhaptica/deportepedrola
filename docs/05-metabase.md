# 05 — Metabase (dashboards de junta y asamblea)

> **Estado**: 📝 pendiente de configurar.

## Qué hará

Metabase ofrecerá **dashboards de solo lectura** sobre los datos almacenados en
NocoDB, pensados para dos audiencias:

- **Junta directiva**: cuadro de mando mensual con cuotas cobradas, gastos por
  sección, estado de subvenciones, evolución de socios.
- **Asamblea anual**: presentación visual de las cuentas y la actividad del
  club a los socios.

URL prevista: **`https://stats.deportepedrola.com`**

## Conexión

Metabase apuntará a la **base de datos PostgreSQL de NocoDB**, en modo lectura
(usuario PG sin permisos de `INSERT/UPDATE/DELETE`). Los dos contenedores
viven en `club-network`, conexión interna sin pasar por Internet.

## Dashboards previstos

- **Cuotas y socios**: socios activos por sección, cuotas pendientes,
  evolución mes a mes.
- **Gastos**: gasto acumulado por sección y tipo, top conceptos, comparativa
  con temporada anterior.
- **Subvenciones**: estado de solicitudes, importes concedidos vs solicitados,
  cobertura del gasto imputable.
- **Tesorería**: saldo proyectado, próximos vencimientos, ingresos vs gastos
  por trimestre.

## Autenticación

Se aplicará el mismo modelo de roles que en Paperless (ver
[`docs/08-seguridad.md`](08-seguridad.md) § "Modelo de roles"):

- `admin` (presidencia): configuración completa y alta de dashboards.
- `junta` (vocales): acceso a todos los dashboards en lectura.
- El rol `oficina` **no aplica** en Metabase.
- El rol `socio` **no aplica** en Metabase (los dashboards son internos).

Metabase community **no auto-crea admin desde variables de entorno**: la
cuenta admin se crea en el wizard del primer arranque. Los usuarios
adicionales se crean desde la UI (*Admin → People*), usando las
contraseñas guardadas en el `.env` como referencia.

## Pendientes

- Que NocoDB esté operativo con datos reales.
- Definir los dashboards concretos con la junta.

Cuando se configure, esta documentación se sustituirá por la guía operativa
completa siguiendo el patrón de [`03-paperless.md`](03-paperless.md).
