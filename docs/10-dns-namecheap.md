# 10 — DNS: Namecheap → Cloudflare

Cómo dejar el dominio `deportepedrola.com` apuntando a Cloudflare como
autoridad DNS. **Solo se hace una vez.**

El registrador (Namecheap) sigue siendo quien tiene la propiedad del
dominio y quien cobra la renovación. Cloudflare solo gestiona los DNS
(y, por encima, WAF, Tunnel, Access...).

## Resultado esperado

```
Namecheap                   Cloudflare                     Servicios
(registrar)                 (DNS + Tunnel + Access)        (NAS del club)

deportepedrola.com  ────►   Nameservers de Cloudflare  ────►  CNAME a
                            gestionan todos los                cfargotunnel.com
                            subdominios                        → NAS
```

## Antes de cambiar nada — inventariar los DNS actuales

**Crítico**: si cambias los nameservers sin copiar antes los registros
existentes, rompes lo que haya montado (ahora mismo, el reenvío de
`hola@deportepedrola.com` al Gmail privado).

1. Namecheap → Domain List → **Manage** sobre `deportepedrola.com` →
   pestaña **Advanced DNS**.
2. Haz una **captura de pantalla** de todo lo que veas ahí. Son la verdad
   absoluta del estado actual.
3. Anota en particular:
   - Registros **MX** (los del email forwarding de Namecheap).
   - **TXT** de verificación (si los hay: SPF, Google site verification,
     etc.).
   - Cualquier **CNAME** o **A** existente.
4. Si tienes **Email Forwarding** activo en Namecheap (pestaña *Redirect
   Email*), apunta todas las reglas. Las vas a necesitar para recrearlas
   después (o para mantenerlas en Namecheap si prefieres — ver nota al
   final).

## Paso 1 — Crear el sitio en Cloudflare

1. Crear cuenta en Cloudflare (o loguearse con la existente).
2. **Add a site** → `deportepedrola.com` → **Plan Free**.
3. Cloudflare escanea los DNS actuales y los precarga. Revisa que
   aparezcan todos los que inventariaste en el paso anterior. Si falta
   alguno, añádelo a mano (`+ Add record`).
4. Continuar al siguiente paso.

## Paso 2 — Copiar manualmente el MX del forwarding si no se importó

Si usas el forwarding gratis de Namecheap (`hola@deportepedrola.com`
→ tu Gmail), los registros que necesita Cloudflare son, típicamente:

| Tipo | Nombre | Contenido                    | Prioridad |
| ---- | ------ | ---------------------------- | --------- |
| MX   | @      | `eforward1.registrar-servers.com` | 10   |
| MX   | @      | `eforward2.registrar-servers.com` | 10   |
| MX   | @      | `eforward3.registrar-servers.com` | 10   |
| MX   | @      | `eforward4.registrar-servers.com` | 10   |
| MX   | @      | `eforward5.registrar-servers.com` | 10   |
| TXT  | @      | `v=spf1 include:spf.efwd.registrar-servers.com ~all` | — |
| CNAME| eforward | `fwd.efwd.registrar-servers.com` |   —   |

> ⚠️ Verifica los valores exactos contra tu Advanced DNS de Namecheap
> antes de copiar — Namecheap a veces ajusta los hostnames. Los del
> captura mandan sobre los de esta tabla.

**Marca las entradas MX y TXT como "DNS only" (nube gris)**. Las cosas
de correo no pasan por proxy de Cloudflare, porque Cloudflare solo
proxéa HTTP/S.

## Paso 3 — Cambiar nameservers en Namecheap

Cloudflare te da dos nameservers con nombres tipo:

```
xxx.ns.cloudflare.com
yyy.ns.cloudflare.com
```

1. Namecheap → Domain List → **Manage** → pestaña **Domain**.
2. Sección **Nameservers** → cambiar de *Namecheap BasicDNS* a **Custom
   DNS**.
3. Pegar los dos nameservers de Cloudflare → ✔️.
4. Guardar.

## Paso 4 — Esperar propagación

- En la pantalla de Cloudflare → *Overview* del dominio aparecerá
  **"Pending Nameserver Update"** → al cabo de un rato pasa a **"Active"**.
- Tarda de 5 minutos a 48 horas. Típico: 30-60 minutos.
- Verificar desde línea de comandos:

```bash
dig ns deportepedrola.com +short
# Debe devolver los .ns.cloudflare.com. Si devuelve los de Namecheap,
# aún no ha propagado.
```

## Paso 5 — Comprobar que el correo sigue llegando

Mándate un email a `hola@deportepedrola.com` desde cualquier cuenta y
verifica que llega a tu Gmail privado. Si no llega en 5 minutos:

1. Revisar que los MX en Cloudflare coinciden **exactamente** con los
   que había en Namecheap. Diferencias de un solo carácter rompen la
   entrega.
2. Verificar que están en modo *DNS only* (no proxied).

## Paso 6 — Subdominios de los servicios

**No los crees a mano.** Cloudflare Tunnel crea los registros CNAME
automáticamente cuando añades un *Public Hostname* en Zero Trust
(ver [`docs/11-cloudflare-tunnel.md`](11-cloudflare-tunnel.md)). El
patrón que dejará es:

```
contabilidad.deportepedrola.com   CNAME   <tunnel-uuid>.cfargotunnel.com
erp.deportepedrola.com             CNAME   <tunnel-uuid>.cfargotunnel.com
socios.deportepedrola.com          CNAME   <tunnel-uuid>.cfargotunnel.com   (futuro)
stats.deportepedrola.com           CNAME   <tunnel-uuid>.cfargotunnel.com   (futuro)
```

Estos sí van con la nube naranja (proxied) — imprescindible, el Tunnel
solo funciona con proxy activo.

## Alternativa: mantener el forwarding en Namecheap

Si prefieres no tocar nada de correo, puedes dejar la gestión del email
en Namecheap y mover solo los subdominios a Cloudflare. Pero entonces
Cloudflare **no puede** ser autoridad DNS del dominio (solo uno puede
serlo). La opción más limpia es la descrita arriba: todo en Cloudflare,
copiando los registros MX del forwarding.

## Qué no se configura aquí

- Registros **SPF/DKIM/DMARC para enviar correo** desde el club (p. ej.
  certificados de donación) — ver `docs/12-email.md` cuando se monte.
  Por ahora, el dominio solo **recibe** (vía forwarding).
- Subdominios de los servicios — los crea el Tunnel
  (`docs/11-cloudflare-tunnel.md`).

## Checklist

- [ ] Captura de Namecheap → Advanced DNS guardada.
- [ ] Sitio creado en Cloudflare, plan Free.
- [ ] Todos los registros críticos (MX, TXT, CNAME) existentes copiados
      a Cloudflare y marcados DNS only.
- [ ] Nameservers cambiados en Namecheap a los de Cloudflare.
- [ ] `dig ns deportepedrola.com +short` devuelve los de Cloudflare.
- [ ] Cloudflare → Overview marca el dominio como **Active**.
- [ ] Prueba de envío a `hola@deportepedrola.com` llega al Gmail personal.
