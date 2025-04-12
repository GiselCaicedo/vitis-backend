import express from 'express';
import * as authController from '../controllers/authController.js';

const router = express.Router();

// Ruta para inicio de sesión
router.post('/login', authController.login);
router.post('/generate-hash', authController.generatePasswordHash);

export default router;