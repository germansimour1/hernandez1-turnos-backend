const express = require('express');
const prisma = require('../db');

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

module.exports = router;
