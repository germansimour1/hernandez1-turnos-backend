const express = require('express');
const prisma = require('../db');

const router = express.Router();

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

module.exports = router;
