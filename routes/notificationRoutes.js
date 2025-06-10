import express from 'express';
import * as notificationController from '../controllers/notificationController.js';

const router = express.Router();

// Rutas para obtener notificaciones
router.get('/', notificationController.getAllNotifications);
router.get('/pending', notificationController.getPendingNotifications);
router.get('/summary', notificationController.getNotificationsSummary);
router.get('/latest', notificationController.getLatestNotifications);

// Rutas para actualizar notificaciones
router.put('/:id/resolve', notificationController.resolveNotification);
router.put('/:id/ignore', notificationController.ignoreNotification);
router.put('/product/:id/resolve', notificationController.resolveProductNotifications);

router.post('/send-alert', notificationController.sendEmailAlert);

export default router;
