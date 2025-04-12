import express from 'express';
import * as categoryController from '../controllers/categoryController.js';

const router = express.Router();

// Rutas para categorías
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategoryById);
router.post('/', categoryController.createCategory);
router.put('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

// Obtener productos por categoría
router.get('/:id/productos', categoryController.getProductsByCategory);

export default router;