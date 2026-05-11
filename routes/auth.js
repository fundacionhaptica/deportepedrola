'use strict';

const router = require('express').Router();
const jwt    = require('jsonwebtoken');

const PERMISOS = {
  admin: ['read:datos', 'write:datos', 'delete:datos'],
  junta: ['read:datos', 'write:datos'],
  socio: ['read:datos'],
};

// Devuelve { pass } para el usuario dado, leyendo del .env en tiempo de petición.
function credencial(usuario) {
  const clave = `AUTH_${usuario.toUpperCase()}_PASS`;
  return process.env[clave] || null;
}

router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};

  if (!usuario || !password) {
    return res.status(400).json({ error: 'Faltan usuario o contraseña.' });
  }

  const rol = usuario.toLowerCase();
  if (!PERMISOS[rol]) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const passEsperado = credencial(rol);
  if (!passEsperado || password !== passEsperado) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const jwt_firmado = jwt.sign(
    { sub: rol, permissions: PERMISOS[rol] },
    process.env.JWT_SECRET,
    { audience: 'deporte-pedrola', issuer: 'deporte-pedrola', expiresIn: '12h' }
  );

  res.json({ jwt: jwt_firmado, rol });
});

router.post('/logout', (_req, res) => {
  // El token es stateless; el cliente simplemente lo descarta.
  res.json({ ok: true });
});

module.exports = router;
