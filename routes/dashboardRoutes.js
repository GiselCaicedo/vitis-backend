import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

// Rutas para categorías
router.get('/', dashboardController.getHomeDashboardData);

export default router;