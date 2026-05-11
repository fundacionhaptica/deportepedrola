'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

const ACTIVIDADES = [
  'act_atletismo','act_baloncesto','act_f7','act_futbol','act_fs',
  'act_g_ritmica','act_kenpo','act_kickboxing','act_patinaje',
  'act_trail','act_voleibol','act_dirigidas',
];

const SELECT_FIELDS = `
  id, nombre, apellidos, email, dni, fecha_nacimiento,
  domicilio, localidad, codigo_postal, telefono,
  act_atletismo, act_baloncesto, act_f7, act_futbol, act_fs,
  act_g_ritmica, act_kenpo, act_kickboxing, act_patinaje,
  act_trail, act_voleibol, act_dirigidas,
  apellidos_tutor, dni_tutor, telefono_tutor, numero_cuenta,
  cuota, pagado, pagado_metodo, pagado_fecha,
  rol, activo, created_at
`;

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM socios ORDER BY apellidos, nombre`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const {
    nombre, apellidos, email, dni, fecha_nacimiento,
    domicilio, localidad, codigo_postal, telefono,
    apellidos_tutor, dni_tutor, telefono_tutor, numero_cuenta,
    cuota, rol,
  } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ error: 'nombre y email son obligatorios' });
  }
  const rolFinal = ['socio','junta','admin'].includes(rol) ? rol : 'socio';

  const acts = {};
  ACTIVIDADES.forEach(a => { acts[a] = Boolean(req.body[a]); });

  try {
    const { rows } = await pool.query(`
      INSERT INTO socios (
        nombre, apellidos, email, dni, fecha_nacimiento,
        domicilio, localidad, codigo_postal, telefono,
        ${ACTIVIDADES.join(', ')},
        apellidos_tutor, dni_tutor, telefono_tutor, numero_cuenta,
        cuota, rol
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        $22,$23,$24,$25,$26,$27
      )
      RETURNING ${SELECT_FIELDS}`,
      [
        nombre.trim(), apellidos || null, email.trim().toLowerCase(),
        dni || null, fecha_nacimiento || null,
        domicilio || null, localidad || null, codigo_postal || null, telefono || null,
        ...ACTIVIDADES.map(a => acts[a]),
        apellidos_tutor || null, dni_tutor || null, telefono_tutor || null, numero_cuenta || null,
        cuota || null, rolFinal,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un socio con ese email' });
    throw err;
  }
});

// Importación masiva (desde CSV o Excel parseado en cliente)
router.post('/importar', async (req, res) => {
  const { socios } = req.body;
  if (!Array.isArray(socios) || socios.length === 0) {
    return res.status(400).json({ error: 'Se esperaba un array de socios' });
  }

  const resultados = { insertados: 0, actualizados: 0, errores: [] };

  for (const s of socios) {
    if (!s.nombre || !s.email) {
      resultados.errores.push({ ref: s.email || s.nombre || '?', motivo: 'nombre o email vacío' });
      continue;
    }
    const rolFinal = ['socio','junta','admin'].includes(s.rol) ? s.rol : 'socio';
    const acts = ACTIVIDADES.map(a => Boolean(s[a]));

    try {
      const r = await pool.query(`
        INSERT INTO socios (
          nombre, apellidos, email, dni, fecha_nacimiento,
          domicilio, localidad, codigo_postal, telefono,
          ${ACTIVIDADES.join(', ')},
          apellidos_tutor, dni_tutor, telefono_tutor, numero_cuenta,
          cuota, rol
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25,$26,$27
        )
        ON CONFLICT (email) DO UPDATE SET
          nombre           = EXCLUDED.nombre,
          apellidos        = EXCLUDED.apellidos,
          dni              = EXCLUDED.dni,
          fecha_nacimiento = EXCLUDED.fecha_nacimiento,
          domicilio        = EXCLUDED.domicilio,
          localidad        = EXCLUDED.localidad,
          codigo_postal    = EXCLUDED.codigo_postal,
          telefono         = EXCLUDED.telefono,
          ${ACTIVIDADES.map(a => `${a} = EXCLUDED.${a}`).join(',\n          ')},
          apellidos_tutor  = EXCLUDED.apellidos_tutor,
          dni_tutor        = EXCLUDED.dni_tutor,
          telefono_tutor   = EXCLUDED.telefono_tutor,
          numero_cuenta    = EXCLUDED.numero_cuenta,
          cuota            = EXCLUDED.cuota,
          rol              = EXCLUDED.rol
        `,
        [
          s.nombre.trim(), s.apellidos || null, s.email.trim().toLowerCase(),
          s.dni || null, s.fecha_nacimiento || null,
          s.domicilio || null, s.localidad || null, s.codigo_postal || null, s.telefono || null,
          ...acts,
          s.apellidos_tutor || null, s.dni_tutor || null, s.telefono_tutor || null, s.numero_cuenta || null,
          s.cuota || null, rolFinal,
        ]
      );
      if (r.rowCount) resultados.insertados++;
      else resultados.actualizados++;
    } catch (err) {
      resultados.errores.push({ ref: s.email, motivo: err.message });
    }
  }

  res.json(resultados);
});

router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const campos = [];
  const vals   = [];

  const simples = [
    'nombre','apellidos','email','dni','fecha_nacimiento',
    'domicilio','localidad','codigo_postal','telefono',
    'apellidos_tutor','dni_tutor','telefono_tutor','numero_cuenta',
    'cuota','rol','activo','pagado','pagado_metodo','pagado_fecha',
    ...ACTIVIDADES,
  ];

  for (const campo of simples) {
    if (req.body[campo] !== undefined) {
      campos.push(`${campo}=$${vals.push(req.body[campo])}`);
    }
  }

  if (!campos.length) return res.status(400).json({ error: 'Nada que actualizar' });

  // Cuando se marca pagado, registrar fecha automáticamente si no se indica
  if (req.body.pagado === true && req.body.pagado_fecha === undefined) {
    campos.push(`pagado_fecha=$${vals.push(new Date().toISOString().slice(0,10))}`);
  }
  // Cuando se desmarca pagado, limpiar método y fecha
  if (req.body.pagado === false) {
    campos.push(`pagado_metodo=$${vals.push(null)}`);
    campos.push(`pagado_fecha=$${vals.push(null)}`);
  }

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE socios SET ${campos.join(', ')} WHERE id=$${vals.length} RETURNING ${SELECT_FIELDS}`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Socio no encontrado' });
  res.json(rows[0]);
});

module.exports = router;
