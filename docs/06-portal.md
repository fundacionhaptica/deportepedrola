# 06 — Portal índice (`erp.deportepedrola.com`)

## Qué es

Página de inicio estática con los enlaces a todos los servicios internos del
club. Es la URL que se reparte a la junta y los responsables de sección como
"puerta de entrada" al ERP.

URL: **`https://erp.deportepedrola.com`**

## Por qué existe

Los servicios internos viven en subdominios distintos
(`contabilidad.`, `socios.`, `stats.`...) por las razones explicadas en
[`docs/00-arquitectura.md`](00-arquitectura.md). Recordar 4-5 URLs es
incómodo. El portal centraliza todos los enlaces en un único punto:
`erp.deportepedrola.com`.

## Implementación

Un solo contenedor `nginx:alpine` sirviendo HTML estático desde
`services/portal/html/`. Sin base de datos, sin backend, sin JavaScript
complicado. Cualquier cambio en los enlaces se hace editando
`services/portal/html/index.html`, commit, push, y el cron del NAS lo
despliega en menos de 5 minutos.

- **Imagen**: `nginx:alpine`.
- **Puerto local**: `8020:80`.
- **Volumen**: `./html` montado como `/usr/share/nginx/html:ro`.
- **Red**: `club-network`.
- **Contenedor**: `club-portal`.

## Diseño visual

- Colores del club: amarillo y negro, con acentos verdes (color del escudo).
- Mobile-first y responsive — se consultará desde móviles tanto como desde
  PC.
- Sin tracking, sin fuentes de Google, sin CDNs externos. Todo CSS inline
  para que funcione aunque Cloudflare esté caído.
- Tarjetas con icono, título corto y descripción breve por servicio.

## Cómo añadir / quitar un enlace

1. Editar `services/portal/html/index.html`.
2. Duplicar un bloque `<a class="card">…</a>` y ajustar `href`, icono,
   título y descripción.
3. Commit y PR.
4. Al mergear a `main`, el cron despliega.

## Cómo cambiar la URL de un enlace pendiente

Algunos enlaces (n8n, Verifactu) están como `href="#"` con un comentario HTML
`<!-- pendiente: ... -->`. Cuando se decida la URL definitiva, sustituir
`href="#"` por la URL real y eliminar el comentario.

## Exposición pública

El portal está expuesto en `erp.deportepedrola.com` vía Cloudflare Tunnel.
**Las URLs de los servicios listados son visibles en el HTML**, así que
asume que cualquiera que abra el portal conoce todos los subdominios. La
seguridad de cada servicio reside en su propia autenticación + Cloudflare
Access (ver [`docs/08-seguridad.md`](08-seguridad.md)).
