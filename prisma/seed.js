// Datos iniciales para probar la app: barberos, servicios y horarios
// de atención de "Hernandez 1". Es idempotente: si ya hay barberos
// cargados, no vuelve a insertar nada (para no pisar turnos reales
// en cada reinicio del servidor).

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const BARBEROS = ['Diego Hernández', 'Fede', 'Male'];

const SERVICIOS = [
  { nombre: 'Corte', duracionMin: 30, precio: 8000 },
  { nombre: 'Barba', duracionMin: 20, precio: 5000 },
  { nombre: 'Corte + Barba', duracionMin: 45, precio: 12000 }
];

// Lunes a sábado, 09:00 a 19:00. Domingo (0) cerrado.
const DIAS_ATENCION = [1, 2, 3, 4, 5, 6];
const HORA_INICIO = '09:00';
const HORA_FIN = '19:00';

async function main() {
  const yaHayDatos = await prisma.barbero.count();
  if (yaHayDatos > 0) {
    console.log('Ya hay barberos cargados, se omite el seed.');
    return;
  }

  for (const nombre of BARBEROS) {
    const barbero = await prisma.barbero.create({ data: { nombre } });
    for (const diaSemana of DIAS_ATENCION) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.horario.create({
        data: { barberoId: barbero.id, diaSemana, horaInicio: HORA_INICIO, horaFin: HORA_FIN }
      });
    }
    console.log(`Barbero creado: ${nombre}`);
  }

  for (const servicio of SERVICIOS) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.servicio.create({ data: servicio });
    console.log(`Servicio creado: ${servicio.nombre}`);
  }

  console.log('Seed completado.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
