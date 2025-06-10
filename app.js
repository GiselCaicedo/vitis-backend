import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cron from 'node-cron';
import routes from './routes/index.js';
import { sendStockAlert } from './services/mailController.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rutas de la API
app.use('/api', routes);

// Ruta base
app.get('/', (req, res) => {
  res.json({ message: 'API de Comercializadora Vitis Store SAS' });
});

// **CONFIGURACIÓN DE ALERTAS AUTOMÁTICAS**
// Ejecutar todos los días a las 8:00 AM
cron.schedule('0 8 * * *', async () => {
  console.log('🕒 Ejecutando tarea programada: Alerta de stock diaria');
  try {
    await sendStockAlert();
    console.log('✅ Alerta de stock enviada correctamente');
  } catch (error) {
    console.error('❌ Error en tarea programada de alertas:', error);
  }
}, {
  timezone: "America/Bogota"
});

// Opcional: También ejecutar al medio día (12:00 PM) si hay productos críticos
cron.schedule('0 12 * * *', async () => {
  console.log('🕒 Ejecutando verificación de stock del mediodía');
  try {
    await sendStockAlert();
    console.log('✅ Verificación de mediodía completada');
  } catch (error) {
    console.error('❌ Error en verificación de mediodía:', error);
  }
}, {
  timezone: "America/Bogota"
});

// Log de inicio de tareas programadas
console.log('📅 Tareas programadas configuradas:');
console.log('   - Alerta diaria: 8:00 AM (Bogotá)');
console.log('   - Verificación: 12:00 PM (Bogotá)');

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'production' ? 'Ocurrió un error inesperado' : err.message
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🌍 Zona horaria: America/Bogota`);
});

export default app;