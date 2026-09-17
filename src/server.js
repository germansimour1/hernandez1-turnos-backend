require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Hernandez 1 - API de turnos escuchando en el puerto ${PORT}`);
});
