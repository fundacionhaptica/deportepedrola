# CLAUDE.md — Reglas del repo deporte-pedrola

## Reglas críticas

1. **Nunca commitear `.env`.** Solo `.env.example` va al repo. Si ves un `.env` real en el working tree, avisar inmediatamente y no continuar.

2. **No borrar ni mover ficheros sin confirmación explícita** de Jaime. Esto incluye uploads, volúmenes y cualquier dato de producción.

3. **Webhook Stripe requiere body raw.** En `server.js`, la ruta `POST /api/stripe/webhook` debe montarse con `express.raw({type:'application/json'})` ANTES de `express.json()`. Mover ese bloque rompe la verificación de firma y Stripe dejará de funcionar.

4. **OCR no destructivo.** El JSON íntegro devuelto por la API de Anthropic se guarda en `facturas.ocr_raw_json` sin transformar. No filtrar ni modificar antes de guardar — permite reprocesar en el futuro.

5. **Certificados de donación.** Cualquier cambio en el texto del certificado (`lib/certificado-donacion.js`) tiene implicaciones fiscales. Revisar con Jaime antes de modificar. Ver aviso en README sobre Ley 49/2002.

6. **Adelantos del presidente** (`tipo='adelanto_presidente'`) llevan SIEMPRE `es_tesoreria=true` y no deben computar como ingreso real en informes ni en el balance. La vista `v_balance_mensual` filtra `WHERE es_tesoreria = false`.

7. **Migraciones idempotentes.** `db/schema.sql` usa `CREATE TABLE IF NOT EXISTS`, `CREATE TYPE IF NOT EXISTS`, etc. Ejecutar `npm run migrate` varias veces no debe romper nada.

8. **Importes siempre `NUMERIC(10,2)`.** Nunca floats de JavaScript ni `FLOAT` en PostgreSQL para valores monetarios.

9. **Pagos Stripe: solo `mode: 'payment'`.** No crear suscripciones (`mode: 'subscription'`). El club usa pagos únicos.

10. **Frontend sin frameworks ni build step.** HTML + JS vanilla + módulos ES. No introducir React, Vue, TypeScript, Webpack, Vite ni similares.

## Convenciones

- IDs: `SERIAL` (enteros autoincrement).
- Fechas de negocio: `DATE`. Timestamps técnicos: `TIMESTAMPTZ`.
- Importes: `NUMERIC(10,2)`.
- Nombres de contenedores Docker: `club-<servicio>-<rol>` si aplica.
- Idioma del código: inglés (variables, funciones). Idioma de mensajes/comentarios: español.
- Commits en español, imperativo: `feat(socios): añadir endpoint de baja lógica`.

## Despliegue

Cloudflare Tunnel ya está configurado apuntando al puerto 3010 del NAS.

Tras cambios en `package.json`:
```bash
docker compose up -d --build
```

Tras cambios en `db/schema.sql`:
```bash
docker compose exec app npm run migrate
```

Para ver logs en tiempo real:
```bash
docker compose logs -f app
```

## Estructura de módulos

```
server.js           → entrada, monta middlewares y rutas
db/                 → pool, migraciones, seed
middleware/auth.js  → JWT Auth0 + carga usuario local + roles
lib/                → integraciones externas (Claude, Stripe, pdfkit)
routes/             → un fichero por dominio (socios, facturas, etc.)
public/             → frontend estático servido por Express
uploads/            → PDFs subidos (gitignored salvo .gitkeep)
```

## Roadmap pendiente (no implementado en v0.1)

- Generación del modelo 182 anual (XML/CSV para Hacienda).
- Notificaciones por email tras cobro Stripe.
- Exportación de informes a Excel.
- Vista autoservicio para socios (ver pagos pendientes y pagar).
- Backups automáticos de la base de datos.

## Idioma

Todas las comunicaciones, commits y documentación en **español**. Solo nombres técnicos en inglés por convención.
