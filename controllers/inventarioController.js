import { pool } from '../config/db.js';

/**
 * Obtiene los datos para el dashboard de inventario
 */
export const dashboardInventario = async (req, res) => {
  try {
    const { searchTerm = '' } = req.query;
    
    // Obtener datos para el dashboard de inventario
    const summaryData = await getInventarioSummary();
    const productos = await getProductosInventario(searchTerm);
    const movimientos = await getMovimientosRecientes(searchTerm, 5); // Últimos 5 movimientos
    
    res.json({
      summaryData,
      productos,
      movimientos
    });
  } catch (error) {
    console.error('Error en dashboardInventario:', error);
    res.status(500).json({ error: 'Error al obtener datos del inventario' });
  }
};

/**
 * Obtiene el listado completo de productos con información de inventario
 */
export const getProductos = async (req, res) => {
  try {
    const { searchTerm = '', categoria = null, stockStatus = null } = req.query;
    const productos = await getProductosInventario(searchTerm, categoria, stockStatus);
    
    res.json(productos);
  } catch (error) {
    console.error('Error en getProductos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
};

/**
 * Obtiene un producto específico por ID
 */
export const getProductoById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        p.ID_producto as id,
        p.Codigo_barras as sku,
        p.Nombre as name,
        p.Descripción as description,
        c.ID_categoria as categoryId,
        c.Nombre_categoria as category,
        p.Stock_actual as stock,
        p.Stock_minimo as minStock,
        p.Precio as price,
        p.Precio_compra as purchasePrice,
        p.Ultima_actualizacion as lastUpdated,
        p.Activo as active,
        p.Imagen_url as imageUrl
      FROM Productos p
      LEFT JOIN Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE p.ID_producto = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    // Formatear el producto
    const producto = {
      ...result.rows[0],
      lastUpdated: result.rows[0].lastupdated ? new Date(result.rows[0].lastupdated).toISOString().split('T')[0] : null,
      price: parseFloat(result.rows[0].price),
      purchasePrice: parseFloat(result.rows[0].purchaseprice)
    };
    
    res.json(producto);
  } catch (error) {
    console.error('Error en getProductoById:', error);
    res.status(500).json({ error: 'Error al obtener el producto' });
  }
};

/**
 * Agrega un nuevo producto al inventario
 */
export const addProducto = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { 
      nombre, 
      descripcion, 
      precio, 
      precio_compra, 
      stock_actual, 
      stock_minimo, 
      id_categoria, 
      codigo_barras,
      imagen_url
    } = req.body;
    
    await client.query('BEGIN');
    
    // Insertar el nuevo producto
    const productoResult = await client.query(
      `INSERT INTO Productos (
        Nombre, Descripción, Precio, Precio_compra, Stock_actual, 
        Stock_minimo, ID_categoria, Codigo_barras, Imagen_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ID_producto`,
      [nombre, descripcion, precio, precio_compra, stock_actual, stock_minimo, id_categoria, codigo_barras, imagen_url]
    );
    
    const idProducto = productoResult.rows[0].id_producto;
    
    // Si hay stock inicial, crear movimiento de inventario
    if (stock_actual > 0) {
      // Asumimos que es el usuario 1 (admin) si no hay información de sesión
      const idUsuario = req.session?.usuario?.id_usuario || 1;
      
      await client.query(
        `INSERT INTO Movimientos_inventario (
          Tipo_movimiento, Cantidad, ID_usuario, ID_producto, Observaciones
        ) VALUES ($1, $2, $3, $4, $5)`,
        ['Entrada', stock_actual, idUsuario, idProducto, 'Stock inicial']
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      id: idProducto,
      message: 'Producto agregado correctamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en addProducto:', error);
    res.status(500).json({ error: 'Error al agregar producto' });
  } finally {
    client.release();
  }
};

/**
 * Actualiza un producto existente
 */
export const updateProducto = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { 
      nombre, 
      descripcion, 
      precio, 
      precio_compra, 
      stock_minimo, 
      id_categoria, 
      codigo_barras,
      imagen_url,
      activo
    } = req.body;
    
    // Verificar si el producto existe
    const checkResult = await client.query(
      'SELECT * FROM Productos WHERE ID_producto = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    await client.query('BEGIN');
    
    // Actualizar el producto
    await client.query(
      `UPDATE Productos SET 
        Nombre = $1, 
        Descripción = $2, 
        Precio = $3, 
        Precio_compra = $4, 
        Stock_minimo = $5, 
        ID_categoria = $6, 
        Codigo_barras = $7,
        Imagen_url = $8,
        Activo = $9,
        Ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE ID_producto = $10`,
      [nombre, descripcion, precio, precio_compra, stock_minimo, id_categoria, codigo_barras, imagen_url, activo, id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      id,
      message: 'Producto actualizado correctamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en updateProducto:', error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  } finally {
    client.release();
  }
};

/**
 * Elimina un producto lógicamente (cambia estado a inactivo)
 */
export const deleteProducto = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el producto existe
    const checkResult = await pool.query(
      'SELECT * FROM Productos WHERE ID_producto = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    // Eliminar lógicamente el producto
    await pool.query(
      'UPDATE Productos SET Activo = FALSE, Ultima_actualizacion = CURRENT_TIMESTAMP WHERE ID_producto = $1',
      [id]
    );
    
    res.json({
      id,
      message: 'Producto eliminado correctamente'
    });
  } catch (error) {
    console.error('Error en deleteProducto:', error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
};

/**
 * Obtiene los movimientos de inventario (historial)
 */
export const getMovimientos = async (req, res) => {
  try {
    const { searchTerm = '', tipo = null, limit = 100 } = req.query;
    const movimientos = await getMovimientosInventario(searchTerm, tipo, parseInt(limit));
    
    res.json(movimientos);
  } catch (error) {
    console.error('Error en getMovimientos:', error);
    res.status(500).json({ error: 'Error al obtener movimientos de inventario' });
  }
};

/**
 * Registra un movimiento de inventario (entrada o salida)
 */
export const registrarMovimiento = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { 
      tipo_movimiento, 
      id_producto, 
      cantidad, 
      observaciones,
      documento_referencia = null,
      id_venta = null
    } = req.body;
    
    if (!['Entrada', 'Salida', 'Ajuste'].includes(tipo_movimiento)) {
      return res.status(400).json({ error: 'Tipo de movimiento no válido' });
    }
    
    // Validar que haya stock suficiente si es una salida
    if (tipo_movimiento === 'Salida') {
      const stockResult = await client.query(
        'SELECT Stock_actual FROM Productos WHERE ID_producto = $1',
        [id_producto]
      );
      
      if (stockResult.rows.length === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      
      const stockActual = parseInt(stockResult.rows[0].stock_actual);
      
      if (stockActual < cantidad) {
        return res.status(400).json({ 
          error: 'Stock insuficiente',
          stockActual,
          stockRequerido: cantidad
        });
      }
    }
    
    await client.query('BEGIN');
    
    // Asumimos que es el usuario 1 (admin) si no hay información de sesión
    const idUsuario = req.session?.usuario?.id_usuario || 1;
    
    // Insertar el movimiento
    await client.query(
      `INSERT INTO Movimientos_inventario (
        Tipo_movimiento, Cantidad, ID_usuario, ID_producto, 
        Observaciones, Documento_referencia, ID_venta
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tipo_movimiento, cantidad, idUsuario, id_producto, observaciones, documento_referencia, id_venta]
    );
    
    // Actualizar el stock del producto
    if (tipo_movimiento === 'Entrada') {
      await client.query(
        'UPDATE Productos SET Stock_actual = Stock_actual + $1, Ultima_actualizacion = CURRENT_TIMESTAMP WHERE ID_producto = $2',
        [cantidad, id_producto]
      );
    } else if (tipo_movimiento === 'Salida') {
      await client.query(
        'UPDATE Productos SET Stock_actual = Stock_actual - $1, Ultima_actualizacion = CURRENT_TIMESTAMP WHERE ID_producto = $2',
        [cantidad, id_producto]
      );
    } else if (tipo_movimiento === 'Ajuste') {
      await client.query(
        'UPDATE Productos SET Stock_actual = $1, Ultima_actualizacion = CURRENT_TIMESTAMP WHERE ID_producto = $2',
        [cantidad, id_producto]
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: 'Movimiento registrado correctamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registrarMovimiento:', error);
    res.status(500).json({ error: 'Error al registrar movimiento' });
  } finally {
    client.release();
  }
};

/**
 * Obtiene alertas de stock bajo
 */
export const getAlertasStock = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.ID_alerta as id,
        p.ID_producto as productId,
        p.Nombre as productName,
        p.Stock_actual as currentStock,
        p.Stock_minimo as minStock,
        a.Fecha_alerta as alertDate,
        a.Prioridad_alerta as priority,
        a.Mensaje as message,
        a.Estado as status,
        c.Nombre_categoria as category
      FROM Alertas_stock a
      JOIN Productos p ON a.ID_producto = p.ID_producto
      LEFT JOIN Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE a.Estado = 'Pendiente'
      ORDER BY 
        CASE 
          WHEN a.Prioridad_alerta = 'Alta' THEN 1
          WHEN a.Prioridad_alerta = 'Media' THEN 2
          WHEN a.Prioridad_alerta = 'Baja' THEN 3
          ELSE 4
        END,
        a.Fecha_alerta DESC
    `);
    
    const alertas = result.rows.map(row => ({
      ...row,
      alertDate: new Date(row.alertdate).toISOString().split('T')[0]
    }));
    
    res.json(alertas);
  } catch (error) {
    console.error('Error en getAlertasStock:', error);
    res.status(500).json({ error: 'Error al obtener alertas de stock' });
  }
};

/**
 * Resuelve una alerta de stock
 */
export const resolverAlerta = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si la alerta existe
    const checkResult = await pool.query(
      'SELECT * FROM Alertas_stock WHERE ID_alerta = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    
    // Actualizar el estado de la alerta
    await pool.query(
      `UPDATE Alertas_stock 
       SET Estado = 'Resuelto', Fecha_resolucion = CURRENT_TIMESTAMP 
       WHERE ID_alerta = $1`,
      [id]
    );
    
    res.json({
      id,
      message: 'Alerta resuelta correctamente'
    });
  } catch (error) {
    console.error('Error en resolverAlerta:', error);
    res.status(500).json({ error: 'Error al resolver alerta' });
  }
};

// Funciones auxiliares

/**
 * Obtiene resumen del inventario
 */
async function getInventarioSummary() {
  const client = await pool.connect();
  
  try {
    // Total de productos
    const totalProductosResult = await client.query(
      'SELECT COUNT(*) as total FROM Productos WHERE Activo = true'
    );
    const totalProductos = parseInt(totalProductosResult.rows[0].total);
    
    // Valor total del inventario
    const valorInventarioResult = await client.query(
      'SELECT SUM(Stock_actual * Precio) as valor_total FROM Productos WHERE Activo = true'
    );
    const valorInventario = parseFloat(valorInventarioResult.rows[0].valor_total || 0).toFixed(2);
    
    // Productos con bajo stock
    const bajoStockResult = await client.query(
      'SELECT COUNT(*) as total FROM Productos WHERE Stock_actual < Stock_minimo AND Activo = true'
    );
    const productosConBajoStock = parseInt(bajoStockResult.rows[0].total);
    
    // Total de movimientos este mes
    const movimientosMesResult = await client.query(
      "SELECT COUNT(*) as total FROM Movimientos_inventario WHERE DATE_TRUNC('month', Fecha_movimiento) = DATE_TRUNC('month', CURRENT_DATE)"
    );
    const movimientosMes = parseInt(movimientosMesResult.rows[0].total);
    
    // Calcular el crecimiento respecto al mes anterior (para productos)
    const crecimientoProductosResult = await client.query(`
      WITH productos_actual AS (
        SELECT COUNT(*) as total FROM Productos 
        WHERE Fecha_creación >= DATE_TRUNC('month', CURRENT_DATE)
        AND Activo = true
      ),
      productos_anterior AS (
        SELECT COUNT(*) as total FROM Productos 
        WHERE Fecha_creación >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND Fecha_creación < DATE_TRUNC('month', CURRENT_DATE)
        AND Activo = true
      )
      SELECT 
        CASE 
          WHEN (SELECT total FROM productos_anterior) = 0 THEN 100
          ELSE ROUND(((SELECT total FROM productos_actual) - (SELECT total FROM productos_anterior)) * 100.0 / (SELECT GREATEST(1, total) FROM productos_anterior), 1)
        END as crecimiento
    `);
    const crecimientoProductos = parseFloat(crecimientoProductosResult.rows[0].crecimiento || 0).toFixed(1);
    
    // Calcular el crecimiento del valor de inventario respecto al mes anterior
    // Esta consulta es aproximada ya que no tenemos un historial de valores de inventario
    const crecimientoValorResult = await client.query(`
      WITH entradas_mes AS (
        SELECT COALESCE(SUM(m.Cantidad * p.Precio), 0) as valor
        FROM Movimientos_inventario m
        JOIN Productos p ON m.ID_producto = p.ID_producto
        WHERE m.Tipo_movimiento = 'Entrada'
        AND m.Fecha_movimiento >= DATE_TRUNC('month', CURRENT_DATE)
      ),
      salidas_mes AS (
        SELECT COALESCE(SUM(m.Cantidad * p.Precio), 0) as valor
        FROM Movimientos_inventario m
        JOIN Productos p ON m.ID_producto = p.ID_producto
        WHERE m.Tipo_movimiento = 'Salida'
        AND m.Fecha_movimiento >= DATE_TRUNC('month', CURRENT_DATE)
      ),
      entradas_mes_anterior AS (
        SELECT COALESCE(SUM(m.Cantidad * p.Precio), 0) as valor
        FROM Movimientos_inventario m
        JOIN Productos p ON m.ID_producto = p.ID_producto
        WHERE m.Tipo_movimiento = 'Entrada'
        AND m.Fecha_movimiento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND m.Fecha_movimiento < DATE_TRUNC('month', CURRENT_DATE)
      ),
      salidas_mes_anterior AS (
        SELECT COALESCE(SUM(m.Cantidad * p.Precio), 0) as valor
        FROM Movimientos_inventario m
        JOIN Productos p ON m.ID_producto = p.ID_producto
        WHERE m.Tipo_movimiento = 'Salida'
        AND m.Fecha_movimiento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND m.Fecha_movimiento < DATE_TRUNC('month', CURRENT_DATE)
      )
      SELECT 
        ((SELECT valor FROM entradas_mes) - (SELECT valor FROM salidas_mes)) as balance_actual,
        ((SELECT valor FROM entradas_mes_anterior) - (SELECT valor FROM salidas_mes_anterior)) as balance_anterior
    `);
    
    let crecimientoValor = 0;
    if (crecimientoValorResult.rows.length > 0) {
      const balanceActual = parseFloat(crecimientoValorResult.rows[0].balance_actual || 0);
      const balanceAnterior = parseFloat(crecimientoValorResult.rows[0].balance_anterior || 0);
      
      if (balanceAnterior !== 0) {
        crecimientoValor = ((balanceActual - balanceAnterior) / Math.abs(balanceAnterior)) * 100;
      } else if (balanceActual > 0) {
        crecimientoValor = 100;
      }
    }
    
    return {
      totalProductos,
      valorInventario,
      productosConBajoStock,
      movimientosMes,
      crecimientoProductos,
      crecimientoValor: parseFloat(crecimientoValor).toFixed(1)
    };
  } finally {
    client.release();
  }
}

/**
 * Obtiene el listado de productos para el inventario
 */
async function getProductosInventario(searchTerm = '', categoria = null, stockStatus = null) {
  const client = await pool.connect();
  
  try {
    let query = `
      SELECT 
        p.ID_producto as id,
        p.Codigo_barras as sku,
        p.Nombre as name,
        c.Nombre_categoria as category,
        p.Stock_actual as stock,
        p.Stock_minimo as minStock,
        p.Precio as price,
        p.Precio_compra as purchasePrice,
        p.Ultima_actualizacion as lastUpdated,
        CASE 
          WHEN p.Stock_actual <= 0 THEN 'sin_stock'
          WHEN p.Stock_actual < p.Stock_minimo THEN 'bajo'
          ELSE 'optimo'
        END as stockStatus,
        p.Activo as active,
        p.Imagen_url as imageUrl
      FROM Productos p
      LEFT JOIN Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE p.Activo = true
      AND (
        p.Nombre ILIKE $1
        OR p.Codigo_barras ILIKE $1
        OR c.Nombre_categoria ILIKE $1
      )
    `;
    
    // Parámetros para la consulta
    const params = [`%${searchTerm}%`];
    let paramIndex = 2;
    
    // Filtrar por categoría si se especifica
    if (categoria) {
      query += ` AND p.ID_categoria = $${paramIndex}`;
      params.push(categoria);
      paramIndex++;
    }
    
    // Filtrar por estado de stock si se especifica
    if (stockStatus) {
      if (stockStatus === 'sin_stock') {
        query += ` AND p.Stock_actual <= 0`;
      } else if (stockStatus === 'bajo') {
        query += ` AND p.Stock_actual > 0 AND p.Stock_actual < p.Stock_minimo`;
      } else if (stockStatus === 'optimo') {
        query += ` AND p.Stock_actual >= p.Stock_minimo`;
      }
    }
    
    // Ordenar por nombre
    query += ` ORDER BY p.Nombre ASC`;
    
    const result = await client.query(query, params);
    
    // Formatear fechas y precios
    return result.rows.map(row => ({
      ...row,
      lastUpdated: row.lastupdated ? new Date(row.lastupdated).toISOString().split('T')[0] : null,
      price: parseFloat(row.price),
      purchasePrice: parseFloat(row.purchaseprice)
    }));
  } finally {
    client.release();
  }
}

/**
 * Obtiene el historial completo de movimientos de inventario
 */
async function getMovimientosInventario(searchTerm = '', tipo = null, limit = 100) {
  const client = await pool.connect();
  
  try {
    // Construir la consulta base
    let query = `
      SELECT 
        m.ID_movimiento as id,
        m.Fecha_movimiento as date,
        p.Nombre as product,
        p.ID_producto as productId,
        m.Tipo_movimiento as type,
        m.Cantidad as quantity,
        u.Nombre_usuario as user,
        m.Observaciones as notes,
        m.Documento_referencia as reference
      FROM Movimientos_inventario m
      JOIN Productos p ON m.ID_producto = p.ID_producto
      JOIN Usuarios u ON m.ID_usuario = u.ID_usuario
      WHERE (
        p.Nombre ILIKE $1
        OR m.Tipo_movimiento ILIKE $1
        OR u.Nombre_usuario ILIKE $1
        OR m.Observaciones ILIKE $1
      )
    `;
    
    // Parámetros para la consulta
    const params = [`%${searchTerm}%`];
    let paramIndex = 2;
    
    // Agregar filtro por tipo si se especifica
    if (tipo) {
      query += ` AND m.Tipo_movimiento = $${paramIndex}`;
      params.push(tipo);
      paramIndex++;
    }
    
    // Ordenar por fecha descendente y limitar resultados
    query += ` ORDER BY m.Fecha_movimiento DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await client.query(query, params);
    
    // Formatear fechas
    return result.rows.map(row => ({
      ...row,
      date: new Date(row.date).toISOString().split('T')[0]
    }));
  } finally {
    client.release();
  }
}

/**
 * Obtiene los movimientos recientes de inventario (últimos N)
 */
async function getMovimientosRecientes(searchTerm = '', limit = 5) {
  return getMovimientosInventario(searchTerm, null, limit);
}