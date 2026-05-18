'use strict';

/**
 * Importa los socios desde un fichero Excel al sistema.
 * Uso: node scripts/importar-socios.js <ruta-excel>
 *
 * El fichero Excel debe tener el formato exportado del formulario de inscripción:
 * Columnas: Nº | Email | Apellidos | Nombre | DNI | FechaNac | Domicilio | Localidad |
 *           CP | Teléfono | Atletismo | Baloncesto | F7 | Fútbol | FS | G.Rítmica |
 *           Kenpo | Kickboxing | Patinaje | Trail | Voleibol |
 *           Apellidos Tutor | DNI Tutor | Teléfono Tutor | Cuenta
 */

const XLSX  = require('xlsx');
const path  = require('path');
const { Pool } = require('pg');

const excelPath = process.argv[2];
if (!excelPath) {
  console.error('Uso: node scripts/importar-socios.js <ruta-excel>');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COL_DEPORTES = {
  10: 'act_atletismo',
  11: 'act_baloncesto',
  12: 'act_f7',
  13: 'act_futbol',
  14: 'act_fs',
  15: 'act_g_ritmica',
  16: 'act_kenpo',
  17: 'act_kickboxing',
  18: 'act_patinaje',
  19: 'act_trail',
  20: 'act_voleibol',
};

function limpiarDni(v) {
  const s = String(v || '').trim();
  if (!s || s.toUpperCase() === 'ZXXXXXXXX' || s.toUpperCase() === 'NI TIENE' || s.toUpperCase() === 'NO TIENE') return null;
  return s;
}

function limpiarTelefono(v) {
  const s = String(v || '').trim();
  if (!s || s.toLowerCase() === 'no tiene') return null;
  return s;
}

function limpiarEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  return s || null;
}

function limpiarFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // xlsx puede devolver fecha como número serial de Excel
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v).slice(0, 10);
  return s || null;
}

async function main() {
  console.log(`Leyendo: ${path.resolve(excelPath)}`);
  const wb   = XLSX.readFile(excelPath, { cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const dataRows = rows.slice(1).filter(r => r[0] != null && String(r[0]).trim() !== '');
  console.log(`Total filas a procesar: ${dataRows.length}\n`);

  const client = await pool.connect();
  let insertados = 0, actualizados = 0;
  const errores = [];

  try {
    await client.query('BEGIN');

    for (const row of dataRows) {
      const numeroSocio   = parseInt(row[0], 10);
      const email         = limpiarEmail(row[1]);
      const apellidos     = row[2] ? String(row[2]).trim() : null;
      const nombre        = row[3] ? String(row[3]).trim() : null;
      const dni           = limpiarDni(row[4]);
      const fechaNac      = limpiarFecha(row[5]);
      const domicilio     = row[6] ? String(row[6]).trim() : null;
      const localidad     = row[7] ? String(row[7]).trim() : null;
      const codigoPostal  = row[8] ? String(row[8]).trim() : null;
      const telefono      = limpiarTelefono(row[9]);

      const deportes = {};
      for (const [col, campo] of Object.entries(COL_DEPORTES)) {
        deportes[campo] = Boolean(row[parseInt(col, 10)]);
      }

      const apellidosTutor = row[21] ? String(row[21]).trim() : null;
      const dniTutor       = limpiarDni(row[22]);
      const telefonoTutor  = limpiarTelefono(row[23]);
      const numeroCuenta   = row[24] ? String(row[24]).trim() : null;

      if (!nombre && !apellidos) {
        errores.push({ nro: numeroSocio, motivo: 'nombre y apellidos vacíos' });
        continue;
      }

      try {
        const { rowCount, rows: r } = await client.query(`
          INSERT INTO socios (
            numero_socio, socio_desde,
            nombre, apellidos, email, dni, fecha_nacimiento,
            domicilio, localidad, codigo_postal, telefono,
            act_atletismo, act_baloncesto, act_f7, act_futbol, act_fs,
            act_g_ritmica, act_kenpo, act_kickboxing, act_patinaje, act_trail, act_voleibol,
            apellidos_tutor, dni_tutor, telefono_tutor, numero_cuenta
          ) VALUES (
            $1, 2025,
            $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21,
            $22,$23,$24,$25
          )
          ON CONFLICT (numero_socio) WHERE numero_socio IS NOT NULL DO UPDATE SET
            nombre           = EXCLUDED.nombre,
            apellidos        = EXCLUDED.apellidos,
            email            = EXCLUDED.email,
            dni              = EXCLUDED.dni,
            fecha_nacimiento = EXCLUDED.fecha_nacimiento,
            domicilio        = EXCLUDED.domicilio,
            localidad        = EXCLUDED.localidad,
            codigo_postal    = EXCLUDED.codigo_postal,
            telefono         = EXCLUDED.telefono,
            act_atletismo    = EXCLUDED.act_atletismo,
            act_baloncesto   = EXCLUDED.act_baloncesto,
            act_f7           = EXCLUDED.act_f7,
            act_futbol       = EXCLUDED.act_futbol,
            act_fs           = EXCLUDED.act_fs,
            act_g_ritmica    = EXCLUDED.act_g_ritmica,
            act_kenpo        = EXCLUDED.act_kenpo,
            act_kickboxing   = EXCLUDED.act_kickboxing,
            act_patinaje     = EXCLUDED.act_patinaje,
            act_trail        = EXCLUDED.act_trail,
            act_voleibol     = EXCLUDED.act_voleibol,
            apellidos_tutor  = EXCLUDED.apellidos_tutor,
            dni_tutor        = EXCLUDED.dni_tutor,
            telefono_tutor   = EXCLUDED.telefono_tutor,
            numero_cuenta    = EXCLUDED.numero_cuenta
          RETURNING (xmax = 0) AS fue_insert
        `, [
          numeroSocio,
          nombre, apellidos, email, dni, fechaNac,
          domicilio, localidad, codigoPostal, telefono,
          deportes.act_atletismo, deportes.act_baloncesto, deportes.act_f7,
          deportes.act_futbol, deportes.act_fs, deportes.act_g_ritmica,
          deportes.act_kenpo, deportes.act_kickboxing, deportes.act_patinaje,
          deportes.act_trail, deportes.act_voleibol,
          apellidosTutor, dniTutor, telefonoTutor, numeroCuenta,
        ]);

        if (r[0]?.fue_insert) insertados++; else actualizados++;
      } catch (err) {
        errores.push({ nro: numeroSocio, motivo: err.message });
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error fatal, rollback:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`Insertados:   ${insertados}`);
  console.log(`Actualizados: ${actualizados}`);
  console.log(`Errores:      ${errores.length}`);
  if (errores.length) {
    console.log('\nDetalle de errores:');
    errores.forEach(e => console.log(`  Nº ${e.nro}: ${e.motivo}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
