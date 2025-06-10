import { pool } from '../config/db.js';

// Obtener todas las ventas con filtros opcionales
export const getVentas = async (req, res) => {
  try {
    const { 
      searchTerm, 
      estado, 
      fechaInicio, 
      fechaFin, 
      cliente,
      page = 1, 
      limit = 10 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT v.ID_venta, 
             v.Fecha_venta, 
             v.Fecha_hora_venta,
             v.Total_venta, 
             v.Estado, 
             v.Metodo_pago, 
             v.Notas,
             u.Nombre_usuario,
             (SELECT COUNT(*) FROM Detalles_venta WHERE ID_venta = v.ID_venta) as items
      FROM Ventas v
      JOIN Usuarios u ON v.ID_usuario = u.ID_usuario
      WHERE 1=1
    `;
    
    const queryParams = [];
    
    if (searchTerm) {
      query += ` AND (v.ID_venta::text LIKE $${queryParams.length + 1} OR u.Nombre_usuario LIKE $${queryParams.length + 1})`;
      queryParams.push(`%${searchTerm}%`);
    }
    
    if (estado && estado !== 'Todos') {
      query += ` AND v.Estado = $${queryParams.length + 1}`;
      queryParams.push(estado);
    }
    
    if (fechaInicio) {
      query += ` AND v.Fecha_venta >= $${queryParams.length + 1}`;
      queryParams.push(fechaInicio);
    }
    
    if (fechaFin) {
      query += ` AND v.Fecha_venta <= $${queryParams.length + 1}`;
      queryParams.push(fechaFin);
    }
    
    if (cliente) {
      query += ` AND u.Nombre_usuario LIKE $${queryParams.length + 1}`;
      queryParams.push(`%${cliente}%`);
    }
    
    // Consulta para el total de registros
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS total`;
    const totalResult = await pool.query(countQuery, queryParams);
    const total = parseInt(totalResult.rows[0].count);
    
    // Añadir ordenamiento y paginación
    query += ` ORDER BY v.Fecha_venta DESC, v.ID_venta DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit);
    queryParams.push(offset);
    
    const result = await pool.query(query, queryParams);
    
    // Formatear respuesta para el frontend
    const ventas = result.rows.map(row => ({
      id: `VT-${row.id_venta.toString().padStart(3, '0')}`,
      date: new Date(row.fecha_venta).toLocaleDateString('es-ES'),
      customer: row.nombre_usuario,
      total: parseFloat(row.total_venta),
      items: parseInt(row.items),
      status: row.estado.toLowerCase(),
      paymentMethod: row.metodo_pago,
      notes: row.notas
    }));
    
    res.status(200).json({
      ventas,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({ message: 'Error al obtener ventas', error: error.message });
  }
};

// Obtener detalle de una venta específica
export const getVentaDetalle = async (req, res) => {
  try {
    const { id } = req.params;
    const ventaId = id.startsWith('VT-') ? parseInt(id.substring(3)) : parseInt(id);
    
    // Obtener información de la venta
    const ventaQuery = `
      SELECT v.ID_venta, 
             v.Fecha_venta, 
             v.Fecha_hora_venta,
             v.Total_venta, 
             v.Estado, 
             v.Metodo_pago, 
             v.Notas,
             u.Nombre_usuario,
             u.Correo
      FROM Ventas v
      JOIN Usuarios u ON v.ID_usuario = u.ID_usuario
      WHERE v.ID_venta = $1
    `;
    
    const ventaResult = await pool.query(ventaQuery, [ventaId]);
    
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }
    
    const venta = ventaResult.rows[0];
    
    // Obtener detalles de la venta (productos)
    const detallesQuery = `
      SELECT dv.ID_detalle,
             dv.Cantidad,
             dv.Precio_unitario,
             dv.Subtotal,
             dv.Descuento,
             p.ID_producto,
             p.Nombre,
             p.Descripción
      FROM Detalles_venta dv
      JOIN Productos p ON dv.ID_producto = p.ID_producto
      WHERE dv.ID_venta = $1
      ORDER BY dv.Número_detalle
    `;
    
    const detallesResult = await pool.query(detallesQuery, [ventaId]);
    
    // Formatear respuesta para el frontend
    const ventaDetallada = {
      id: `VT-${venta.id_venta.toString().padStart(3, '0')}`,
      date: new Date(venta.fecha_venta).toLocaleDateString('es-ES'),
      customer: venta.nombre_usuario,
      email: venta.correo,
      phone: '+34 612 345 678', // Placeholder, agregaría campo a la BD
      address: 'Calle Principal 123, Madrid', // Placeholder, agregaría campo a la BD
      total: parseFloat(venta.total_venta),
      subtotal: parseFloat(venta.total_venta) * 0.84, // Ejemplo: impuesto del 16%
      tax: parseFloat(venta.total_venta) * 0.16,
      items: detallesResult.rows.length,
      status: venta.estado.toLowerCase(),
      paymentMethod: venta.metodo_pago,
      notes: venta.notas,
      products: detallesResult.rows.map(item => ({
        name: item.nombre,
        price: parseFloat(item.precio_unitario),
        quantity: parseInt(item.cantidad),
        total: parseFloat(item.subtotal)
      }))
    };
    
    res.status(200).json(ventaDetallada);
  } catch (error) {
    console.error('Error al obtener detalle de venta:', error);
    res.status(500).json({ message: 'Error al obtener detalle de venta', error: error.message });
  }
};

export const createVenta = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { 
      usuarioId, 
      cliente, 
      productos, 
      metodoPago = 'Tarjeta de crédito',
      notas = ''
    } = req.body;
    
    if (!productos || productos.length === 0) {
      return res.status(400).json({ message: 'La venta debe contener al menos un producto' });
    }
    
    // Calcular el total de la venta
    let totalVenta = 0;
    for (const producto of productos) {
      totalVenta += producto.precio * producto.cantidad;
    }
    
    // Insertar la venta
    const insertVentaQuery = `
      INSERT INTO Ventas(
        Fecha_venta, 
        Fecha_hora_venta, 
        Total_venta, 
        ID_usuario, 
        Estado, 
        Metodo_pago, 
        Notas
      )
      VALUES(CURRENT_DATE, CURRENT_TIMESTAMP, $1, $2, 'Completada', $3, $4)
      RETURNING ID_venta
    `;
    
    const ventaResult = await client.query(insertVentaQuery, [
      totalVenta,
      usuarioId,
      metodoPago,
      notas
    ]);
    
    const ventaId = ventaResult.rows[0].id_venta;
    
    // Insertar los detalles de la venta
    for (let i = 0; i < productos.length; i++) {
      const producto = productos[i];
      
      // Verificar stock disponible
      const stockQuery = 'SELECT Stock_actual FROM Productos WHERE ID_producto = $1';
      const stockResult = await client.query(stockQuery, [producto.productoId]);
      
      if (stockResult.rows.length === 0) {
        throw new Error(`Producto con ID ${producto.productoId} no encontrado`);
      }
      
      const stockActual = stockResult.rows[0].stock_actual;
      
      if (stockActual < producto.cantidad) {
        throw new Error(`Stock insuficiente para el producto ID ${producto.productoId}. Disponible: ${stockActual}`);
      }
      
      const insertDetalleQuery = `
        INSERT INTO Detalles_venta(
          ID_venta, 
          ID_producto, 
          Cantidad, 
          Precio_unitario, 
          Subtotal, 
          Número_detalle,
          Descuento
        )
        VALUES($1, $2, $3, $4, $5, $6, $7)
      `;
      
      const subtotal = producto.precio * producto.cantidad - (producto.descuento || 0);
      
      await client.query(insertDetalleQuery, [
        ventaId,
        producto.productoId,
        producto.cantidad,
        producto.precio,
        subtotal,
        i + 1,
        producto.descuento || 0
      ]);
      
      // ? SOLUCIÓN: Solo actualizar el stock, el trigger se encarga del movimiento
      const updateStockQuery = `
        UPDATE Productos
        SET Stock_actual = Stock_actual - $1,
            Ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE ID_producto = $2
      `;
      
      await client.query(updateStockQuery, [producto.cantidad, producto.productoId]);
      
      // ? COMENTAR O ELIMINAR ESTA PARTE - El trigger ya lo hace
      /*
      const insertMovimientoQuery = `
        INSERT INTO Movimientos_inventario(
          Tipo_movimiento,
          Cantidad,
          ID_usuario,
          ID_producto,
          Observaciones,
          ID_venta
        )
        VALUES('Salida', $1, $2, $3, $4, $5)
      `;
      
      await client.query(insertMovimientoQuery, [
        producto.cantidad,
        usuarioId,
        producto.productoId,
        `Venta ID: ${ventaId}`,
        ventaId
      ]);
      */
      
      console.log(`? Producto procesado: ID ${producto.productoId}, Cantidad: ${producto.cantidad}`);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      message: 'Venta creada con éxito', 
      ventaId: `VT-${ventaId.toString().padStart(3, '0')}`,
      total: totalVenta 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear venta:', error);
    res.status(500).json({ message: 'Error al crear venta', error: error.message });
  } finally {
    client.release();
  }
};

// Actualizar estado de una venta
export const updateVentaEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    const ventaId = id.startsWith('VT-') ? parseInt(id.substring(3)) : parseInt(id);
    
    const validEstados = ['Completada', 'Pendiente', 'Cancelada'];
    if (!validEstados.includes(estado)) {
      return res.status(400).json({ message: 'Estado no válido' });
    }
    
    // Si se cancela una venta, podríamos querer restaurar el stock
    if (estado === 'Cancelada') {
      // Obtener los productos y cantidades de la venta
      const detallesQuery = `
        SELECT ID_producto, Cantidad FROM Detalles_venta WHERE ID_venta = $1
      `;
      
      const detallesResult = await pool.query(detallesQuery, [ventaId]);
      
      // Restaurar el stock de cada producto
      for (const detalle of detallesResult.rows) {
        const updateStockQuery = `
          UPDATE Productos
          SET Stock_actual = Stock_actual + $1
          WHERE ID_producto = $2
        `;
        
        await pool.query(updateStockQuery, [detalle.cantidad, detalle.id_producto]);
      }
    }
    
    // Actualizar el estado de la venta
    const updateQuery = `
      UPDATE Ventas
      SET Estado = $1
      WHERE ID_venta = $2
      RETURNING *
    `;
    
    const result = await pool.query(updateQuery, [estado, ventaId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }
    
    res.status(200).json({ 
      message: `Venta actualizada a estado: ${estado}`,
      venta: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar estado de venta:', error);
    res.status(500).json({ message: 'Error al actualizar estado de venta', error: error.message });
  }
};

// Obtener estadísticas de ventas
export const getVentasStats = async (req, res) => {
  try {
    const { periodo = 'mes' } = req.query;
    
    let intervalo;
    switch (periodo) {
      case 'semana':
        intervalo = "INTERVAL '7 days'";
        break;
      case 'mes':
        intervalo = "INTERVAL '30 days'";
        break;
      case 'año':
        intervalo = "INTERVAL '365 days'";
        break;
      default:
        intervalo = "INTERVAL '30 days'";
    }
    
    // Total de ventas en el período
    const totalQuery = `
      SELECT COUNT(*) as total_ventas, 
             SUM(Total_venta) as suma_total
      FROM Ventas
      WHERE Fecha_venta >= CURRENT_DATE - ${intervalo}
    `;
    
    // Número de transacciones por estado
    const estadosQuery = `
      SELECT Estado, COUNT(*) as cantidad
      FROM Ventas
      WHERE Fecha_venta >= CURRENT_DATE - ${intervalo}
      GROUP BY Estado
    `;
    
    // Promedio de venta
    const promedioQuery = `
      SELECT AVG(Total_venta) as promedio
      FROM Ventas
      WHERE Fecha_venta >= CURRENT_DATE - ${intervalo}
            AND Estado != 'Cancelada'
    `;
    
    const [totalResult, estadosResult, promedioResult] = await Promise.all([
      pool.query(totalQuery),
      pool.query(estadosQuery),
      pool.query(promedioQuery)
    ]);
    
    const stats = {
      totalVentas: parseFloat(totalResult.rows[0].suma_total || 0),
      numeroTransacciones: parseInt(totalResult.rows[0].total_ventas || 0),
      promedioPorVenta: parseFloat(promedioResult.rows[0].promedio || 0),
      estadosVentas: estadosResult.rows.reduce((acc, item) => {
        acc[item.estado.toLowerCase()] = parseInt(item.cantidad);
        return acc;
      }, {})
    };
    
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas de ventas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas de ventas', error: error.message });
  }
};

// Obtener clientes frecuentes (para el selector de clientes)
export const getClientes = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT Nombre_usuario, Correo, ID_usuario
      FROM Usuarios
      WHERE Rol = 'Admin'
    `;
    
    const result = await pool.query(query);
    
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ message: 'Error al obtener clientes', error: error.message });
  }
};

// Obtener productos para ventas
export const getProductosParaVenta = async (req, res) => {
  try {
    const { searchTerm } = req.query;
    
    let query = `
      SELECT p.ID_producto, 
             p.Nombre, 
             p.Descripción,
             p.Precio,
             p.Stock_actual,
             c.Nombre_categoria
      FROM Productos p
      LEFT JOIN Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE p.Activo = true AND p.Stock_actual > 0
    `;
    
    const queryParams = [];
    
    if (searchTerm) {
      query += ` AND (p.Nombre ILIKE $1 OR p.Descripción ILIKE $1)`;
      queryParams.push(`%${searchTerm}%`);
    }
    
    query += ` ORDER BY p.Nombre LIMIT 50`;
    
    const result = await pool.query(query, queryParams);
    
    // Formatear para el frontend
    const productos = result.rows.map(row => ({
      id: row.id_producto,
      nombre: row.nombre,
      descripcion: row.descripción,
      precio: parseFloat(row.precio),
      stock: row.stock_actual,
      categoria: row.nombre_categoria
    }));
    
    res.status(200).json(productos);
  } catch (error) {
    console.error('Error al obtener productos para venta:', error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
};

// Controlador para obtener los datos del dashboard de ventas
export const getDashboardVentas = async (req, res) => {
  try {
    const { 
      searchTerm, 
      categoryFilter, 
      stockFilter, 
      fecha 
    } = req.query;
    
    // Usar la fecha actual si no se proporciona
    const fechaConsulta = fecha || new Date().toISOString().split('T')[0];
    
    // Obtener datos resumidos
    const summaryDataQuery = `
      SELECT 
        (SELECT COALESCE(SUM(Total_venta), 0) FROM Ventas WHERE Fecha_venta = $1 AND Estado != 'Cancelada') as ventas_dia,
        (SELECT COUNT(*) FROM Ventas WHERE Fecha_venta = $1) as transacciones_dia,
        (SELECT COALESCE(AVG(Total_venta), 0) FROM Ventas WHERE Fecha_venta = $1 AND Estado != 'Cancelada') as promedio_venta,
        (SELECT COUNT(*) FROM Alertas_stock WHERE Estado = 'Pendiente') as alertas_pendientes,
        (SELECT COUNT(*) FROM Productos WHERE Stock_actual <= Stock_minimo) as productos_bajo_stock
    `;
    
    // Obtener productos más vendidos
    const topProductsQuery = `
      SELECT 
        p.ID_producto, 
        p.Nombre,
        p.Imagen_url,
        c.Nombre_categoria,
        SUM(dv.Cantidad) as total_vendido,
        SUM(dv.Subtotal) as total_ingresos
      FROM Detalles_venta dv
      JOIN Ventas v ON dv.ID_venta = v.ID_venta
      JOIN Productos p ON dv.ID_producto = p.ID_producto
      LEFT JOIN Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE v.Estado = 'Completada'
      AND v.Fecha_venta BETWEEN $1::date - INTERVAL '30 days' AND $1::date
      GROUP BY p.ID_producto, p.Nombre, p.Imagen_url, c.Nombre_categoria
      ORDER BY total_vendido DESC
      LIMIT 5
    `;
    
    // Obtener alertas recientes
    const recentAlertsQuery = `
      SELECT 
        a.ID_alerta,
        a.Fecha_alerta,
        a.Prioridad_alerta,
        a.Mensaje,
        p.Nombre as producto_nombre,
        p.Stock_actual,
        p.Stock_minimo
      FROM Alertas_stock a
      JOIN Productos p ON a.ID_producto = p.ID_producto
      WHERE a.Estado = 'Pendiente'
      ORDER BY 
        CASE 
          WHEN a.Prioridad_alerta = 'Alta' THEN 1
          WHEN a.Prioridad_alerta = 'Media' THEN 2
          WHEN a.Prioridad_alerta = 'Baja' THEN 3
        END,
        a.Fecha_alerta DESC
      LIMIT 5
    `;
    
    // Obtener actividades recientes (movimientos de inventario y ventas)
    const recentActivitiesQuery = `
      (SELECT 
        'venta' as tipo,
        v.ID_venta as id,
        v.Fecha_hora_venta as fecha,
        u.Nombre_usuario as usuario,
        v.Total_venta as valor,
        v.Estado as estado,
        'Se registró una venta por $' || v.Total_venta as descripcion
      FROM Ventas v
      JOIN Usuarios u ON v.ID_usuario = u.ID_usuario
      ORDER BY v.Fecha_hora_venta DESC
      LIMIT 5)
      
      UNION ALL
      
      (SELECT 
        'movimiento' as tipo,
        m.ID_movimiento as id,
        m.Fecha_movimiento as fecha,
        u.Nombre_usuario as usuario,
        m.Cantidad as valor,
        m.Tipo_movimiento as estado,
        'Movimiento de ' || m.Cantidad || ' unidades (' || m.Tipo_movimiento || ') de ' || p.Nombre as descripcion
      FROM Movimientos_inventario m
      JOIN Usuarios u ON m.ID_usuario = u.ID_usuario
      JOIN Productos p ON m.ID_producto = p.ID_producto
      ORDER BY m.Fecha_movimiento DESC
      LIMIT 5)
      
      ORDER BY fecha DESC
      LIMIT 10
    `;
    
    // Ejecutar todas las consultas en paralelo
    const [summaryDataResult, topProductsResult, recentAlertsResult, recentActivitiesResult] = await Promise.all([
      pool.query(summaryDataQuery, [fechaConsulta]),
      pool.query(topProductsQuery, [fechaConsulta]),
      pool.query(recentAlertsQuery),
      pool.query(recentActivitiesQuery)
    ]);
    
    // Formatear los datos para el frontend
    const summaryData = summaryDataResult.rows[0] ? {
      ventasDia: parseFloat(summaryDataResult.rows[0].ventas_dia || 0),
      transaccionesDia: parseInt(summaryDataResult.rows[0].transacciones_dia || 0),
      promedioVenta: parseFloat(summaryDataResult.rows[0].promedio_venta || 0),
      alertasPendientes: parseInt(summaryDataResult.rows[0].alertas_pendientes || 0),
      productosBajoStock: parseInt(summaryDataResult.rows[0].productos_bajo_stock || 0)
    } : null;
    
    const topProducts = topProductsResult.rows.map(product => ({
      id: product.id_producto,
      nombre: product.nombre,
      categoria: product.nombre_categoria,
      totalVendido: parseInt(product.total_vendido),
      totalIngresos: parseFloat(product.total_ingresos),
      imagenUrl: product.imagen_url || null
    }));
    
    const recentAlerts = recentAlertsResult.rows.map(alert => ({
      id: alert.id_alerta,
      fecha: new Date(alert.fecha_alerta).toLocaleDateString('es-ES'),
      prioridad: alert.prioridad_alerta,
      mensaje: alert.mensaje,
      producto: alert.producto_nombre,
      stockActual: alert.stock_actual,
      stockMinimo: alert.stock_minimo
    }));
    
    const recentActivities = recentActivitiesResult.rows.map(activity => ({
      tipo: activity.tipo,
      id: activity.id,
      fecha: new Date(activity.fecha).toLocaleDateString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit'
      }),
      usuario: activity.usuario,
      valor: activity.valor,
      estado: activity.estado,
      descripcion: activity.descripcion
    }));
    
    res.status(200).json({
      summaryData,
      topProducts,
      recentAlerts,
      recentActivities,
      fecha: fechaConsulta
    });
  } catch (error) {
    console.error('Error al obtener datos del dashboard:', error);
    res.status(500).json({ message: 'Error al obtener datos del dashboard', error: error.message });
  }
};

// Obtener datos de historial de ventas
export const getHistorialVentas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    const queryParams = [];
    let whereClause = '';
    
    if (fechaInicio) {
      whereClause += ' AND Fecha_venta >= $1';
      queryParams.push(fechaInicio);
    }
    
    if (fechaFin) {
      whereClause += ` AND Fecha_venta <= $${queryParams.length + 1}`;
      queryParams.push(fechaFin);
    }
    
    const historialQuery = `
      SELECT 
        SUM(Total_venta) as total_ventas,
        COUNT(*) as numero_transacciones,
        AVG(Total_venta) as promedio_venta
      FROM Ventas
      WHERE Estado = 'Completada'${whereClause}
    `;
    
    // Ventas por día
    const ventasPorDiaQuery = `
      SELECT 
        Fecha_venta,
        COUNT(*) as cantidad_ventas,
        SUM(Total_venta) as total_ventas
      FROM Ventas
      WHERE Estado = 'Completada'${whereClause}
      GROUP BY Fecha_venta
      ORDER BY Fecha_venta DESC
      LIMIT 30
    `;
    
    const [historialResult, ventasPorDiaResult] = await Promise.all([
      pool.query(historialQuery, queryParams),
      pool.query(ventasPorDiaQuery, queryParams)
    ]);
    
    const resumen = historialResult.rows[0] ? {
      totalVentas: parseFloat(historialResult.rows[0].total_ventas || 0),
      numeroTransacciones: parseInt(historialResult.rows[0].numero_transacciones || 0),
      promedioVenta: parseFloat(historialResult.rows[0].promedio_venta || 0)
    } : {
      totalVentas: 0,
      numeroTransacciones: 0,
      promedioVenta: 0
    };
    
    const ventasPorDia = ventasPorDiaResult.rows.map(dia => ({
      fecha: new Date(dia.fecha_venta).toLocaleDateString('es-ES'),
      fechaISO: dia.fecha_venta,
      cantidadVentas: parseInt(dia.cantidad_ventas),
      totalVentas: parseFloat(dia.total_ventas)
    }));
    
    res.status(200).json({
      resumen,
      ventasPorDia
    });
  } catch (error) {
    console.error('Error al obtener historial de ventas:', error);
    res.status(500).json({ message: 'Error al obtener historial de ventas', error: error.message });
  }
};
