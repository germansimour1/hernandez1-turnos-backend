const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/servicios -> lista de servicios activos (nombre, duración, precio)
router.get('/', async (req, res, next) => {
  try {
    const servicios = await prisma.servicio.findMany({
      where: { activo: true },
      orderBy: { id: 'asc' },
      select: { id: true, nombre: true, duracionMin: true, precio: true }
    });
    res.json(servicios);
  } catch (err) {
    next(err);
  }
});

const actualizarServicioSchema = z
  .object({
    precio: z.number().positive('El precio debe ser mayor a 0').max(10000000, 'El precio es demasiado alto').optional(),
    duracionMin: z.number().int().positive('La duración debe ser mayor a 0').max(600, 'La duración es demasiado larga').optional()
  })
  .refine((data) => data.precio !== undefined || data.duracionMin !== undefined, {
    message: 'Debe enviar al menos un valor para actualizar'
  });

// PATCH /api/servicios/:id -> actualiza precio y/o duración de un corte
// (solo desde el panel autenticado del barbero).
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const parsed = actualizarServicioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.flatten() });
    }

    const servicio = await prisma.servicio.findUnique({ where: { id } });
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });

    const actualizado = await prisma.servicio.update({
      where: { id },
      data: parsed.data,
      select: { id: true, nombre: true, duracionMin: true, precio: true }
    });
    res.json(actualizado);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
