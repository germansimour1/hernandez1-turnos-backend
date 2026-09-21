const jwt = require('jsonwebtoken');

// Protege las rutas del panel del barbero: exige un token válido
// (obtenido en POST /api/auth/login) en el header Authorization: Bearer <token>.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Falta configurar JWT_SECRET en el servidor');
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

module.exports = { requireAuth };
