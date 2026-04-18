# services/portal

Portal índice estático del club. Sirve `html/index.html` con un único
contenedor `nginx:alpine`.

- **Contenedor**: `club-portal`.
- **Imagen**: `nginx:alpine` (con `Dockerfile` opcional para imagen propia).
- **Puerto local**: `8020 → 80`.
- **Volumen**: `./html` → `/usr/share/nginx/html:ro` (read-only).
- **Red**: `club-network`.

URL pública: **`https://erp.deportepedrola.com`**.

## Cómo añadir un enlace

1. Abrir `html/index.html`.
2. Localizar el bloque `<div class="grid">` y duplicar uno de los `<a class="card">`
   existentes.
3. Editar:
   - `href` con la URL del nuevo servicio.
   - `<div class="icon">` con el emoji que quieras.
   - `<h3>` con el título corto.
   - `<p>` con la descripción breve.
4. Commit, PR, merge → desplegado en menos de 5 minutos.

## Cómo quitar un enlace

Borrar el `<a class="card">…</a>` correspondiente. No deja huella.

## Cómo activar un enlace pendiente

Algunas tarjetas están como `class="card disabled"` con `href="#"` y un
comentario HTML `<!-- pendiente: ... -->`. Cuando se conozca la URL real:

1. Quitar `disabled` de la clase: `class="card"`.
2. Sustituir `href="#"` por la URL.
3. Quitar la línea `<span class="badge">Pendiente</span>`.
4. Borrar el comentario HTML.

## Operativa

```bash
cd /volume1/docker/club/repo/services/portal

# Estado
docker compose ps

# Recargar (al cambiar HTML basta con esto, nginx lo lee del bind mount)
docker compose restart

# Logs
docker compose logs -f
```

## Documentación

Detalles de diseño y razón de existir en
[`docs/06-portal.md`](../../docs/06-portal.md).
