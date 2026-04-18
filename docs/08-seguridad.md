# 08 — Seguridad y RGPD

## Aislamiento del otro ERP

El NAS aloja un ERP de otra entidad jurídica distinta del club. **Por RGPD,
los dos sistemas deben estar aislados**:

- **Red Docker**: el club usa exclusivamente `club-network`. No conectar
  contenedores del club a redes del otro ERP, ni viceversa.
- **Volúmenes**: todo lo del club vive bajo `/volume1/docker/club/`. Nada
  más se toca.
- **BBDD**: cada servicio del club tiene su propio PostgreSQL. No se
  comparte servidor de BBDD con el otro ERP.
- **Convención de nombres**: contenedores del club empiezan por `club-`. Si
  encuentras contenedores que no empiezan por `club-`, **no son nuestros**
  y no se tocan bajo ningún concepto.

> ⚠️ **No borrar, mover ni reorganizar carpetas o ficheros del NAS** sin
> confirmación explícita en cada caso. Esto incluye `/volume1/docker/`
> entera, no solo `/volume1/docker/club/`. Si algo parece estar de más,
> investiga antes de tocar.

## RGPD

### Datos que se manejan

- **Socios**: nombre, apellidos, DNI, fecha de nacimiento, email, teléfono,
  dirección, datos bancarios (IBAN para domiciliación de cuotas), historial
  de pagos.
- **Menores**: nombre, fecha de nacimiento, sección, datos del tutor legal.
- **Imagen** (vídeos, fotos): solo si hay consentimiento expreso.

### Bases legales

- **Cuota e inscripción**: ejecución de contrato de socio.
- **Comunicaciones del club** (emails operativos): interés legítimo.
- **Newsletter o promoción**: requiere consentimiento expreso, opt-in.
- **Imagen de menores**: consentimiento expreso del tutor legal, por escrito.

### Derechos ARSULIPO

Los socios pueden ejercer Acceso, Rectificación, Supresión, Limitación,
Portabilidad y Oposición escribiendo a **`sdmpedrola@dpz.es`**. La junta
debe responder en 1 mes. Los datos suprimidos se borran de NocoDB y se
elimina su corresponsalía en Paperless (los documentos legales que
debamos conservar por obligación fiscal se mantienen, ver siguiente
sección).

### Conservación

- Datos de socios: hasta 4 años tras la baja (prescripción de
  responsabilidad civil).
- Documentación contable y fiscal: **6 años** (Código de Comercio art. 30)
  desde el cierre del ejercicio.
- Justificantes de subvenciones: lo que diga el organismo concedente
  (típicamente 4 años desde la justificación).

### Encargados de tratamiento

- **Cloudflare**: tránsito DNS y túnel. Cláusula DPA estándar de Cloudflare.
- **Stripe**: cobros. DPA estándar de Stripe.
- **Proveedor del SaaS Verifactu** (por elegir): facturación. DPA del
  proveedor.
- **Proveedor de cloud del backup**: copias cifradas. DPA del proveedor.
  Cifrado client-side garantiza que el proveedor no puede leer los datos
  aunque acceda al fichero.

## Cloudflare Access

Cloudflare Access es un proxy de autenticación gratuito que se sienta
**delante de un subdominio** y exige que el visitante demuestre identidad
(email + código, Google login, etc.) antes de que la petición llegue al
NAS. Se configura en Cloudflare Zero Trust → Access → Applications.

### Subdominios protegidos por Access

- `socios.deportepedrola.com` → solo miembros de la junta directiva.
- `stats.deportepedrola.com` → solo miembros de la junta directiva.
- `contabilidad.deportepedrola.com` → solo el responsable contable + presidencia.

### Subdominio público (sin Access)

- `erp.deportepedrola.com` → portal índice. Es público pero no expone datos
  sensibles, solo enlaces. La protección real está en cada servicio destino.

### Cómo configurar una nueva Access Application

1. Cloudflare Zero Trust → Access → Applications → Add an application →
   Self-hosted.
2. **Application name**: `Club <servicio>`.
3. **Session duration**: 24 hours (ajustar según uso).
4. **Application domain**: el subdominio completo
   (`socios.deportepedrola.com`).
5. **Identity providers**: One-time PIN (email) basta para empezar.
6. **Policy**: Allow → Selector "Emails" → lista explícita de emails
   autorizados. **No usar dominios enteros** salvo que se quiera autorizar
   a cualquiera de ese dominio.

> Si el servicio destino tiene su propio sistema de autenticación
> (Paperless, NocoDB, Metabase), Cloudflare Access funciona como una capa
> extra: hay que pasar Access **y** loguearse en el servicio. Es lo deseado.

## Gestión de secretos

- **Cada servicio** tiene su `.env.example` (público, sin valores) y su
  `.env` (privado, solo en el NAS, en `.gitignore`).
- **Generación**: `openssl rand -base64 32` para passwords; ver
  [`docs/03-paperless.md`](03-paperless.md) sección "Generar secretos".
- **Almacenamiento off-NAS**: una copia de los secretos críticos en el
  gestor de contraseñas del club (Bitwarden, 1Password o equivalente),
  no en post-its ni en emails.
- **Rotación**: si un secreto se filtra (commit accidental, log
  publicado, etc.), se considera **quemado para siempre**. Hay que rotarlo
  inmediatamente, aunque luego se borre del histórico de git.

### Editar `.env` en el NAS

**Solo con editores Linux-aware**: `vi` o `nano` por SSH. Si editas desde
Windows, usa VSCode o Notepad++ asegurando que la barra de estado marca
**LF** (no CRLF). El Notepad clásico de Windows está **prohibido**: añade
`\r` al final de cada valor y rompe comparaciones de strings, validación
HMAC y arranque de contenedores.

Verificar que un `.env` está limpio:

```bash
sudo cat -A /volume1/docker/club/<servicio>/.env | grep -c '\^M'
# Debe devolver 0
```

Si devuelve >0, limpiar con:

```bash
sudo sed -i 's/\r$//' /volume1/docker/club/<servicio>/.env
```

## Transferencia de responsabilidad del repo

El club es una entidad sin ánimo de lucro y los cargos rotan. Cuando el
mantenedor actual deje el rol:

1. **Inventario** de credenciales: Cloudflare, GitHub, gestor de
   contraseñas del club, Synology admin, cuenta de email del club, cuentas
   de los SaaS (Stripe, Verifactu, backup cloud).
2. **Transferencia formal**: el saliente entrega al entrante el acceso y
   firman un acta (lo escribe un humano, no Claude).
3. **Rotación de secretos críticos** tras la entrega: passwords del NAS,
   tokens de Stripe, secretos de Cloudflare. La rotación cierra el acceso
   del saliente sin malicia, por mera higiene.
4. **Transferencia del repo**: en GitHub, mover la propiedad del repo a la
   nueva cuenta del entrante o a una organización del club, y revocar
   accesos del saliente.
5. **Actualizar este documento** con el nombre del nuevo mantenedor en
   `CLAUDE.md`.
