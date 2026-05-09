const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');

// ─── Conversión de importe a texto en español ────────────────────────────────

const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete',
  'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const DECENAS  = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
  'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
  'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function menosDeMillLocal(n) {
  if (n === 0)   return '';
  if (n === 100) return 'cien';
  if (n < 20)    return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (d === 2 && u > 0) return `veinti${UNIDADES[u]}`;
    return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
  }
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 1 && r === 0) return 'cien';
  return r === 0 ? CENTENAS[c] : `${CENTENAS[c]} ${menosDeMillLocal(r)}`;
}

function importeEnLetra(importe) {
  const total = Math.round(importe * 100);
  const euros  = Math.floor(total / 100);
  const cents  = total % 100;

  if (euros < 0 || euros > 999999) return importe.toFixed(2) + ' euros';

  let parteEntera = '';

  if (euros === 0) {
    parteEntera = 'cero';
  } else {
    const miles = Math.floor(euros / 1000);
    const resto = euros % 1000;

    if (miles > 0) {
      parteEntera += miles === 1 ? 'mil' : `${menosDeMillLocal(miles)} mil`;
      if (resto > 0) parteEntera += ` ${menosDeMillLocal(resto)}`;
    } else {
      parteEntera = menosDeMillLocal(resto);
    }
  }

  let texto = `${parteEntera} euro${euros === 1 ? '' : 's'}`;
  if (cents > 0) {
    texto += ` con ${menosDeMillLocal(cents)} céntimo${cents === 1 ? '' : 's'}`;
  }

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ─── Generación del PDF ──────────────────────────────────────────────────────

async function generarCertificadoDonacion(ingreso) {
  const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
  const certDir    = path.join(uploadsDir, 'certificados-donacion');
  fs.mkdirSync(certDir, { recursive: true });

  const filename   = `certificado-donacion-${ingreso.id}.pdf`;
  const outputPath = path.join(certDir, filename);

  const club = {
    nombre:       process.env.CLUB_NOMBRE       || 'Club Deportivo Elemental Deporte Pedrola',
    cif:          process.env.CLUB_CIF          || 'G99528549',
    direccion:    process.env.CLUB_DIRECCION    || 'Calle Acceso Piscina s/n, 50690 Pedrola, Zaragoza',
    representante: process.env.CLUB_REPRESENTANTE_NOMBRE || 'Jaime Ruiz',
    reprDni:      process.env.CLUB_REPRESENTANTE_DNI     || '',
    cargo:        process.env.CLUB_REPRESENTANTE_CARGO   || 'Presidente',
  };

  const importe        = parseFloat(ingreso.importe);
  const importeLetra   = importeEnLetra(importe);
  const fechaFormato   = ingreso.fecha instanceof Date
    ? ingreso.fecha.toLocaleDateString('es-ES')
    : String(ingreso.fecha).split('T')[0];

  return new Promise((resolve, reject) => {
    const doc  = new PDFDocument({ size: 'A4', margin: 60 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Cabecera
    doc.fontSize(13).font('Helvetica-Bold').text(club.nombre, { align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text(`CIF: ${club.cif}`, { align: 'center' })
      .text(club.direccion, { align: 'center' });

    doc.moveDown(1.5);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(1);

    // Título
    doc.fontSize(14).font('Helvetica-Bold')
      .text(`CERTIFICADO DE DONACIÓN Nº ${ingreso.id}`, { align: 'center' });
    doc.moveDown(1.5);

    // Cuerpo
    doc.fontSize(11).font('Helvetica')
      .text(`D./Dña. ${club.representante}, con DNI ${club.reprDni}, en calidad de ${club.cargo} de ${club.nombre} (CIF ${club.cif}),`);
    doc.moveDown(1);

    doc.font('Helvetica-Bold').text('CERTIFICA:');
    doc.moveDown(0.5);

    doc.font('Helvetica').text(
      `Que D./Dña. ${ingreso.donante_nombre || '___'}, con DNI/NIF ${ingreso.donante_dni || '___'}, ` +
      `con domicilio en ${ingreso.donante_direccion || '___'}, ha realizado a esta entidad una donación ` +
      `pura, simple e irrevocable por importe de ${importe.toFixed(2)} € (${importeLetra}) ` +
      `con fecha ${fechaFormato}, mediante ${ingreso.forma_pago || 'transferencia bancaria'}.`,
      { align: 'justify' }
    );
    doc.moveDown(0.8);

    doc.text(
      `La donación se destina a: ${ingreso.concepto || '___'}.`,
      { align: 'justify' }
    );
    doc.moveDown(0.8);

    doc.text(
      'La presente donación se realiza a una entidad sin fines lucrativos a efectos de la Ley 49/2002, ' +
      'de 23 de diciembre, de régimen fiscal de las entidades sin fines lucrativos y de los incentivos ' +
      'fiscales al mecenazgo, en su caso aplicable según la naturaleza de la entidad. El donante podrá ' +
      'aplicar en su declaración del IRPF las deducciones previstas en dicha Ley sobre el importe certificado.',
      { align: 'justify' }
    );
    doc.moveDown(0.8);

    doc.text(
      'A los efectos previstos en el artículo 6 del Real Decreto 1270/2003, esta entidad incluirá los ' +
      'datos del donante en la declaración informativa anual modelo 182.',
      { align: 'justify' }
    );
    doc.moveDown(1.5);

    doc.text(`En Pedrola, a ${fechaFormato}.`);
    doc.moveDown(2);

    doc.font('Helvetica-Bold')
      .text(`Firma: ${club.representante} — ${club.cargo}`);

    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

module.exports = { generarCertificadoDonacion, importeEnLetra };
