import express from 'express';
import productRoutes from './productRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import inventarioRoutes from './inventarioRoutes.js';
import ventaRoutes from './ventaRoutes.js';
import analisisRoutes from './analisisRoutes.js';
import authRoutes from './authRoutes.js';
import notificationRoutes from './notificationRoutes.js';

const router = express.Router();

router.use('/productos', productRoutes);
router.use('/categorias', categoryRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/venta', ventaRoutes);
router.use('/analisis', analisisRoutes);
router.use('/auth', authRoutes);
router.use('/notificaciones', notificationRoutes);

export default router;