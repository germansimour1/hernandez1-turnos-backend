// Test manual (sin dependencias) de la lógica de horarios.js usando un
// mock en memoria de Prisma. Se corre con `node test/horarios.manual-test.js`
// y no es parte de la app en sí (no lo usa el servidor).

const {
  generarSlots,
  calcularDisponibilidad,
  calcularDisponibilidadCualquiera,
  barberoPuedeTomarTurno,
  encontrarBarberoDisponible,
  diaSemanaDeFecha
} = require('../src/utils/horarios');

// --- datos en memoria ---
const barberos = [
  { id: 1, nombre: 'Diego', activo: true },
  { id: 2, nombre: 'Fede', activo: true }
];
const servicios = [{ id: 1, nombre: 'Corte', duracionMin: 30, activo: true }];
const horarios = [
  { barberoId: 1, diaSemana: 4, horaInicio: '09:00', horaFin: '19:00' }, // jueves
  { barberoId: 2, diaSemana: 4, horaInicio: '09:00', horaFin: '19:00' }
];
let turnos = [
  { id: 1, barberoId: 1, fecha: '2026-09-17', horaInicio: '09:30', horaFin: '10:00', estado: 'CONFIRMADO' },
  { id: 2, barberoId: 1, fecha: '2026-09-17', horaInicio: '10:30', horaFin: '11:00', estado: 'PENDIENTE' }
];

const prisma = {
  servicio: {
    findUnique: async ({ where: { id } }) => servicios.find((s) => s.id === id) || null
  },
  barbero: {
    findUnique: async ({ where: { id } }) => barberos.find((b) => b.id === id) || null,
    findMany: async ({ where }) => barberos.filter((b) => (where && where.activo !== undefined ? b.activo === where.activo : true))
  },
  horario: {
    findUnique: async ({ where: { barberoId_diaSemana } }) =>
      horarios.find(
        (h) => h.barberoId === barberoId_diaSemana.barberoId && h.diaSemana === barberoId_diaSemana.diaSemana
      ) || null,
    findMany: async ({ where }) =>
      horarios.filter(
        (h) => h.diaSemana === where.diaSemana && (!where.barberoId || where.barberoId.in.includes(h.barberoId))
      )
  },
  turno: {
    findMany: async ({ where }) =>
      turnos.filter((t) => {
        if (where.barberoId !== undefined && t.barberoId !== where.barberoId) return false;
        if (where.fecha !== undefined && t.fecha !== where.fecha) return false;
        if (where.estado && where.estado.in && !where.estado.in.includes(t.estado)) return false;
        return true;
      })
  }
};

function assert(cond, msg) {
  if (!cond) {
    console.error('FALLÓ:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

async function run() {
  // 17/9/2026 debe ser jueves (día 4)
  assert(diaSemanaDeFecha('2026-09-17') === 4, 'diaSemanaDeFecha detecta jueves para 2026-09-17');

  const slots = generarSlots('09:00', '10:00', 30);
  assert(slots.length === 3, 'generarSlots genera 3 franjas de 30min entre 9 y 10 (9:00,9:15,9:30)');
  assert(slots[0].horaInicio === '09:00' && slots[0].horaFin === '09:30', 'primer slot correcto');

  const disp = await calcularDisponibilidad(prisma, { barberoId: 1, fecha: '2026-09-17', servicioId: 1 });
  const slot0930 = disp.find((s) => s.horaInicio === '09:30');
  const slot1015 = disp.find((s) => s.horaInicio === '10:15');
  assert(slot0930.disponible === false, '09:30 ocupado por turno CONFIRMADO existente');
  assert(slot1015 && slot1015.disponible === false, '10:15 se pisa con turno PENDIENTE 10:30-11:00');
  const slot1100 = disp.find((s) => s.horaInicio === '11:00');
  assert(slot1100.disponible === true, '11:00 libre (no se pisa con nada)');

  const puedeDiego = await barberoPuedeTomarTurno(prisma, {
    barberoId: 1,
    fecha: '2026-09-17',
    horaInicio: '09:30',
    horaFin: '10:00'
  });
  assert(puedeDiego === false, 'Diego no puede tomar 09:30-10:00 (choca con turno existente)');

  const puedeFede = await barberoPuedeTomarTurno(prisma, {
    barberoId: 2,
    fecha: '2026-09-17',
    horaInicio: '09:30',
    horaFin: '10:00'
  });
  assert(puedeFede === true, 'Fede sí puede tomar 09:30-10:00 (no tiene turnos ese día)');

  const cualquiera = await encontrarBarberoDisponible(prisma, {
    fecha: '2026-09-17',
    horaInicio: '09:30',
    horaFin: '10:00'
  });
  assert(cualquiera === 2, 'encontrarBarberoDisponible elige a Fede (id 2) cuando Diego está ocupado');

  const dispCualquiera = await calcularDisponibilidadCualquiera(prisma, { fecha: '2026-09-17', servicioId: 1 });
  const slotCualquiera0930 = dispCualquiera.find((s) => s.horaInicio === '09:30');
  assert(slotCualquiera0930.disponible === true, '09:30 sigue disponible en modo "Cualquiera" porque Fede está libre');

  // Domingo cerrado (0)
  const dispDomingo = await calcularDisponibilidad(prisma, { barberoId: 1, fecha: '2026-09-20', servicioId: 1 });
  assert(Array.isArray(dispDomingo) && dispDomingo.length === 0, 'domingo (sin horario cargado) devuelve lista vacía');
}

run().then(() => console.log('Listo.'));
