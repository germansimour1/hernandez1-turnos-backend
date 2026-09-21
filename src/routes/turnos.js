const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const {
  timeToMinutes,
  minutesToTime,
  esFechaValida,
  esHoraValida,
  calcularDisponibilidad,
  calcularDisponibilidadCualquiera,
  barberoPuedeTomarTurno,
  encontrarBarberoDisponible
} = require('../utils/horarios');

const router = express.Router();

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_REGEX = /^\d{2}:\d{2}$/;

const incluirRelaciones = {
  barbero: { select: { id: true, nombre: true } },
  servicio: { select: { id: true, nombre: true, duracionMin: true, precio: true } }
};

// GET /api/turnos/disponibilidad?fecha=2026-09-19&servicioId=1&barberoId=2
// barberoId es opcional: si no viene, se calcula disponibilidad combinada
// de todos los barberos (para la opción "Cualquiera" del cliente).
router.get('/disponibilidad', async (req, res, next) => {
  try {
    const { fecha, servicioId, barberoId } = req.query;

    if (!fecha || !FECHA_REGEX.test(fecha) || !esFechaValida(fecha)) {
      return res.status(400).json({ error: 'fecha inválida, usar formato YYYY-MM-DD' });
    }
    const servicioIdNum = Number(servicioId);
    if (!servicioId || !Number.isInteger(servicioIdNum)) {
      return res.status(400).json({ error: 'servicioId inválido' });
    }

    let disponibilidad;
    if (barberoId !== undefined) {
      const barberoIdNum = Number(barberoId);
      if (!Number.isInteger(barberoIdNum)) {
        return res.status(400).json({ error: 'barberoId inválido' });
      }
      const barbero = await prisma.barbero.findUnique({ where: { id: barberoIdNum } });
      if (!barbero || !barbero.activo) {
        return res.status(404).json({ error: 'Barbero no encontrado' });
      }
      disponibilidad = await calcularDisponibilidad(prisma, {
        barberoId: barberoIdNum,
        fecha,
        servicioId: servicioIdNum
      });
    } else {
      disponibilidad = await calcularDisponibilidadCualquiera(prisma, { fecha, servicioId: servicioIdNum });
    }

    if (disponibilidad === null) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    res.json({ fecha, servicioId: servicioIdNum, barberoId: barberoId ? Number(barberoId) : null, slots: disponibilidad });
  } catch (err) {
    next(err);
  }
});

const crearTurnoSchema = z.object({
  clienteNombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  clienteTelefono: z.string().trim().max(30).optional(),
  barberoId: z.number().int().positive().optional(),
  servicioId: z.number().int().positive(),
  fecha: z.string().regex(FECHA_REGEX, 'fecha debe tener formato YYYY-MM-DD'),
  horaInicio: z.string().regex(HORA_REGEX, 'horaInicio debe tener formato HH:MM'),
  notas: z.string().trim().max(300).optional()
});

// POST /api/turnos -> el cliente solicita un turno. Queda en estado PENDIENTE
// hasta que el barbero lo apruebe o rechace desde su panel.
router.post('/', async (req, res, next) => {
  try {
    const parsed = crearTurnoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.flatten() });
    }
    const { clienteNombre, clienteTelefono, barberoId, servicioId, fecha, horaInicio, notas } = parsed.data;

    if (!esFechaValida(fecha)) {
      return res.status(400).json({ error: 'fecha inválida' });
    }
    if (!esHoraValida(horaInicio)) {
      return res.status(400).json({ error: 'horaInicio inválida' });
    }

    const servicio = await prisma.servicio.findUnique({ where: { id: servicioId } });
    if (!servicio || !servicio.activo) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const horaFin = minutesToTime(timeToMinutes(horaInicio) + servicio.duracionMin);

    let barberoIdFinal = barberoId ?? null;
    if (barberoIdFinal) {
      const barbero = await prisma.barbero.findUnique({ where: { id: barberoIdFinal } });
      if (!barbero || !barbero.activo) {
        return res.status(404).json({ error: 'Barbero no encontrado' });
      }
      const puede = await barberoPuedeTomarTurno(prisma, { barberoId: barberoIdFinal, fecha, horaInicio, horaFin });
      if (!puede) {
        return res.status(409).json({ error: 'Ese horario ya no está disponible con ese barbero' });
      }
    } else {
      barberoIdFinal = await encontrarBarberoDisponible(prisma, { fecha, horaInicio, horaFin });
      if (!barberoIdFinal) {
        return res.status(409).json({ error: 'No hay barberos disponibles en ese horario' });
      }
    }

    const turno = await prisma.turno.create({
      data: {
        clienteNombre,
        clienteTelefono,
        barberoId: barberoIdFinal,
        servicioId,
        fecha,
        horaInicio,
        horaFin,
        notas,
        estado: 'PENDIENTE'
      },
      include: incluirRelaciones
    });

    res.status(201).json(turno);
  } catch (err) {
    next(err);
  }
});

// GET /api/turnos?barberoId=&fecha=&desde=&hasta=&estado=
// Alimenta el panel del barbero (vistas día / semana / mes):
// - fecha=YYYY-MM-DD para un día puntual
// - desde=YYYY-MM-DD&hasta=YYYY-MM-DD para un rango (semana o mes)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { barberoId, fecha, desde, hasta, estado } = req.query;
    const where = {};

    if (barberoId !== undefined) {
      const barberoIdNum = Number(barberoId);
      if (!Number.isInteger(barberoIdNum)) return res.status(400).json({ error: 'barberoId inválido' });
      where.barberoId = barberoIdNum;
    }
    if (estado !== undefined) {
      const estadosValidos = ['PENDIENTE', 'CONFIRMADO', 'RECHAZADO', 'CANCELADO'];
      if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'estado inválido' });
      where.estado = estado;
    }
    if (fecha !== undefined) {
      if (!FECHA_REGEX.test(fecha)) return res.status(400).json({ error: 'fecha inválida' });
      where.fecha = fecha;
    } else if (desde !== undefined || hasta !== undefined) {
      if (!desde || !hasta || !FECHA_REGEX.test(desde) || !FECHA_REGEX.test(hasta)) {
        return res.status(400).json({ error: 'desde y hasta deben tener formato YYYY-MM-DD' });
      }
      where.fecha = { gte: desde, lte: hasta };
    }

    const turnos = await prisma.turno.findMany({
      where,
      include: incluirRelaciones,
      orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }]
    });
    res.json(turnos);
  } catch (err) {
    next(err);
  }
});

// GET /api/turnos/pendientes?barberoId= -> bandeja de solicitudes del barbero
router.get('/pendientes', requireAuth, async (req, res, next) => {
  try {
    const { barberoId } = req.query;
    const where = { estado: 'PENDIENTE' };
    if (barberoId !== undefined) {
      const barberoIdNum = Number(barberoId);
      if (!Number.isInteger(barberoIdNum)) return res.status(400).json({ error: 'barberoId inválido' });
      where.barberoId = barberoIdNum;
    }
    const turnos = await prisma.turno.findMany({
      where,
      include: incluirRelaciones,
      orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }]
    });
    res.json(turnos);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
    const turno = await prisma.turno.findUnique({ where: { id }, include: incluirRelaciones });
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
    res.json(turno);
  } catch (err) {
    next(err);
  }
});

async function cambiarEstado(req, res, next, nuevoEstado, estadosPermitidosDesde) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const turno = await prisma.turno.findUnique({ where: { id } });
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });

    if (!estadosPermitidosDesde.includes(turno.estado)) {
      return res.status(409).json({
        error: `El turno no se puede pasar a ${nuevoEstado} porque su estado actual es ${turno.estado}`
      });
    }

    const actualizado = await prisma.turno.update({
      where: { id },
      data: { estado: nuevoEstado },
      include: incluirRelaciones
    });
    res.json(actualizado);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/turnos/:id/aprobar -> el barbero confirma la solicitud
router.patch('/:id/aprobar', requireAuth, (req, res, next) => cambiarEstado(req, res, next, 'CONFIRMADO', ['PENDIENTE']));

// PATCH /api/turnos/:id/rechazar -> el barbero rechaza la solicitud
router.patch('/:id/rechazar', requireAuth, (req, res, next) => cambiarEstado(req, res, next, 'RECHAZADO', ['PENDIENTE']));

// PATCH /api/turnos/:id/cancelar -> cancelación (cliente o barbero)
router.patch('/:id/cancelar', (req, res, next) =>
  cambiarEstado(req, res, next, 'CANCELADO', ['PENDIENTE', 'CONFIRMADO'])
);

module.exports = router;
