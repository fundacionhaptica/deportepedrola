'use strict';

const router = require('express').Router();

// Redirige al logout de Auth0 limpiando la sesión del SPA
router.get('/logout', (_req, res) => {
  const domain   = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const returnTo = encodeURIComponent(process.env.PUBLIC_URL || 'http://localhost:3000');
  res.redirect(`https://${domain}/v2/logout?client_id=${clientId}&returnTo=${returnTo}`);
});

module.exports = router;
