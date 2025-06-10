// controllers/dashboardController.js
import { pool } from '../config/db.js';

/**
 * Obtiene los datos principales para la página de inicio del dashboard
 * Ruta: GET /api/dashboard/home
 */
export const getHomeDashboardData = async (req, res) => {
  try {
    const { searchTerm, categoryFilter, stockFilter, fecha } = req.query;
    
    // Usar la fecha enviada desde el frontend o usar la fecha actual
    const targetDate = fecha ? new Date(fecha) : new Date();
    const formattedDate = targetDate.toISOString().split('T')[0];
    
    console.log(`Consultando datos del dashboard para fecha: ${formattedDate}`);
    
    // Objeto para almacenar los resultados
    const dashboardData = {
      summaryData: [],
      topProducts: [],
      recentAlerts: [],
      recentActivities: []
    };
    
    // Verificar si la conexión a la base de datos está disponible
    if (!pool) {
      console.error('Error: Pool de base de datos no disponible');
      res.status(500).json({ error: 'Error de conexión a la base de datos' });
      return;
    }
    
    // Consulta 1: Datos de resumen (ventas de hoy, nuevos clientes, productos activos, tasa de conversión)
    
    // Ventas del día específico
    const ventasQuery = `
      SELECT 
        SUM(Total_venta) as total_ventas_hoy,
        (SELECT SUM(Total_venta) FROM Ventas 
         WHERE Fecha_venta = (DATE '${formattedDate}' - INTERVAL '1 day') 
         AND Estado = 'Completada') as total_ventas_ayer
      FROM Ventas 
      WHERE Fecha_venta = DATE '${formattedDate}'
      AND Estado = 'Completada'
    `;
    
    // Nuevos clientes (usando cantidad de ventas a clientes nuevos como aproximación)
    const nuevosClientesQuery = `
      SELECT 
        COUNT(DISTINCT ID_usuario) as nuevos_clientes_hoy,
        (SELECT COUNT(DISTINCT ID_usuario) FROM Ventas 
         WHERE Fecha_venta = (DATE '${formattedDate}' - INTERVAL '1 day')) as nuevos_clientes_ayer
      FROM Ventas 
      WHERE Fecha_venta = DATE '${formattedDate}'
    `;
    
    // Productos activos
    const productosActivosQuery = `
      SELECT 
        COUNT(*) as productos_activos,
        (SELECT COUNT(*) FROM Productos 
         WHERE Activo = TRUE AND Fecha_creación < DATE '${formattedDate}') as productos_activos_ayer
      FROM Productos 
      WHERE Activo = TRUE
    `;
    
    // Tasa de conversión (usando una aproximación basada en ventas completadas vs pendientes)

    try {
      // Ejecutar todas las consultas de resumen en paralelo
      const [ventasHoyResult, nuevosClientesResult, productosActivosResult] = 
        await Promise.all([
          pool.query(ventasQuery),
          pool.query(nuevosClientesQuery),
          pool.query(productosActivosQuery),
        ]);
      
      // Formatear datos de resumen
      const ventasHoy = ventasHoyResult.rows[0] || { total_ventas_hoy: 0, total_ventas_ayer: 0 };
      const nuevosClientes = nuevosClientesResult.rows[0] || { nuevos_clientes_hoy: 0, nuevos_clientes_ayer: 0 };
      const productosActivos = productosActivosResult.rows[0] || { productos_activos: 0, productos_activos_ayer: 0 };
      
      // Calcular tendencias
      const ventasTrend = ventasHoy.total_ventas_ayer > 0 
        ? ((ventasHoy.total_ventas_hoy - ventasHoy.total_ventas_ayer) / ventasHoy.total_ventas_ayer * 100).toFixed(1) 
        : 0;
      
      const clientesTrend = nuevosClientes.nuevos_clientes_ayer > 0 
        ? (nuevosClientes.nuevos_clientes_hoy - nuevosClientes.nuevos_clientes_ayer) 
        : 0;
      
      const productosTrend = productosActivos.productos_activos_ayer > 0 
        ? (productosActivos.productos_activos - productosActivos.productos_activos_ayer) 
        : 0;
      
 
      // Añadir datos de resumen al objeto de respuesta
      dashboardData.summaryData = [
        { 
          title: 'Ventas de hoy', 
          value: `$${parseInt(ventasHoy.total_ventas_hoy || 0).toLocaleString()}`, 
          trend: `${ventasTrend > 0 ? '+' : ''}${ventasTrend}%`,
          icon: 'dollar',
          color: 'bg-blue-500' 
        },
        { 
          title: 'Nuevas ventas', 
          value: nuevosClientes.nuevos_clientes_hoy || 0, 
          trend: `${clientesTrend > 0 ? '+' : ''}${clientesTrend}`,
          icon: 'user',
          color: 'bg-green-500' 
        },
        { 
          title: 'Productos activos', 
          value: productosActivos.productos_activos || 0, 
          trend: `${productosTrend > 0 ? '+' : ''}${productosTrend}`,
          icon: 'package',
          color: 'bg-purple-500' 
        },
       
      ];
    } catch (error) {
      console.error('Error al obtener datos de resumen:', error);
      res.status(500).json({ error: 'Error al consultar datos de resumen' });
      return;
    }

    // Consulta 2: Productos más vendidos
    try {
      let topProductsQuery = `
        SELECT 
          p.ID_producto as id_producto,
          p.Nombre as nombre,
          c.Nombre_categoria as categoria,
          COALESCE(v.total_vendido, 0) as total_vendido,
          p.Stock_actual as stock_actual,
          p.Stock_minimo as stock_minimo,
          p.Precio as precio
        FROM 
          Productos p
        LEFT JOIN 
          Categorias c ON p.ID_categoria = c.ID_categoria
        LEFT JOIN (
          SELECT 
            d.ID_producto,
            SUM(d.Cantidad) as total_vendido
          FROM 
            Detalles_venta d
          JOIN 
            Ventas v ON d.ID_venta = v.ID_venta
          WHERE 
            v.Estado = 'Completada'
            AND v.Fecha_venta <= DATE '${formattedDate}'
            AND v.Fecha_venta >= (DATE '${formattedDate}' - INTERVAL '30 day')
          GROUP BY 
            d.ID_producto
        ) v ON p.ID_producto = v.ID_producto
        WHERE 
          p.Activo = TRUE
      `;
      
      // Aplicar filtros si existen
      const topProductsParams = [];
      if (searchTerm) {
        topProductsQuery += ` AND p.Nombre ILIKE $1`;
        topProductsParams.push(`%${searchTerm}%`);
      }
      
      if (categoryFilter) {
        topProductsQuery += ` AND c.Nombre_categoria = $${topProductsParams.length + 1}`;
        topProductsParams.push(categoryFilter);
      }
      
      if (stockFilter === 'bajo') {
        topProductsQuery += ` AND p.Stock_actual <= p.Stock_minimo`;
      } else if (stockFilter === 'normal') {
        topProductsQuery += ` AND p.Stock_actual > p.Stock_minimo`;
      }
      
      topProductsQuery += ` ORDER BY total_vendido DESC LIMIT 5`;
      
      const topProductsResult = await pool.query(topProductsQuery, topProductsParams);
      dashboardData.topProducts = topProductsResult.rows;
    } catch (error) {
      console.error('Error al obtener productos más vendidos:', error);
      res.status(500).json({ error: 'Error al consultar productos más vendidos' });
      return;
    }
    
    // Consulta 3: Alertas recientes
    try {
      const recentAlertsQuery = `
        SELECT 
          a.ID_alerta as id_alerta,
          p.Nombre as producto,
          a.Fecha_alerta as fecha_alerta,
          a.Prioridad_alerta as prioridad_alerta,
          a.Mensaje as mensaje
        FROM 
          Alertas_stock a
        JOIN 
          Productos p ON a.ID_producto = p.ID_producto
        WHERE 
          a.Estado = 'Pendiente'
          AND a.Fecha_alerta <= DATE '${formattedDate}' + INTERVAL '1 day'
        ORDER BY 
          CASE 
            WHEN a.Prioridad_alerta = 'Alta' THEN 1
            WHEN a.Prioridad_alerta = 'Media' THEN 2
            WHEN a.Prioridad_alerta = 'Baja' THEN 3
          END,
          a.Fecha_alerta DESC
        LIMIT 4
      `;
      
      const recentAlertsResult = await pool.query(recentAlertsQuery);
      dashboardData.recentAlerts = recentAlertsResult.rows;
    } catch (error) {
      console.error('Error al obtener alertas recientes:', error);
      res.status(500).json({ error: 'Error al consultar alertas recientes' });
      return;
    }
    
    // Consulta 4: Actividades recientes (historial de actualizaciones)
    try {
      const recentActivitiesQuery = `
        SELECT 
          h.ID_actualizacion as id_actualizacion,
          u.Nombre_usuario as nombre_usuario,
          p.Nombre as nombre_producto,
          h.Cambio_realizado as cambio_realizado,
          h.Valor_anterior as valor_anterior,
          h.Valor_nuevo as valor_nuevo,
          h.Tipo_cambio as tipo_cambio,
          h.Fecha_actualización as fecha_actualizacion
        FROM 
          Historial_actualizaciones h
        JOIN 
          Usuarios u ON h.ID_usuario = u.ID_usuario
        JOIN 
          Productos p ON h.ID_producto = p.ID_producto
        WHERE
          h.Fecha_actualización <= DATE '${formattedDate}' + INTERVAL '1 day'
        ORDER BY 
          h.Fecha_actualización DESC
        LIMIT 5
      `;
      
      const recentActivitiesResult = await pool.query(recentActivitiesQuery);
      dashboardData.recentActivities = recentActivitiesResult.rows;
    } catch (error) {
      console.error('Error al obtener actividades recientes:', error);
      res.status(500).json({ error: 'Error al consultar actividades recientes' });
      return;
    }
    
    // Enviar respuesta con todos los datos
    res.status(200).json(dashboardData);
    
  } catch (error) {
    console.error('Error al obtener datos del dashboard principal:', error);
    res.status(500).json({ error: 'Error al obtener datos del dashboard principal' });
  }
};
