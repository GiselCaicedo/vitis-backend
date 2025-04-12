import express from 'express';
import * as ventaController from '../controllers/ventaController.js';

const router = express.Router();

// Rutas para operaciones de ventas
router.get('/', ventaController.getVentas);
router.get('/stats', ventaController.getVentasStats);
router.get('/clientes', ventaController.getClientes);
router.get('/productos', ventaController.getProductosParaVenta);
router.get('/historial', ventaController.getHistorialVentas);
router.get('/dashboard', ventaController.getDashboardVentas);
router.get('/:id', ventaController.getVentaDetalle);
router.post('/', ventaController.createVenta);
router.patch('/:id/estado', ventaController.updateVentaEstado);

export default router;