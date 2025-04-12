import { pool } from '../config/db.js';

// Obtener todas las categorías
export const getAllCategories = async (req, res) => {
  try {
    const query = `
      SELECT 
        c.ID_categoria AS id,
        c.Nombre_categoria AS nombre,
        c.Descripción AS descripcion,
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
    
    const result = await pool.query(query);
    
    return res.status(200).json(result.rows);
    
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return res.status(500).json({ 
      error: 'Error al obtener categorías',
      message: error.message
    });
  }
};

// Obtener una categoría por ID
export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        c.ID_categoria AS id,
        c.Nombre_categoria AS nombre,
        c.Descripción AS descripcion,
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
        c.ID_categoria = $1 AND c.Activo = TRUE
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    return res.status(200).json(result.rows[0]);
    
  } catch (error) {
    console.error('Error al obtener categoría:', error);
    return res.status(500).json({ 
      error: 'Error al obtener categoría',
      message: error.message
    });
  }
};

// Crear una nueva categoría
export const createCategory = async (req, res) => {
  try {
    const { nombreCategoria, descripcion } = req.body;
    
    if (!nombreCategoria) {
      return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
    }
    
    // Verificar si ya existe una categoría con el mismo nombre
    const existingCategory = await pool.query(
      'SELECT ID_categoria FROM Categorias WHERE Nombre_categoria = $1 AND Activo = TRUE',
      [nombreCategoria]
    );
    
    if (existingCategory.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
    }
    
    const query = `
      INSERT INTO Categorias (Nombre_categoria, Descripción)
      VALUES ($1, $2)
      RETURNING ID_categoria AS id
    `;
    
    const result = await pool.query(query, [nombreCategoria, descripcion || '']);
    
    return res.status(201).json({ 
      id: result.rows[0].id,
      message: 'Categoría creada correctamente'
    });
    
  } catch (error) {
    console.error('Error al crear categoría:', error);
    return res.status(500).json({ 
      error: 'Error al crear categoría',
      message: error.message
    });
  }
};

// Actualizar una categoría
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombreCategoria, descripcion } = req.body;
    
    if (!nombreCategoria) {
      return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
    }
    
    // Verificar si existe otra categoría con el mismo nombre
    const existingCategory = await pool.query(
      'SELECT ID_categoria FROM Categorias WHERE Nombre_categoria = $1 AND ID_categoria != $2 AND Activo = TRUE',
      [nombreCategoria, id]
    );
    
    if (existingCategory.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre' });
    }
    
    const query = `
      UPDATE Categorias
      SET Nombre_categoria = $1, Descripción = $2
      WHERE ID_categoria = $3
      RETURNING ID_categoria AS id
    `;
    
    const result = await pool.query(query, [nombreCategoria, descripcion || '', id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    return res.status(200).json({ 
      id: result.rows[0].id,
      message: 'Categoría actualizada correctamente'
    });
    
  } catch (error) {
    console.error('Error al actualizar categoría:', error);
    return res.status(500).json({ 
      error: 'Error al actualizar categoría',
      message: error.message
    });
  }
};

// Eliminar una categoría (desactivarla)
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Comprobar si hay productos asociados a esta categoría
    const productsCount = await pool.query(
      'SELECT COUNT(*) FROM Productos WHERE ID_categoria = $1 AND Activo = TRUE',
      [id]
    );
    
    if (parseInt(productsCount.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar la categoría porque tiene productos asociados',
        count: parseInt(productsCount.rows[0].count)
      });
    }
    
    // Desactivar en lugar de eliminar físicamente
    const query = `
      UPDATE Categorias
      SET Activo = FALSE
      WHERE ID_categoria = $1
      RETURNING ID_categoria AS id
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    return res.status(200).json({ 
      message: 'Categoría eliminada correctamente'
    });
    
  } catch (error) {
    console.error('Error al eliminar categoría:', error);
    return res.status(500).json({ 
      error: 'Error al eliminar categoría',
      message: error.message
    });
  }
};

// Obtener productos por categoría
export const getProductsByCategory = async (req, res) => {
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
        p.Descripción AS descripcion,
        COALESCE(p.Imagen_url, '/placeholder-product.jpg') AS imagen,
        TO_CHAR(p.Fecha_creación, 'YYYY-MM-DD') AS fechaCreacion
      FROM 
        Productos p
      LEFT JOIN 
        Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE 
        p.ID_categoria = $1 AND p.Activo = TRUE
      ORDER BY 
        p.Nombre
    `;
    
    const result = await pool.query(query, [id]);
    
    return res.status(200).json(result.rows);
    
  } catch (error) {
    console.error('Error al obtener productos por categoría:', error);
    return res.status(500).json({ 
      error: 'Error al obtener productos por categoría',
      message: error.message
    });
  }
};