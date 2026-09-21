const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const router = express.Router();

const loginSchema = z.object({
  usuario: z.string().trim().min(1, 'Usuario requerido'),
  clave: z.string().min(1, 'Clave requerida')
});

// Comparación de tiempo constante para no filtrar información por timing.
function compararSeguro(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// POST /api/auth/login { usuario, clave } -> { token }
// Login único para el panel del barbero (credenciales configuradas por
// variables de entorno ADMIN_USER / ADMIN_PASS en el servidor).
router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Usuario y clave requeridos' });
  }
  const { usuario, clave } = parsed.data;

  const usuarioEsperado = process.env.ADMIN_USER;
  const claveEsperada = process.env.ADMIN_PASS;

  if (!usuarioEsperado || !claveEsperada || !process.env.JWT_SECRET) {
    console.error('Faltan configurar ADMIN_USER / ADMIN_PASS / JWT_SECRET en el servidor');
    return res.status(500).json({ error: 'El servidor no tiene configurado el acceso de administrador' });
  }

  const usuarioOk = compararSeguro(usuario, usuarioEsperado);
  const claveOk = compararSeguro(clave, claveEsperada);

  if (!usuarioOk || !claveOk) {
    return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  }

  const token = jwt.sign({ sub: 'barbero-admin', usuario }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, expiraEn: '12h' });
});

module.exports = router;
