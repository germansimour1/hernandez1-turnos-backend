const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Horario estándar que se asigna a un barbero recién creado (lun a sáb, 09:00-19:00).
const DIAS_ATENCION = [1, 2, 3, 4, 5, 6];
const HORA_INICIO = '09:00';
const HORA_FIN = '19:00';

// GET /api/barberos -> lista de barberos activos (para los chips de selección del cliente)
router.get('/', async (req, res, next) => {
  try {
    const barberos = await prisma.barbero.findMany({
      where: { activo: true },
      orderBy: { id: 'asc' },
      select: { id: true, nombre: true }
    });
    res.json(barberos);
  } catch (err) {
    next(err);
  }
});

const crearBarberoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80, 'El nombre es demasiado largo')
});

// POST /api/barberos -> crea un nuevo barbero (solo desde el panel autenticado del barbero).
// Se le asigna automáticamente el horario estándar de atención de la barbería.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = crearBarberoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.flatten() });
    }
    const { nombre } = parsed.data;

    const existente = await prisma.barbero.findUnique({ where: { nombre } });
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un barbero con ese nombre' });
    }

    const barbero = await prisma.barbero.create({ data: { nombre } });
    await Promise.all(
      DIAS_ATENCION.map((diaSemana) =>
        prisma.horario.create({
          data: { barberoId: barbero.id, diaSemana, horaInicio: HORA_INICIO, horaFin: HORA_FIN }
        })
      )
    );

    res.status(201).json({ id: barbero.id, nombre: barbero.nombre });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
