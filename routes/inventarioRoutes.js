import express from 'express';
import * as inventarioController from '../controllers/inventarioController.js';

const router = express.Router();

// Ruta para el dashboard de inventario
router.get('/', inventarioController.dashboardInventario);

// Rutas para productos
router.get('/productos', inventarioController.getProductos);
router.post('/productos', inventarioController.addProducto);
router.get('/productos/:id', inventarioController.getProductoById);
router.put('/productos/:id', inventarioController.updateProducto);
router.delete('/productos/:id', inventarioController.deleteProducto);

// Rutas para movimientos de inventario
router.get('/movimientos', inventarioController.getMovimientos);
router.post('/movimientos', inventarioController.registrarMovimiento);

// Rutas para alertas de stock
router.get('/alertas', inventarioController.getAlertasStock);
router.put('/alertas/:id/resolver', inventarioController.resolverAlerta);

export default router;