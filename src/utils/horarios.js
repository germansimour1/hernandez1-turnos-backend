// Utilidades para calcular horarios de atención, franjas disponibles
// y detectar superposición entre turnos.

const PASO_MIN = 15; // granularidad de los horarios que se ofrecen (cada 15 min)

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// "2026-09-19" -> 0 (domingo) ... 6 (sábado). Se parsea como fecha UTC
// para no depender de la zona horaria del servidor.
function diaSemanaDeFecha(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCDay();
}

function esFechaValida(fechaStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(fechaStr) && !Number.isNaN(diaSemanaDeFecha(fechaStr) - diaSemanaDeFecha(fechaStr));
}

function esHoraValida(horaStr) {
  return /^\d{2}:\d{2}$/.test(horaStr);
}

// Devuelve true si los rangos [aInicio,aFin) y [bInicio,bFin) se pisan.
function seSuperponen(aInicio, aFin, bInicio, bFin) {
  return aInicio < bFin && bInicio < aFin;
}

// Genera los horarios de inicio posibles entre horaInicio y horaFin
// (strings "HH:MM") para un servicio de duracionMin, cada PASO_MIN minutos.
function generarSlots(horaInicio, horaFin, duracionMin) {
  const inicioMin = timeToMinutes(horaInicio);
  const finMin = timeToMinutes(horaFin);
  const slots = [];
  for (let t = inicioMin; t + duracionMin <= finMin; t += PASO_MIN) {
    slots.push({ horaInicio: minutesToTime(t), horaFin: minutesToTime(t + duracionMin) });
  }
  return slots;
}

// Calcula la disponibilidad de un barbero para una fecha y servicio dados.
// Devuelve una lista de { horaInicio, horaFin, disponible }.
async function calcularDisponibilidad(prisma, { barberoId, fecha, servicioId }) {
  const servicio = await prisma.servicio.findUnique({ where: { id: servicioId } });
  if (!servicio || !servicio.activo) return null;

  const diaSemana = diaSemanaDeFecha(fecha);
  const horario = await prisma.horario.findUnique({
    where: { barberoId_diaSemana: { barberoId, diaSemana } }
  });
  if (!horario) return []; // el barbero no atiende ese día

  const slots = generarSlots(horario.horaInicio, horario.horaFin, servicio.duracionMin);

  const turnosExistentes = await prisma.turno.findMany({
    where: {
      barberoId,
      fecha,
      estado: { in: ['PENDIENTE', 'CONFIRMADO'] }
    }
  });

  return slots.map((slot) => {
    const ocupado = turnosExistentes.some((t) =>
      seSuperponen(
        timeToMinutes(slot.horaInicio),
        timeToMinutes(slot.horaFin),
        timeToMinutes(t.horaInicio),
        timeToMinutes(t.horaFin)
      )
    );
    return { ...slot, disponible: !ocupado };
  });
}

// Verifica que un barbero pueda tomar un turno puntual (usado también
// al crear el turno, para no confiar solo en lo que mandó el cliente).
async function barberoPuedeTomarTurno(prisma, { barberoId, fecha, horaInicio, horaFin }) {
  const diaSemana = diaSemanaDeFecha(fecha);
  const horario = await prisma.horario.findUnique({
    where: { barberoId_diaSemana: { barberoId, diaSemana } }
  });
  if (!horario) return false;
  if (timeToMinutes(horaInicio) < timeToMinutes(horario.horaInicio)) return false;
  if (timeToMinutes(horaFin) > timeToMinutes(horario.horaFin)) return false;

  const turnosExistentes = await prisma.turno.findMany({
    where: {
      barberoId,
      fecha,
      estado: { in: ['PENDIENTE', 'CONFIRMADO'] }
    }
  });
  const hayChoque = turnosExistentes.some((t) =>
    seSuperponen(
      timeToMinutes(horaInicio),
      timeToMinutes(horaFin),
      timeToMinutes(t.horaInicio),
      timeToMinutes(t.horaFin)
    )
  );
  return !hayChoque;
}

// Cuando el cliente elige "Cualquiera" como barbero, busca el primero
// disponible para ese horario puntual.
async function encontrarBarberoDisponible(prisma, { fecha, horaInicio, horaFin }) {
  const barberos = await prisma.barbero.findMany({ where: { activo: true }, orderBy: { id: 'asc' } });
  for (const barbero of barberos) {
    // eslint-disable-next-line no-await-in-loop
    const puede = await barberoPuedeTomarTurno(prisma, { barberoId: barbero.id, fecha, horaInicio, horaFin });
    if (puede) return barbero.id;
  }
  return null;
}

// Igual que calcularDisponibilidad, pero para cuando el cliente elige
// "Cualquiera" como barbero: un horario está disponible si ALGÚN
// barbero activo puede tomarlo.
async function calcularDisponibilidadCualquiera(prisma, { fecha, servicioId }) {
  const servicio = await prisma.servicio.findUnique({ where: { id: servicioId } });
  if (!servicio || !servicio.activo) return null;

  const barberos = await prisma.barbero.findMany({ where: { activo: true } });
  if (barberos.length === 0) return [];

  const diaSemana = diaSemanaDeFecha(fecha);
  const horarios = await prisma.horario.findMany({
    where: { diaSemana, barberoId: { in: barberos.map((b) => b.id) } }
  });
  if (horarios.length === 0) return []; // nadie atiende ese día

  const horaInicio = horarios.reduce(
    (min, h) => (timeToMinutes(h.horaInicio) < timeToMinutes(min) ? h.horaInicio : min),
    horarios[0].horaInicio
  );
  const horaFin = horarios.reduce(
    (max, h) => (timeToMinutes(h.horaFin) > timeToMinutes(max) ? h.horaFin : max),
    horarios[0].horaFin
  );

  const slots = generarSlots(horaInicio, horaFin, servicio.duracionMin);

  const turnosExistentes = await prisma.turno.findMany({
    where: { fecha, estado: { in: ['PENDIENTE', 'CONFIRMADO'] } }
  });

  const horarioPorBarbero = new Map(horarios.map((h) => [h.barberoId, h]));

  return slots.map((slot) => {
    const disponible = barberos.some((barbero) => {
      const h = horarioPorBarbero.get(barbero.id);
      if (!h) return false;
      if (timeToMinutes(slot.horaInicio) < timeToMinutes(h.horaInicio)) return false;
      if (timeToMinutes(slot.horaFin) > timeToMinutes(h.horaFin)) return false;
      const ocupado = turnosExistentes.some(
        (t) =>
          t.barberoId === barbero.id &&
          seSuperponen(
            timeToMinutes(slot.horaInicio),
            timeToMinutes(slot.horaFin),
            timeToMinutes(t.horaInicio),
            timeToMinutes(t.horaFin)
          )
      );
      return !ocupado;
    });
    return { ...slot, disponible };
  });
}

module.exports = {
  PASO_MIN,
  timeToMinutes,
  minutesToTime,
  diaSemanaDeFecha,
  esFechaValida,
  esHoraValida,
  seSuperponen,
  generarSlots,
  calcularDisponibilidad,
  calcularDisponibilidadCualquiera,
  barberoPuedeTomarTurno,
  encontrarBarberoDisponible
};
