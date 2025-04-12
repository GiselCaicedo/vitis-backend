import express from 'express';
import * as analisisController from '../controllers/analisisController.js';

const router = express.Router();

// Ruta principal para obtener datos del dashboard de análisis
router.get('/', analisisController.getMainInfo);

// Ruta para obtener estadísticas de ventas específicas (diarias, semanales, mensuales)
router.get('/stats/ventas', analisisController.getSalesStats);

// Ruta para obtener análisis de productos
router.get('/productos', analisisController.getProductsAnalysis);

// Ruta para buscar en el historial de ventas
router.get('/historial', analisisController.searchSalesHistory);

// Ruta para exportar datos
router.get('/exportar', analisisController.exportSalesData);

export default router;