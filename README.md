# Hernandez 1 — Backend de turnos

API REST para la barbería "Hernandez 1": el cliente pide turnos, quedan
`PENDIENTE` hasta que el barbero los aprueba o rechaza desde su panel.

## Stack

- Node.js + Express
- SQLite (vía Prisma ORM) — sin login por ahora (ver "Limitaciones" abajo)

## Instalación local

```bash
npm install
npx prisma db push   # crea prisma/dev.db con las tablas
npm run seed          # carga barberos, servicios y horarios de ejemplo
npm run dev            # http://localhost:3000
```

## Modelo de datos

- **Barbero**: id, nombre, activo.
- **Servicio**: id, nombre, duracionMin, precio.
- **Horario**: horario de atención de un barbero por día de semana
  (0=domingo … 6=sábado). Si no hay fila para un día, ese barbero no
  atiende ese día.
- **Turno**: clienteNombre, clienteTelefono, barberoId, servicioId,
  fecha (`YYYY-MM-DD`), horaInicio/horaFin (`HH:MM`), estado
  (`PENDIENTE` | `CONFIRMADO` | `RECHAZADO` | `CANCELADO`).

Los datos de ejemplo (`prisma/seed.js`) cargan 3 barberos (Diego
Hernández, Fede, Male), 3 servicios (Corte, Barba, Corte + Barba) y
horario de lunes a sábado de 09:00 a 19:00. El seed es idempotente: si
ya hay barberos cargados, no hace nada (para no pisar turnos reales).

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/barberos` | Lista de barberos activos |
| GET | `/api/servicios` | Lista de servicios activos |
| GET | `/api/turnos/disponibilidad?fecha=&servicioId=&barberoId=` | Franjas horarias disponibles. `barberoId` es opcional: si se omite, calcula disponibilidad combinada de todos los barberos (opción "Cualquiera") |
| POST | `/api/turnos` | El cliente solicita un turno → queda `PENDIENTE` |
| GET | `/api/turnos?barberoId=&fecha=&desde=&hasta=&estado=` | Lista de turnos (alimenta el calendario del barbero: día con `fecha`, semana/mes con `desde`/`hasta`) |
| GET | `/api/turnos/pendientes?barberoId=` | Bandeja de solicitudes pendientes |
| GET | `/api/turnos/:id` | Un turno puntual |
| PATCH | `/api/turnos/:id/aprobar` | El barbero confirma la solicitud |
| PATCH | `/api/turnos/:id/rechazar` | El barbero rechaza la solicitud |
| PATCH | `/api/turnos/:id/cancelar` | Cancela un turno pendiente o confirmado |

### Ejemplo: solicitar un turno

```bash
curl -X POST http://localhost:3000/api/turnos \
  -H "Content-Type: application/json" \
  -d '{
    "clienteNombre": "Martín Ruiz",
    "clienteTelefono": "1122334455",
    "servicioId": 1,
    "fecha": "2026-09-19",
    "horaInicio": "15:30"
  }'
```

Si no se manda `barberoId`, el backend asigna automáticamente el primer
barbero disponible en ese horario (equivale a la opción "Cualquiera"
del mockup). Si se manda `barberoId` y ese horario ya está ocupado,
responde `409`.

### Ejemplo: aprobar una solicitud

```bash
curl -X PATCH http://localhost:3000/api/turnos/1/aprobar
```

## Verificación de la lógica de horarios

`src/utils/horarios.js` no tiene dependencias externas, así que se
puede validar sola con un mock en memoria de la base:

```bash
node test/horarios.manual-test.js
```

Cubre: generación de franjas horarias, detección de superposición de
turnos, cálculo de disponibilidad por barbero y en modo "Cualquiera", y
el caso de un día sin horario cargado (cerrado).

## Desplegar en Render

1. Crear un repositorio en GitHub con este código y conectarlo a Render
   (Render necesita un repo Git — no se puede desplegar solo con estos
   archivos sueltos).
2. Nuevo Web Service → runtime **Node**.
   - Build command: `npm install && npx prisma generate && npx prisma db push`
   - Start command: `npm start` (corre el seed idempotente y levanta el servidor)
3. Variable de entorno `DATABASE_URL=file:./dev.db` (o la ruta que prefieras).

## Limitaciones a tener en cuenta

- **Sin login todavía**: cualquiera que tenga la URL del panel puede
  aprobar/rechazar turnos. Está bien para probar el flujo, pero antes
  de usarlo con clientes reales conviene agregar un login simple para
  el barbero.
- **SQLite en Render (plan free) no es 100% persistente**: los
  servicios web de Render en el plan gratuito no tienen disco
  persistente, así que el archivo `dev.db` puede reiniciarse en cada
  despliegue nuevo (por eso el `start` vuelve a correr el seed: para
  que la app nunca arranque con la base vacía). Los turnos cargados
  entre despliegues deberían sobrevivir mientras la instancia siga
  corriendo, pero no está garantizado. Si esto va a manejar turnos
  reales de clientes, conviene migrar a PostgreSQL (Render lo ofrece
  gratis) — el cambio es mínimo: solo hay que cambiar el `provider` en
  `prisma/schema.prisma` de `sqlite` a `postgresql` y `DATABASE_URL`.
