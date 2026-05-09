'use strict';

const fs   = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] Schema aplicado correctamente');
  await pool.end();
}

migrate().catch(err => {
  console.error('[migrate] Error:', err.message);
  process.exit(1);
});
