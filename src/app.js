const express = require('express');
const cors = require('cors');

const barberosRouter = require('./routes/barberos');
const serviciosRouter = require('./routes/servicios');
const turnosRouter = require('./routes/turnos');
const authRouter = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ nombre: 'Hernandez 1', servicio: 'API de turnos', estado: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/barberos', barberosRouter);
app.use('/api/servicios', serviciosRouter);
app.use('/api/turnos', turnosRouter);
app.use('/api/auth', authRouter);

// 404 para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejador de errores centralizado
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
