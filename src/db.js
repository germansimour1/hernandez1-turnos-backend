const { PrismaClient } = require('@prisma/client');

// Instancia única de Prisma para toda la app (evita abrir múltiples
// conexiones en desarrollo con recarga en caliente).
const prisma = new PrismaClient();

module.exports = prisma;
