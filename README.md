# Sistema de gestión — Club Deportivo Elemental Deporte Pedrola

Aplicación web de gestión interna para el Club Deportivo Elemental Deporte Pedrola (CIF G99528549). Cubre socios, facturas con OCR, ingresos, cobros por Stripe e informes financieros.

Desplegada en: `https://erp.deportepedrola.com`

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + Express |
| Base de datos | PostgreSQL 16 |
| Autenticación | Auth0 (JWT + JWKS) |
| OCR de facturas | Anthropic Claude API |
| Pagos | Stripe Checkout (pagos únicos) |
| PDFs | pdfkit |
| Frontend | HTML + JS vanilla + Chart.js (CDN) |
| Despliegue | Docker Compose |

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
- `DATABASE_URL` (ajustar contraseña)
- `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID`
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_URL`
- `CLUB_REPRESENTANTE_DNI`, `CLUB_EMAIL`, `CLUB_TELEFONO`

### 3. Crear directorio de uploads

```bash
mkdir -p uploads/facturas uploads/certificados-donacion
touch uploads/.gitkeep
```

### 4. Arrancar los contenedores

```bash
docker compose up -d --build
```

### 5. Ejecutar migraciones de base de datos

```bash
docker compose exec app npm run migrate
```

### 6. (Opcional) Importar socios desde Excel

```bash
docker compose exec app node db/seed-socios.js /ruta/al/Socios_DP.xlsx
```

---

## Configuración de Auth0

1. Crear un tenant en [auth0.com](https://auth0.com) (plan gratuito suficiente).
2. Crear una **API**:
   - Identifier: `https://api.deporte-pedrola` (valor de `AUTH0_AUDIENCE`)
   - Signing algorithm: RS256
3. Crear una **Application** de tipo "Single Page Application":
   - Allowed Callback URLs: `https://erp.deportepedrola.com`
   - Allowed Logout URLs: `https://erp.deportepedrola.com`
   - Allowed Web Origins: `https://erp.deportepedrola.com`
4. Copiar **Domain** → `AUTH0_DOMAIN` y **Client ID** → `AUTH0_CLIENT_ID` en `.env`.

### Promocionar el primer administrador

Tras el primer login, ejecutar en la base de datos:

```sql
UPDATE usuarios SET rol = 'admin' WHERE email = 'jaime@ejemplo.com';
```

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
docker compose exec app node db/seed-socios.js /ruta/al/Socios_DP.xlsx
```

El script importa socios y crea inscripciones para la temporada `2024-2025`. No se ejecuta automáticamente en el arranque.

---

## ⚠️ Aviso legal: certificados de donación y Ley 49/2002

Los certificados de donación generados por esta aplicación incluyen referencias a la **Ley 49/2002** sobre incentivos fiscales al mecenazgo (deducción en IRPF, modelo 182).

**Estas deducciones solo aplican si la entidad está efectivamente acogida al régimen especial de dicha ley** (entidades sin fines lucrativos de utilidad pública, fundaciones, etc.).

Un club deportivo inscrito en el registro de entidades deportivas de Aragón no acoge automáticamente la Ley 49/2002. **Jaime debe confirmar con el asesor fiscal si el club cumple los requisitos antes de entregar certificados a donantes.**

Si el club no está acogido a dicha ley, adaptar el texto del certificado en `lib/certificado-donacion.js`.

---

## Licencia

Uso interno del Club Deportivo Elemental Deporte Pedrola. Todos los derechos reservados.
