'use strict';

// Envío de correo electrónico. Wrapper minimalista sobre nodemailer.
// La configuración vive en variables SMTP_* del .env.
//
// Exporta:
//   getTransporter()                              → transporter cacheado o null si no hay config
//   isConfigured()                                → true si SMTP_HOST está definido
//   sendMail({to, subject, html, text, bcc?})     → envía y devuelve {ok, id|error}
//   construirEmailPrevisionCuota({socio, cuotas, temporada}) → {subject, html, text}

const nodemailer = require('nodemailer');

let _transporter = null;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter() {
  if (_transporter) return _transporter;
  if (!isConfigured()) return null;

  const port   = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  return _transporter;
}

async function sendMail({ to, subject, html, text, bcc }) {
  const t = getTransporter();
  if (!t) throw new Error('SMTP no está configurado (falta SMTP_HOST en .env)');

  const from   = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';
  const bccEnv = process.env.SMTP_BCC || null;
  const bccTot = [bcc, bccEnv].filter(Boolean).join(', ') || undefined;

  const info = await t.sendMail({ from, to, bcc: bccTot, subject, html, text });
  return { ok: true, id: info.messageId };
}

// ──────────────────────────────────────────────────────────────────────
// Plantilla: previsión de cuota anual para un socio
// ──────────────────────────────────────────────────────────────────────

const NOMBRE_DEPORTE = {
  atletismo: 'Atletismo', baloncesto: 'Baloncesto', f7: 'Fútbol 7',
  futbol: 'Fútbol', fs: 'Fútbol Sala', g_ritmica: 'Gimnasia Rítmica',
  kenpo: 'Kenpo', kickboxing: 'Kickboxing', patinaje: 'Patinaje',
  trail: 'Trail', voleibol: 'Voleibol', dirigidas: 'Act. Dirigidas',
};

// Deportes con calendario de competición y posible recargo por desplazamientos
const DEPORTES_EQUIPO = new Set(['baloncesto', 'futbol', 'f7', 'fs', 'voleibol']);

const fmtEuro = n => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
}).format(Number(n) || 0);

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function construirEmailPrevisionCuota({ socio, cuotas, temporada }) {
  const nombreClub = process.env.CLUB_NOMBRE || 'CDE Deporte Pedrola';
  const total = cuotas.reduce((acc, c) => acc + Number(c.importe || 0), 0);

  const saludo = socio.nombre
    ? `Hola ${socio.nombre}`
    : 'Hola';

  const subject = `Previsión de cuota temporada ${temporada} — ${nombreClub}`;

  // Detectar si el socio tiene algún deporte de equipo entre sus cuotas
  const tieneEquipo = cuotas.some(c => DEPORTES_EQUIPO.has(c.deporte));

  // ── Versión HTML ──────────────────────────────────────────────────
  const filasHtml = cuotas.map(c => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">
        ${escHtml(c.concepto)}
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums">
        ${fmtEuro(c.importe)}
      </td>
    </tr>
  `).join('');

  const avisoEquipo = tieneEquipo ? `
    <p style="margin:14px 0;padding:10px 12px;background:#fff8e1;border-left:3px solid #FFD400;font-size:14px">
      <strong>Aviso sobre desplazamientos:</strong> esta es una previsión inicial.
      En los deportes de equipo, una vez se publique el calendario oficial de
      competición, podría aplicarse un <strong>recargo posterior</strong> en concepto
      de desplazamientos a partidos fuera de casa. El importe definitivo se
      comunicará en cuanto se conozca.
    </p>
  ` : `
    <p style="margin:14px 0;padding:10px 12px;background:#fff8e1;border-left:3px solid #FFD400;font-size:14px">
      <strong>Aviso:</strong> esta es una previsión inicial. En los deportes de equipo,
      en función del calendario de competición, podría aplicarse un recargo
      posterior por desplazamientos a partidos fuera de casa.
    </p>
  `;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111;line-height:1.5">
  <div style="max-width:600px;margin:0 auto;background:#fff">
    <div style="background:#111;color:#FFD400;padding:18px 22px;border-bottom:4px solid #FFD400">
      <div style="font-weight:700;font-size:18px">${escHtml(nombreClub)}</div>
      <div style="color:#fff;font-size:13px;opacity:.85">Previsión de cuota · Temporada ${escHtml(temporada)}</div>
    </div>
    <div style="padding:22px">
      <p style="margin:0 0 12px">${escHtml(saludo)},</p>
      <p style="margin:0 0 12px">
        Te enviamos la <strong>previsión inicial</strong> de la cuota que te correspondería
        pagar esta temporada en función de las actividades en las que estás inscrito.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #111;font-size:12px;text-transform:uppercase;color:#666">Concepto</th>
            <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #111;font-size:12px;text-transform:uppercase;color:#666">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${filasHtml}
          <tr>
            <td style="padding:10px;font-weight:700;background:#fafafa">Total previsto</td>
            <td style="padding:10px;text-align:right;font-weight:700;background:#fafafa;font-variant-numeric:tabular-nums">${fmtEuro(total)}</td>
          </tr>
        </tbody>
      </table>

      ${avisoEquipo}

      <p style="margin:14px 0 6px;font-size:13px;color:#555">
        Si detectas algún error en las actividades o en los datos, contesta a este
        correo y lo revisamos. Más adelante recibirás las instrucciones para abonar
        la cuota.
      </p>
      <p style="margin:18px 0 0;font-size:13px;color:#555">
        Un saludo,<br>
        <strong>${escHtml(nombreClub)}</strong>
      </p>
    </div>
    <div style="padding:12px 22px;font-size:11px;color:#888;background:#fafafa;border-top:1px solid #eee">
      Este mensaje se ha enviado automáticamente desde el sistema de gestión del club.
      Si no deberías haberlo recibido, ignóralo o avísanos.
    </div>
  </div>
</body></html>`;

  // ── Versión texto plano ───────────────────────────────────────────
  const filasTxt = cuotas
    .map(c => `  · ${c.concepto}: ${fmtEuro(c.importe)}`)
    .join('\n');

  const avisoTxt = tieneEquipo
    ? 'AVISO sobre desplazamientos: esta es una previsión inicial. En los\n'
      + 'deportes de equipo, una vez se publique el calendario oficial de\n'
      + 'competición, podría aplicarse un recargo posterior por desplazamientos\n'
      + 'a partidos fuera de casa.'
    : 'AVISO: esta es una previsión inicial. En deportes de equipo, en función\n'
      + 'del calendario de competición, podría aplicarse un recargo posterior\n'
      + 'por desplazamientos a partidos fuera de casa.';

  const text =
`${saludo},

Te enviamos la previsión inicial de la cuota que te correspondería pagar
esta temporada (${temporada}) en función de las actividades en las que
estás inscrito:

${filasTxt}

Total previsto: ${fmtEuro(total)}

${avisoTxt}

Si detectas algún error en las actividades o en los datos, contesta a
este correo y lo revisamos. Más adelante recibirás las instrucciones
para abonar la cuota.

Un saludo,
${nombreClub}
`;

  return { subject, html, text, total };
}

module.exports = {
  isConfigured,
  getTransporter,
  sendMail,
  construirEmailPrevisionCuota,
};
