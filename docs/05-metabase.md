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

## Pendientes

- Que NocoDB esté operativo con datos reales.
- Definir los dashboards concretos con la junta.
- Configurar Cloudflare Access para restringir el acceso a los miembros de
  la junta (no es información que deba ser pública aunque la URL se filtre).

Cuando se configure, esta documentación se sustituirá por la guía operativa
completa siguiendo el patrón de [`03-paperless.md`](03-paperless.md).
