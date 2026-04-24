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

## Modelo de autenticación

El stack del club usa **una única capa de autenticación: el login propio
de cada servicio** (Paperless, NocoDB, Metabase). No hay Cloudflare Access
delante ni SSO autohospedado. La decisión es explícita: el club es pequeño,
la junta es pequeña, y añadir capas adicionales cuesta mantenimiento sin
aportar seguridad real en este contexto.

Lo que **sí protege** el stack:

- El NAS no expone puertos al router. Todo el tráfico externo entra por el
  Cloudflare Tunnel (ver [`docs/00-arquitectura.md`](00-arquitectura.md)).
- Cada servicio tiene su propia BBDD Postgres con contraseñas hasheadas
  (bcrypt) por el propio servicio. Las contraseñas en claro **nunca** viven
  en la BBDD ni en logs.
- Los secretos de infraestructura (passwords de Postgres, Django secret
  keys, etc.) viven en `.env` **solo en el NAS**, con `chmod 600`.
- El subdominio público `erp.deportepedrola.com` (portal índice) es HTML
  estático sin backend ni datos — aunque se liste el resto de subdominios,
  la protección real está en el login de cada servicio.

### Modelo de roles

Cada servicio del club tiene **tres usuarios de rol** (cuatro en NocoDB
cuando toque). Son cuentas compartidas dentro del club; las credenciales
se distribuyen vía el gestor de contraseñas del club.

| Rol       | Quién entra                              | Permisos típicos |
|-----------|------------------------------------------|-------------------|
| `admin`   | Presidencia (mantenedor único)           | Todo, incluida gestión de usuarios. |
| `junta`   | Junta directiva (vocales, tesorería)     | Lectura/escritura completa salvo gestión de usuarios. |
| `oficina` | Personal administrativo que archiva      | Ver, subir y etiquetar documentos. SIN borrar ni editar corresponsales/tipos. |
| `socio`   | *(Solo NocoDB, en el futuro)*            | Vista limitada a su propia fila. No aplica en Paperless ni Metabase. |

El rol `admin` se **auto-crea en el primer arranque** leyendo
`PAPERLESS_ADMIN_USER` / `PAPERLESS_ADMIN_PASSWORD` / `PAPERLESS_ADMIN_MAIL`
del `.env`. Los roles `junta` y `oficina` se **crean una sola vez desde la
UI** (`Settings → Users & Groups`) al montar el servicio, usando las
contraseñas `CLUB_USER_JUNTA_PASSWORD` y `CLUB_USER_OFICINA_PASSWORD` que
viven en el mismo `.env` como referencia (Paperless no las lee).

Procedimiento detallado: [`docs/03-paperless.md`](03-paperless.md) § 5.

### Ventajas y contraprestaciones del modelo de roles

**Ventajas**:

- Simplísimo de operar: ~3 usuarios por servicio, no ~15.
- No hay que dar de alta/baja cada vez que rota un vocal.
- Las contraseñas están todas en un único sitio (gestor del club).

**Contraprestaciones asumidas conscientemente**:

- **Trazabilidad reducida**: si dos personas entran con el usuario `junta`,
  Paperless solo sabe que "entró junta". No es auditable individualmente.
- **Rotación por salida**: cuando alguien con acceso a la contraseña
  `junta` deja el club, **hay que rotar esa contraseña** y redistribuirla
  a los demás miembros. Lo mismo con `oficina`.
- **No hay MFA**: los servicios aceptan solo usuario+contraseña. Mitigación:
  contraseñas largas (`openssl rand -base64 24`), gestor de contraseñas
  obligatorio, y el gestor **sí** con MFA.

Si en el futuro el club crece o alguno de estos contras empieza a doler,
la migración natural es a cuentas individuales (una por persona de la
junta). El cambio se hace desde la misma UI de cada servicio sin tocar
infraestructura.

## Gestión de secretos

El `.env` de cada servicio mezcla dos tipos de secretos conceptualmente
distintos. Conviene tenerlos separados mentalmente:

### Tipo 1 — Secretos de infraestructura

- Ejemplos: `POSTGRES_PASSWORD`, `PAPERLESS_SECRET_KEY`.
- Los lee el contenedor al arrancar. Nadie humano los teclea nunca.
- Se generan una sola vez con `openssl rand -base64 32` (o `60` para
  la secret key de Django) y se olvidan.
- No hacen falta en el gestor de contraseñas del club: si se pierden,
  se rotan y se levanta el servicio otra vez. Los datos (documentos
  de Paperless, filas de NocoDB) no dependen de estos secretos, solo
  el acceso a la BBDD interna.

### Tipo 2 — Contraseñas de roles humanos

- Ejemplos: `PAPERLESS_ADMIN_PASSWORD`, `CLUB_USER_JUNTA_PASSWORD`,
  `CLUB_USER_OFICINA_PASSWORD`.
- **Las teclea la junta cada vez que entra a un servicio**.
- Se generan una vez con `openssl rand -base64 24` y **se copian al
  gestor de contraseñas del club antes de cerrar el fichero**. Esto es
  obligatorio: si se pierden sin copia, hay que resetearlas desde la UI
  (como admin) o desde `docker compose exec web python3 manage.py
  changepassword`.

### Reglas comunes

- **Cada servicio** tiene su `.env.example` (público, sin valores) y su
  `.env` (privado, solo en el NAS, en `.gitignore`, con `chmod 600`).
- **Gestor de contraseñas del club**: opción recomendada **KeePassXC**
  con el archivo `club.kdbx` guardado en una carpeta compartida del
  Synology (accesible solo a la junta). Master key memorizada por el
  presidente + copia en sobre sellado físico en la secretaría del club.
  Alternativa si la junta crece: Vaultwarden autohospedado (importa
  directamente el `.kdbx`).
- **Rotación**: si un secreto se filtra (commit accidental, log
  publicado, etc.), se considera **quemado para siempre**. Hay que rotarlo
  inmediatamente, aunque luego se borre del histórico de git.
- **Rotación programada**: las contraseñas de los roles humanos
  (`admin`, `junta`, `oficina`) se rotan **obligatoriamente** cuando
  alguien con acceso deja el club, y **recomendablemente** una vez al
  año en la asamblea.

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
