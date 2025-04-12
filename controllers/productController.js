import { pool } from '../config/db.js';

// Obtener todos los datos para el dashboard de productos
export const getProductModuleData = async (req, res) => {
  try {
    // Extraer parámetros de la solicitud
    const { searchTerm = '', categoryFilter = '', stockFilter = '' } = req.query;

    // 1. Obtener las categorías
    const categoriesQuery = `
      SELECT 
        c.ID_categoria AS id,
        c.Nombre_categoria AS nombre,
        (SELECT COUNT(*) FROM Productos p WHERE p.ID_categoria = c.ID_categoria AND p.Activo = TRUE) AS productos,
        CASE 
          WHEN c.ID_categoria % 8 = 1 THEN 'bg-blue-500'
          WHEN c.ID_categoria % 8 = 2 THEN 'bg-green-500'
          WHEN c.ID_categoria % 8 = 3 THEN 'bg-purple-500'
          WHEN c.ID_categoria % 8 = 4 THEN 'bg-amber-500'
          WHEN c.ID_categoria % 8 = 5 THEN 'bg-pink-500'
          WHEN c.ID_categoria % 8 = 6 THEN 'bg-teal-500'
          WHEN c.ID_categoria % 8 = 7 THEN 'bg-indigo-500'
          ELSE 'bg-red-500'
        END AS color
      FROM 
        Categorias c
      WHERE 
        c.Activo = TRUE
      ORDER BY 
        c.Nombre_categoria
    `;

    // 2. Obtener todos los productos
    const productsQuery = `
      SELECT 
        p.ID_producto AS id,
        p.Nombre AS nombre,
        p.Codigo_barras AS sku,
        c.Nombre_categoria AS categoria,
        p.Precio AS precio,
        p.Precio_compra AS costo,
        p.Stock_actual AS stock,
        p.Stock_minimo AS stock_minimo,
        p.Descripción AS descripcion,
        COALESCE(p.Imagen_url, '/placeholder-product.jpg') AS imagen,
        TO_CHAR(p.Fecha_creación, 'YYYY-MM-DD') AS fechaCreacion,
        p.ID_categoria AS id_categoria
      FROM 
        Productos p
      LEFT JOIN 
        Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE 
        p.Activo = TRUE
      ORDER BY 
        p.Fecha_creación DESC
    `;

    // 3. Obtener resumen de stock para dashboard (modificado)
    const stockSummaryQuery = `
SELECT 
  'bajo' AS tipo,
  COUNT(*) AS cantidad
FROM 
  Productos
WHERE 
  Stock_actual < Stock_minimo 
  AND Activo = TRUE
UNION ALL
SELECT 
  'medio' AS tipo,
  COUNT(*) AS cantidad
FROM 
  Productos
WHERE 
  Stock_actual >= Stock_minimo 
  AND Stock_actual < (Stock_minimo * 3)
  AND Activo = TRUE
UNION ALL
SELECT 
  'bueno' AS tipo,
  COUNT(*) AS cantidad
FROM 
  Productos
WHERE 
  Stock_actual >= (Stock_minimo * 3)
  AND Activo = TRUE
`;

    // 4. Obtener detalle de estado de stock
    const stockDetailQuery = `
      SELECT 
        p.ID_producto AS id,
        p.Nombre AS nombre,
        p.Codigo_barras AS sku,
        p.Stock_actual AS stock_actual,
        p.Stock_minimo AS stock_minimo,
        CASE 
          WHEN p.Stock_actual < p.Stock_minimo THEN 'Bajo'
          WHEN p.Stock_actual < (p.Stock_minimo * 3) THEN 'Medio'
          ELSE 'Óptimo'
        END AS estado_stock,
        CASE 
          WHEN p.Stock_actual < p.Stock_minimo THEN 'bg-red-100 text-red-800'
          WHEN p.Stock_actual < (p.Stock_minimo * 3) THEN 'bg-amber-100 text-amber-800'
          ELSE 'bg-green-100 text-green-800'
        END AS status_color
      FROM 
        Productos p
      WHERE 
        p.Activo = TRUE
      ORDER BY 
        CASE 
          WHEN p.Stock_actual < p.Stock_minimo THEN 1
          WHEN p.Stock_actual < (p.Stock_minimo * 3) THEN 2
          ELSE 3
        END,
        p.Nombre
    `;

    // Ejecutar todas las consultas en paralelo para mejor rendimiento
    const [
      categoriesResult,
      productsResult,
      stockSummaryResult,
      stockDetailResult
    ] = await Promise.all([
      pool.query(categoriesQuery),
      pool.query(productsQuery),
      pool.query(stockSummaryQuery),
      pool.query(stockDetailQuery)
    ]);

    // Procesar los datos del resumen de stock para el formato esperado
    const stockSummary = {
      bajo: 0,
      medio: 0,
      bueno: 0
    };

    stockSummaryResult.rows.forEach(item => {
      stockSummary[item.tipo] = parseInt(item.cantidad);
    });

    // Organizar todos los datos en un objeto con la estructura que necesita el front-end
    const dashboardData = {
      categorias: categoriesResult.rows,
      productos: productsResult.rows,
      stockResumen: stockSummary,
      stockDetalle: stockDetailResult.rows
    };

    return res.status(200).json(dashboardData);

  } catch (error) {
    console.error('Error al obtener datos del dashboard:', error);
    return res.status(500).json({
      error: 'Error al obtener datos del dashboard',
      message: error.message
    });
  }
};

// Obtener todos los productos
export const getAllProducts = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.ID_producto AS id,
        p.Nombre AS nombre,
        p.Codigo_barras AS sku,
        c.Nombre_categoria AS categoria,
        p.Precio AS precio,
        p.Precio_compra AS costo,
        p.Stock_actual AS stock,
        p.Stock_minimo AS stock_minimo,
        p.Descripción AS descripcion,
        COALESCE(p.Imagen_url, '/placeholder-product.jpg') AS imagen,
        TO_CHAR(p.Fecha_creación, 'YYYY-MM-DD') AS fechaCreacion,
        p.ID_categoria AS id_categoria
      FROM 
        Productos p
      LEFT JOIN 
        Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE 
        p.Activo = TRUE
      ORDER BY 
        p.Nombre
    `;

    const result = await pool.query(query);

    return res.status(200).json(result.rows);

  } catch (error) {
    console.error('Error al obtener productos:', error);
    return res.status(500).json({
      error: 'Error al obtener productos',
      message: error.message
    });
  }
};

// Obtener un producto por ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        p.ID_producto AS id,
        p.Nombre AS nombre,
        p.Codigo_barras AS sku,
        c.Nombre_categoria AS categoria,
        p.Precio AS precio,
        p.Precio_compra AS costo,
        p.Stock_actual AS stock,
        p.Stock_minimo AS stock_minimo,
        p.Descripción AS descripcion,
        COALESCE(p.Imagen_url, '/placeholder-product.jpg') AS imagen,
        TO_CHAR(p.Fecha_creación, 'YYYY-MM-DD') AS fechaCreacion,
        p.ID_categoria AS id_categoria
      FROM 
        Productos p
      LEFT JOIN 
        Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE 
        p.ID_producto = $1 AND p.Activo = TRUE
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    return res.status(200).json(result.rows[0]);

  } catch (error) {
    console.error('Error al obtener producto:', error);
    return res.status(500).json({
      error: 'Error al obtener producto',
      message: error.message
    });
  }
};

// Crear un nuevo producto
export const createProduct = async (req, res) => {
  try {
    const {
      nombre,
      sku,
      idCategoria,
      stock,
      stockMinimo,
      precio,
      costo,
      descripcion,
      imagen
    } = req.body;

    // Validar campos obligatorios
    if (!nombre || !sku || !idCategoria || stock === undefined || stockMinimo === undefined || precio === undefined) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const query = `
      INSERT INTO Productos (
        Nombre, 
        Codigo_barras, 
        ID_categoria, 
        Stock_actual, 
        Stock_minimo, 
        Precio, 
        Precio_compra, 
        Descripción, 
        Imagen_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ID_producto AS id
    `;

    const values = [
      nombre,
      sku,
      idCategoria,
      stock,
      stockMinimo,
      precio,
      costo || precio * 0.6, // Si no se especifica costo, se calcula como 60% del precio
      descripcion || '',
      imagen || '/placeholder-product.jpg'
    ];

    const result = await pool.query(query, values);

    // Registrar en historial de movimientos como entrada inicial
    if (stock > 0) {
      await pool.query(
        `SELECT fn_registrar_movimiento_inventario($1, $2, $3, $4, $5)`,
        ['Entrada', result.rows[0].id, stock, 1, 'Stock inicial']
      );
    }

    return res.status(201).json({
      id: result.rows[0].id,
      message: 'Producto creado correctamente'
    });

  } catch (error) {
    console.error('Error al crear producto:', error);
    return res.status(500).json({
      error: 'Error al crear producto',
      message: error.message
    });
  }
};

// Actualizar un producto
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      sku,
      idCategoria,
      stock,
      stockMinimo,
      precio,
      costo,
      descripcion,
      imagen
    } = req.body;

    // Obtener el producto actual para comparar cambios de stock
    const currentProduct = await pool.query(
      'SELECT Stock_actual FROM Productos WHERE ID_producto = $1',
      [id]
    );

    if (currentProduct.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const currentStock = currentProduct.rows[0].stock_actual;

    // Establecer el usuario actual para el historial de actualizaciones
    await pool.query('SELECT fn_set_current_user($1)', [1]); // Utilizamos el ID de usuario 1 como predeterminado

    const query = `
      UPDATE Productos
      SET 
        Nombre = $1,
        Codigo_barras = $2,
        ID_categoria = $3,
        Stock_minimo = $4,
        Precio = $5,
        Precio_compra = $6,
        Descripción = $7,
        Imagen_url = $8,
        Ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE ID_producto = $9
      RETURNING ID_producto AS id
    `;

    const values = [
      nombre,
      sku,
      idCategoria,
      stockMinimo,
      precio,
      costo,
      descripcion || '',
      imagen || '/placeholder-product.jpg',
      id
    ];

    const result = await pool.query(query, values);

    // Si hay cambio en el stock, registrarlo como movimiento de inventario
    if (stock !== undefined && stock !== currentStock) {
      const tipoMovimiento = stock > currentStock ? 'Entrada' : 'Ajuste';
      const cantidad = stock > currentStock ? stock - currentStock : stock;

      await pool.query(
        `SELECT fn_registrar_movimiento_inventario($1, $2, $3, $4, $5)`,
        [tipoMovimiento, id, cantidad, 1, `Actualización de stock por edición de producto`]
      );
    }

    return res.status(200).json({
      id: result.rows[0].id,
      message: 'Producto actualizado correctamente'
    });

  } catch (error) {
    console.error('Error al actualizar producto:', error);
    return res.status(500).json({
      error: 'Error al actualizar producto',
      message: error.message
    });
  }
};

// Eliminar un producto (desactivarlo)
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Desactivar en lugar de eliminar físicamente
    const query = `
      UPDATE Productos
      SET Activo = FALSE
      WHERE ID_producto = $1
      RETURNING ID_producto AS id
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    return res.status(200).json({
      message: 'Producto eliminado correctamente'
    });

  } catch (error) {
    console.error('Error al eliminar producto:', error);
    return res.status(500).json({
      error: 'Error al eliminar producto',
      message: error.message
    });
  }
};

// Actualizar el stock de un producto
export const updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;

    if (stock === undefined) {
      return res.status(400).json({ error: 'El stock es requerido' });
    }

    // Obtener stock actual para comparar
    const currentStock = await pool.query(
      'SELECT Stock_actual FROM Productos WHERE ID_producto = $1',
      [id]
    );

    if (currentStock.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const oldStock = currentStock.rows[0].stock_actual;

    // Determinar tipo de movimiento
    let tipoMovimiento;
    let cantidad;

    if (stock > oldStock) {
      tipoMovimiento = 'Entrada';
      cantidad = stock - oldStock;
    } else if (stock < oldStock) {
      tipoMovimiento = 'Salida';
      cantidad = oldStock - stock;
    } else {
      // No hay cambio en el stock
      return res.status(200).json({
        message: 'No hay cambios en el stock'
      });
    }

    // Registrar movimiento de inventario
    await pool.query(
      `SELECT fn_registrar_movimiento_inventario($1, $2, $3, $4, $5)`,
      [tipoMovimiento, id, cantidad, 1, `Actualización manual de stock`]
    );

    return res.status(200).json({
      message: 'Stock actualizado correctamente'
    });

  } catch (error) {
    console.error('Error al actualizar stock:', error);
    return res.status(500).json({
      error: 'Error al actualizar stock',
      message: error.message
    });
  }
};

// Obtener detalles de stock
export const getStockDetails = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.ID_producto AS id,
        p.Nombre AS nombre,
        p.Codigo_barras AS sku,
        p.Stock_actual AS stock_actual,
        p.Stock_minimo AS stock_minimo,
       CASE 
        WHEN p.Stock_actual < p.Stock_minimo THEN 'Bajo'
        WHEN p.Stock_actual < (p.Stock_minimo * 3) THEN 'Medio'
        ELSE 'Bueno'  
      END AS estado_stock
        END AS estado_stock,
        CASE 
          WHEN p.Stock_actual < p.Stock_minimo THEN 'bg-red-100 text-red-800'
          WHEN p.Stock_actual < (p.Stock_minimo * 3) THEN 'bg-amber-100 text-amber-800'
          ELSE 'bg-green-100 text-green-800'
        END AS status_color,
        c.Nombre_categoria AS categoria
      FROM 
        Productos p
      LEFT JOIN 
        Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE 
        p.Activo = TRUE
      ORDER BY 
        CASE 
          WHEN p.Stock_actual < p.Stock_minimo THEN 1
          WHEN p.Stock_actual < (p.Stock_minimo * 3) THEN 2
          ELSE 3
        END,
        p.Nombre
    `;

    const result = await pool.query(query);

    return res.status(200).json(result.rows);

  } catch (error) {
    console.error('Error al obtener detalles de stock:', error);
    return res.status(500).json({
      error: 'Error al obtener detalles de stock',
      message: error.message
    });
  }
};