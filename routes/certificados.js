'use strict';

const express = require('express');
const { generarCertificadoDonacion } = require('../lib/certificado-donacion');

const router = express.Router();

// POST /api/certificados/donacion
// Genera y descarga el PDF del certificado de donación.
router.post('/donacion', async (req, res) => {
  const { fecha, tipo, genero, nombre, documento, cuentaOrigen, importe, swift } = req.body;

  if (!fecha || !tipo || !nombre || !documento || !cuentaOrigen || !importe) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (!['fisica', 'juridica'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de donante no válido.' });
  }
  if (isNaN(parseFloat(importe)) || parseFloat(importe) <= 0) {
    return res.status(400).json({ error: 'Importe no válido.' });
  }

  try {
    const pdfBuffer = await generarCertificadoDonacion({
      fecha, tipo, genero, nombre, documento, cuentaOrigen, importe: parseFloat(importe), swift,
    });

    const nombreArchivo = `Certificado_donacion_${nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 40)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[certificados] Error generando PDF:', err);
    res.status(500).json({ error: 'Error al generar el certificado.' });
  }
});

module.exports = router;
