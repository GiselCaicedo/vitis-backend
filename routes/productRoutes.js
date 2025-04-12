import express from 'express';
import * as productController from '../controllers/productController.js';

const router = express.Router();

// Rutas para los datos del dashboard
router.get('/dashboard', productController.getProductModuleData);

// Rutas para productos
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);
router.post('/', productController.createProduct);
router.put('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

// Rutas específicas para stock
router.get('/stock/details', productController.getStockDetails);
router.put('/:id/stock', productController.updateStock);

export default router;