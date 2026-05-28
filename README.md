# Sistema de gestión — Club Deportivo Elemental Deporte Pedrola

Aplicación web de gestión interna para el Club Deportivo Elemental Deporte Pedrola (CIF G99528549). Cubre socios, facturas con OCR, ingresos, cobros por Stripe e informes financieros.

Desplegada en: `https://erp.deportepedrola.com`

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + Express |
| Base de datos | PostgreSQL 16 |
| Autenticación | JWT HS256 propio (3 roles: admin / junta / socio, contraseñas en `.env`) |
| OCR de facturas | Workflow Cowork manual (ver `docs/WORKFLOW_OCR_COWORK.md`); hook preparado para `vision-router` del NAS cuando se active |
| Email | SMTP Zoho EU (`smtp.zoho.eu:465`, cuenta `hola@deportepedrola.com`) |
| Pagos | Stripe Checkout (pagos únicos, `mode:'payment'`) |
| PDFs | pdfkit |
| Frontend | HTML + JS vanilla + Chart.js (CDN) |
| Despliegue | Docker Compose (`docker compose -p club ... up -d`) |

Documentación complementaria:
- `docs/AUDITORIA.md` — estado real de la app y de los datos
- `docs/WORKFLOW_OCR_COWORK.md` — cómo procesar facturas vía Cowork (Claude desktop)

---

## Instalación en el NAS

### 1. Clonar el repositorio

```bash
git clone https://github.com/fundacionhaptica/deportepedrola.git
cd deportepedrola
```

### 2. Crear y editar el archivo de entorno

```bash
cp .env.example .env
nano .env
```

Rellenar al menos:
- `POSTGRES_PASSWORD`, `DATABASE_URL`
- `JWT_SECRET`, `AUTH_ADMIN_PASS`, `AUTH_JUNTA_PASS`, `AUTH_SOCIO_PASS`
- `INTERNAL_API_KEY` (para subidas Cowork)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `SMTP_HOST=smtp.zoho.eu`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS` (app-specific password de Zoho)
- `PUBLIC_URL=https://erp.deportepedrola.com`
- `CLUB_*` (datos del club para certificados de donación y firmas)

### 3. Crear directorio de uploads

```bash
mkdir -p uploads/facturas uploads/certificados-donacion
touch uploads/.gitkeep
```

### 4. Arrancar los contenedores

```bash
docker compose -p club -f docker-compose.yml up -d --build
```

### 5. Ejecutar migraciones y scripts de carga inicial

Las migraciones (`db/schema.sql`) corren automáticamente al arrancar `app`. Para los scripts opcionales:

```bash
docker compose -p club exec app npm run migrate           # migraciones
docker compose -p club exec app node scripts/importar-socios.js /ruta/Socios_DP.xlsx
```

Scripts SQL adicionales en `scripts/`:
- `01_limpiar_mojibake_y_duplicados.sql` — limpieza inicial BD heredada
- `02_importar_facturas_y_distribuciones.SQL` — carga histórica facturas (idempotente, ON CONFLICT)
- `05_vista_socios_categoria.sql` — vista categorías por edad
- `07_vistas_libro_caja.sql` + `08_v_libro_caja_v2.sql` — vistas resumen para dashboard
- `09_tarifas_2025_2026.sql` — tarifas oficiales
- `10_generar_cuotas_2025_2026.sql` — generar `cuotas_socio` para todos

---

## Configuración de Stripe

1. Crear una cuenta en [stripe.com](https://stripe.com).
2. Copiar las claves de API (modo test primero) en `.env`.
3. Configurar el webhook en el dashboard de Stripe:
   - URL: `https://erp.deportepedrola.com/api/stripe/webhook`
   - Eventos a escuchar: `checkout.session.completed`
4. Copiar el **Webhook Signing Secret** → `STRIPE_WEBHOOK_SECRET` en `.env`.

---

## Importación de socios desde Excel

```bash
docker compose -p club exec app node scripts/importar-socios.js /ruta/al/Socios_DP.xlsx
```

El script es idempotente (UPSERT por `numero_socio`). Reporta insertados, actualizados, errores. Las cuotas automáticas se generan con `scripts/10_generar_cuotas_2025_2026.sql` (las reglas: multi-deporte = suma, JJEE si edad ≤ 15).

---

## Certificados de donación y Ley 49/2002

**CONFIRMADO 2026-05-28 con asesor fiscal:** el Club Deportivo Elemental Deporte Pedrola **sí está acogido** al régimen fiscal especial del Título II de la **Ley 49/2002**, de 23 de diciembre, sobre el régimen fiscal de las entidades sin fines lucrativos y de los incentivos fiscales al mecenazgo.

Los certificados emitidos por `lib/certificado-donacion.js` (endpoint `POST /api/certificados/donacion`) son **válidos** para que el donante deduzca en IRPF (modelo 182). El texto legal del PDF **no debe modificarse** sin revisar previamente con el asesor fiscal (ver `CLAUDE.md` regla 5).

---

## Licencia

Uso interno del Club Deportivo Elemental Deporte Pedrola. Todos los derechos reservados.