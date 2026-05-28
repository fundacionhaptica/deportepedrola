'use strict';
// lib/certificado-donacion.js — Generador de PDF para certificados de donación.
//
// LEY 49/2002 — CONFIRMADO 2026-05-28 por Jaime con asesor fiscal:
// El Club Deportivo Elemental Deporte Pedrola SI está acogido al régimen
// fiscal especial del Título II de la Ley 49/2002, de 23 de diciembre,
// sobre el régimen fiscal de las entidades sin fines lucrativos y de los
// incentivos fiscales al mecenazgo. Los certificados emitidos por este
// módulo son válidos para que el donante deduzca en IRPF (modelo 182).
//
// Cualquier cambio al texto legal de los certificados (CLAUDE.md regla 5)
// debe revisarse con Jaime ANTES de modificar.


const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
               'Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const CUENTA_CLUB = 'ES62 2085 0414 1103 3028 2970';
const LOGO_PATH   = path.join(__dirname, '..', 'public', 'logo.png');
const FIRMA_PATH  = path.join(__dirname, '..', 'public', 'firma.png');

function formatearFecha(fechaStr) {
  const [year, month, day] = fechaStr.split('-').map(Number);
  return `${day} de ${MESES[month - 1]} de ${year}`;
}

function formatearIban(iban) {
  return iban.replace(/\s/g, '').toUpperCase().match(/.{1,4}/g).join(' ');
}

function formatearImporte(importe) {
  const n = parseFloat(importe);
  const tieneDecimales = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: tieneDecimales ? 2 : 0,
    maximumFractionDigits: tieneDecimales ? 2 : 0,
  }).format(n);
}

function numeroEnLetras(n) {
  if (n === 0) return 'CERO';

  const UNIDADES  = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE'];
  const ESPECIALES = ['DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE',
                      'DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
  const DECENAS   = ['','DIEZ','VEINTE','TREINTA','CUARENTA','CINCUENTA',
                     'SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const CENTENAS  = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
                     'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  const VEINTI    = ['','VEINTIUNO','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO','VEINTICINCO',
                     'VEINTISÉIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];

  let result = '';

  if (n >= 1000) {
    const miles = Math.floor(n / 1000);
    result += (miles === 1 ? 'MIL' : numeroEnLetras(miles) + ' MIL') + ' ';
    n = n % 1000;
  }

  if (n === 100) { result += 'CIEN'; return result.trim(); }

  if (n >= 100) {
    result += CENTENAS[Math.floor(n / 100)] + ' ';
    n = n % 100;
  }

  if (n >= 20) {
    const dec = Math.floor(n / 10);
    const uni = n % 10;
    if (dec === 2 && uni > 0) result += VEINTI[uni];
    else if (uni === 0)       result += DECENAS[dec];
    else                      result += DECENAS[dec] + ' Y ' + UNIDADES[uni];
  } else if (n >= 10) {
    result += ESPECIALES[n - 10];
  } else if (n > 0) {
    result += UNIDADES[n];
  }

  return result.trim();
}

function importeEnLetras(importe) {
  const euros = Math.round(parseFloat(importe));
  const letras = numeroEnLetras(euros);
  return letras + (euros === 1 ? ' EURO' : ' EUROS');
}

/**
 * Genera el PDF del certificado de donación.
 *
 * @param {Object} datos
 * @param {string} datos.fecha         - Fecha de la donación (YYYY-MM-DD)
 * @param {string} datos.tipo          - 'fisica' | 'juridica'
 * @param {string} datos.genero        - 'D.' | 'D.ª'  (solo para persona física)
 * @param {string} datos.nombre        - Nombre completo del donante / razón social
 * @param {string} datos.documento     - DNI (física) o CIF/NIF (jurídica)
 * @param {string} datos.cuentaOrigen  - IBAN de la cuenta del donante
 * @param {number} datos.importe       - Importe en euros
 * @param {string} [datos.swift]       - SWIFT del banco del donante (opcional, jurídica)
 * @returns {Buffer} PDF como buffer
 */
function generarCertificadoDonacion(datos) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc    = new PDFDocument({ size: 'A4', margin: 55, info: { Title: 'Certificado de Donación' } });

    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fechaFormateada  = formatearFecha(datos.fecha);
    const ibanOrigen       = formatearIban(datos.cuentaOrigen);
    const importeNum       = formatearImporte(datos.importe);
    const importeLetras    = importeEnLetras(datos.importe);
    const importeParentesis = `${importeLetras} (${importeNum} €)`;

    // ── CABECERA ────────────────────────────────────────────────────────────
    const tienelogo = fs.existsSync(LOGO_PATH);

    if (tienelogo) {
      doc.image(LOGO_PATH, 55, 45, { width: 70 });
      doc.fontSize(9).font('Helvetica-Bold').text('Deporte Pedrola', 135, 50);
      doc.fontSize(9).font('Helvetica').text('C/Acceso Piscinas s/n\n50690 Pedrola', 135, 62);
      doc.fontSize(9).font('Helvetica').text('sdmpedrola@dpz.es', 135, 90);
    } else {
      doc.fontSize(9).font('Helvetica-Bold').text('Deporte Pedrola', 55, 50);
      doc.fontSize(9).font('Helvetica').text('C/Acceso Piscinas s/n\n50690 Pedrola', 55, 62);
      doc.fontSize(9).font('Helvetica').text('sdmpedrola@dpz.es', 55, 90);
    }

    doc.moveDown(4);

    // ── TÍTULO ──────────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').text('CERTIFICADO DE DONACIÓN', { align: 'left' });
    doc.moveDown(0.7);

    // ── FECHA DE APERTURA ────────────────────────────────────────────────────
    doc.fontSize(10).font('Helvetica').text(`En Pedrola, a ${fechaFormateada}`);
    doc.moveDown(0.8);

    // ── PÁRRAFO PRESIDENTE ───────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(10)
      .text('D./D.ª ', { continued: true })
      .font('Helvetica-Bold').text('Jaime Ruiz Herrero', { continued: true })
      .font('Helvetica').text(', con DNI 25480386C, en calidad de ', { continued: true })
      .font('Helvetica-Bold').text('Presidente de Deporte Pedrola', { continued: true })
      .font('Helvetica').text(', con CIF ', { continued: true })
      .font('Helvetica-Bold').text('G99528549', { continued: true })
      .font('Helvetica').text(' y domicilio social en C/Acceso Piscinas s/n certifica que:');
    doc.moveDown(0.8);

    // ── PÁRRAFO DONANTE ──────────────────────────────────────────────────────
    if (datos.tipo === 'fisica') {
      const prefijo = datos.genero || 'D.';
      doc.font('Helvetica').text(`${prefijo} `, { continued: true })
        .font('Helvetica-Bold').text(datos.nombre, { continued: true })
        .font('Helvetica').text(' con DNI ', { continued: true })
        .font('Helvetica-Bold').text(datos.documento, { continued: true })
        .font('Helvetica').text(' y titular de la cuenta ', { continued: true })
        .font('Helvetica-Bold').text(ibanOrigen, { continued: true })
        .font('Helvetica').text(', ha realizado una ', { continued: true })
        .font('Helvetica-Bold').text('donación dineraria', { continued: true })
        .font('Helvetica').text(' a esta asociación, por importe de ', { continued: true })
        .font('Helvetica-Bold').text(importeParentesis, { continued: true })
        .font('Helvetica').text('.');
    } else {
      const sufijo = datos.swift ? ` (SWIFT: ${datos.swift})` : '';
      doc.font('Helvetica').text('La entidad ', { continued: true })
        .font('Helvetica-Bold').text(datos.nombre, { continued: true })
        .font('Helvetica').text(', con N.I.F. ', { continued: true })
        .font('Helvetica-Bold').text(datos.documento, { continued: true })
        .font('Helvetica').text(' y titular de la cuenta ', { continued: true })
        .font('Helvetica-Bold').text(ibanOrigen + sufijo, { continued: true })
        .font('Helvetica').text(', ha realizado una ', { continued: true })
        .font('Helvetica-Bold').text('donación dineraria', { continued: true })
        .font('Helvetica').text(' a esta asociación, por importe de ', { continued: true })
        .font('Helvetica-Bold').text(importeParentesis, { continued: true })
        .font('Helvetica').text('.');
    }

    doc.moveDown(0.8);

    // ── DETALLES ─────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').text('Detalles de la donación:');
    doc.moveDown(0.4);

    const bullets = [
      { label: 'Importe donado: ',                      value: `${importeNum} €` },
      { label: 'Fecha de la donación: ',                 value: fechaFormateada },
      { label: 'Medio de pago: ',                        value: 'Transferencia bancaria' },
      { label: 'Cuenta de destino (Deporte Pedrola): ',  value: CUENTA_CLUB },
      { label: 'Finalidad de la donación: ',             value: 'Apoyo a las actividades deportivas y sociales sin ánimo de lucro de la asociación' },
      { label: 'Carácter de la donación: ',              value: 'Irrevocable, sin contraprestación' },
    ];

    bullets.forEach(({ label, value }) => {
      doc.font('Helvetica').text('• ', { indent: 20, continued: true })
        .font('Helvetica-Bold').text(label, { continued: true })
        .font('Helvetica').text(value);
      doc.moveDown(0.3);
    });

    doc.moveDown(0.5);

    // ── TEXTO LEGAL ──────────────────────────────────────────────────────────
    doc.font('Helvetica').text('La Asociación Deporte Pedrola se encuentra ', { continued: true })
      .font('Helvetica-Bold').text('acogida al régimen fiscal especial del Título II de la Ley 49/2002', { continued: true })
      .font('Helvetica').text(', de 23 de diciembre, sobre el régimen fiscal de las entidades sin fines lucrativos y de los incentivos fiscales al mecenazgo.');

    doc.moveDown(0.8);

    doc.font('Helvetica').text('El presente certificado se expide a efectos de lo previsto en el artículo 24 de la citada Ley, para que el donante pueda acogerse a los incentivos fiscales correspondientes.');

    doc.moveDown(1.5);

    // ── FIRMA ────────────────────────────────────────────────────────────────
    doc.font('Helvetica').text('Fdo.:');
    doc.font('Helvetica-Bold').text('Jaime Ruiz Herrero');

    if (fs.existsSync(FIRMA_PATH)) {
      doc.moveDown(0.3);
      doc.image(FIRMA_PATH, { width: 130 });
      doc.moveDown(0.3);
    } else {
      doc.moveDown(3);
    }

    doc.font('Helvetica').text('Presidente de Deporte Pedrola');
    doc.text('DNI: 25480386C');
    doc.text('+34 607 861 568');

    doc.end();
  });
}

module.exports = { generarCertificadoDonacion };
