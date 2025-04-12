import { pool } from '../config/db.js';

// Obtener todas las notificaciones de alertas de stock
export const getAllNotifications = async (req, res) => {
  try {
    const query = `
      SELECT 
        a.ID_alerta AS id,
        p.Nombre AS producto,
        p.ID_producto AS id_producto,
        p.Codigo_barras AS codigo,
        TO_CHAR(a.Fecha_alerta, 'YYYY-MM-DD HH24:MI:SS') AS fecha,
        a.Estado AS estado,
        a.Prioridad_alerta AS prioridad,
        p.Stock_actual AS stock_actual,
        p.Stock_minimo AS stock_minimo,
        a.Mensaje AS mensaje,
        c.Nombre_categoria AS categoria,
        c.ID_categoria AS id_categoria
      FROM 
        Alertas_stock a
      JOIN 
        Productos p ON a.ID_producto = p.ID_producto
      LEFT JOIN 
        Categorias c ON p.ID_categoria = c.ID_categoria
      ORDER BY 
        CASE 
          WHEN a.Estado = 'Pendiente' THEN 1
          WHEN a.Estado = 'Resuelto' THEN 2
          ELSE 3
        END,
        CASE 
          WHEN a.Prioridad_alerta = 'Alta' THEN 1
          WHEN a.Prioridad_alerta = 'Media' THEN 2
          WHEN a.Prioridad_alerta = 'Baja' THEN 3
          ELSE 4
        END,
        a.Fecha_alerta DESC
    `;

    const result = await pool.query(query);

    // Transformar datos al formato del frontend
    const notifications = result.rows.map(notification => ({
      id: notification.id,
      type: getNotificationType(notification.prioridad),
      category: `Alerta de Stock - ${notification.categoria}`,
      message: notification.mensaje,
      time: notification.fecha,
      read: notification.estado !== 'Pendiente',
      product: notification.producto,
      stockActual: notification.stock_actual,
      stockMinimo: notification.stock_minimo,
      prioridad: notification.prioridad,
      estado: notification.estado,
      action: {
        text: 'Ver producto',
        url: `/productos/${notification.id_producto}`
      }
    }));

    return res.status(200).json(notifications);

  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    return res.status(500).json({
      error: 'Error al obtener notificaciones',
      message: error.message
    });
  }
};

// Obtener notificaciones pendientes
export const getPendingNotifications = async (req, res) => {
  try {
    const query = `
      SELECT 
        a.ID_alerta AS id,
        p.Nombre AS producto,
        p.ID_producto AS id_producto,
        TO_CHAR(a.Fecha_alerta, 'YYYY-MM-DD HH24:MI:SS') AS fecha,
        a.Estado AS estado,
        a.Prioridad_alerta AS prioridad,
        p.Stock_actual AS stock_actual,
        p.Stock_minimo AS stock_minimo,
        a.Mensaje AS mensaje,
        c.Nombre_categoria AS categoria
      FROM 
        Alertas_stock a
      JOIN 
        Productos p ON a.ID_producto = p.ID_producto
      LEFT JOIN 
        Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE 
        a.Estado = 'Pendiente'
      ORDER BY 
        CASE 
          WHEN a.Prioridad_alerta = 'Alta' THEN 1
          WHEN a.Prioridad_alerta = 'Media' THEN 2
          ELSE 3
        END,
        a.Fecha_alerta DESC
    `;

    const result = await pool.query(query);

    // Transformar datos al formato del frontend
    const notifications = result.rows.map(notification => ({
      id: notification.id,
      type: getNotificationType(notification.prioridad),
      category: `Alerta de Stock - ${notification.categoria}`,
      message: notification.mensaje,
      time: notification.fecha,
      read: false,
      product: notification.producto,
      stockActual: notification.stock_actual,
      stockMinimo: notification.stock_minimo,
      prioridad: notification.prioridad,
      action: {
        text: 'Ver producto',
        url: `/productos/${notification.id_producto}`
      }
    }));

    return res.status(200).json(notifications);

  } catch (error) {
    console.error('Error al obtener notificaciones pendientes:', error);
    return res.status(500).json({
      error: 'Error al obtener notificaciones pendientes',
      message: error.message
    });
  }
};

// Obtener resumen de alertas para el dashboard
export const getNotificationsSummary = async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE a.Estado = 'Pendiente') AS total_pendientes,
        COUNT(*) FILTER (WHERE a.Estado = 'Pendiente' AND a.Prioridad_alerta = 'Alta') AS alta_prioridad,
        COUNT(*) FILTER (WHERE a.Estado = 'Pendiente' AND a.Prioridad_alerta = 'Media') AS media_prioridad,
        COUNT(*) FILTER (WHERE a.Estado = 'Pendiente' AND a.Prioridad_alerta = 'Baja') AS baja_prioridad,
        COUNT(*) FILTER (WHERE a.Estado = 'Resuelto') AS resueltas,
        COUNT(*) FILTER (WHERE a.Estado = 'Ignorado') AS ignoradas,
        COUNT(*) AS total
      FROM 
        Alertas_stock a
    `;

    const result = await pool.query(query);

    return res.status(200).json(result.rows[0]);

  } catch (error) {
    console.error('Error al obtener resumen de notificaciones:', error);
    return res.status(500).json({
      error: 'Error al obtener resumen de notificaciones',
      message: error.message
    });
  }
};

// Obtener últimas alertas para el dashboard
export const getLatestNotifications = async (req, res) => {
  try {
    const limit = req.query.limit || 5;
    
    const query = `
      SELECT 
        a.ID_alerta AS id,
        p.Nombre AS producto,
        p.ID_producto AS id_producto,
        TO_CHAR(a.Fecha_alerta, 'YYYY-MM-DD HH24:MI:SS') AS fecha,
        a.Estado AS estado,
        a.Prioridad_alerta AS prioridad,
        p.Stock_actual AS stock_actual,
        p.Stock_minimo AS stock_minimo,
        a.Mensaje AS mensaje,
        CASE 
          WHEN a.Prioridad_alerta = 'Alta' THEN 'bg-red-100 text-red-800'
          WHEN a.Prioridad_alerta = 'Media' THEN 'bg-amber-100 text-amber-800'
          WHEN a.Prioridad_alerta = 'Baja' THEN 'bg-blue-100 text-blue-800'
          ELSE 'bg-gray-100 text-gray-800'
        END AS color_clase
      FROM 
        Alertas_stock a
      JOIN 
        Productos p ON a.ID_producto = p.ID_producto
      WHERE 
        a.Estado = 'Pendiente'
      ORDER BY 
        CASE 
          WHEN a.Prioridad_alerta = 'Alta' THEN 1
          WHEN a.Prioridad_alerta = 'Media' THEN 2
          ELSE 3
        END,
        a.Fecha_alerta DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);

    return res.status(200).json(result.rows);

  } catch (error) {
    console.error('Error al obtener últimas notificaciones:', error);
    return res.status(500).json({
      error: 'Error al obtener últimas notificaciones',
      message: error.message
    });
  }
};

// Marcar notificación como resuelta
export const resolveNotification = async (req, res) => {
  try {
    const { id } = req.params;

    // Utilizamos el procedimiento almacenado existente
    await pool.query('CALL sp_resolver_alerta($1)', [id]);

    return res.status(200).json({
      message: 'Notificación marcada como resuelta'
    });

  } catch (error) {
    console.error('Error al resolver notificación:', error);
    return res.status(500).json({
      error: 'Error al resolver notificación',
      message: error.message
    });
  }
};

// Marcar notificación como ignorada
export const ignoreNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE Alertas_stock
      SET Estado = 'Ignorado',
          Fecha_resolucion = CURRENT_TIMESTAMP
      WHERE ID_alerta = $1
      RETURNING ID_alerta AS id
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    return res.status(200).json({
      message: 'Notificación marcada como ignorada'
    });

  } catch (error) {
    console.error('Error al ignorar notificación:', error);
    return res.status(500).json({
      error: 'Error al ignorar notificación',
      message: error.message
    });
  }
};

// Resolver todas las notificaciones de un producto
export const resolveProductNotifications = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE Alertas_stock
      SET Estado = 'Resuelto',
          Fecha_resolucion = CURRENT_TIMESTAMP
      WHERE ID_producto = $1 AND Estado = 'Pendiente'
      RETURNING ID_alerta AS id
    `;

    const result = await pool.query(query, [id]);

    return res.status(200).json({
      message: `${result.rowCount} notificaciones resueltas para el producto`,
      count: result.rowCount
    });

  } catch (error) {
    console.error('Error al resolver notificaciones de producto:', error);
    return res.status(500).json({
      error: 'Error al resolver notificaciones de producto',
      message: error.message
    });
  }
};

// Función auxiliar para mapear prioridad a tipo de notificación
function getNotificationType(prioridad) {
  switch (prioridad) {
    case 'Alta':
      return 'alert';
    case 'Media':
      return 'inventory';
    case 'Baja':
      return 'product';
    default:
      return 'info';
  }
}