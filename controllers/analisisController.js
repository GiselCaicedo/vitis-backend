import { pool } from '../config/db.js';

/**
 * Obtiene los datos principales para el dashboard de análisis
 * Incluye ventas mensuales, productos más vendidos, movimientos de inventario y ventas por categoría
 */
export const getMainInfo = async (req, res) => {
    try {
        const { timeRange = 'month', startDate, endDate } = req.query;

        // Definir el rango de fechas basado en el parámetro timeRange
        let dateFilter = '';
        let params = [];

        if (startDate && endDate) {
            dateFilter = 'WHERE fecha_venta BETWEEN $1 AND $2';
            params = [startDate, endDate];
        } else {
            const today = new Date();
            let fromDate = new Date();

            switch (timeRange) {
                case 'week':
                    fromDate.setDate(today.getDate() - 7);
                    break;
                case 'month':
                    fromDate.setMonth(today.getMonth() - 1);
                    break;
                case 'year':
                    fromDate.setFullYear(today.getFullYear() - 1);
                    break;
                default:
                    fromDate.setMonth(today.getMonth() - 1); // Por defecto último mes
            }

            dateFilter = 'WHERE fecha_venta >= $1';
            params = [fromDate.toISOString().split('T')[0]];
        }

        // 1. Obtener datos de ventas mensuales
        const salesData = await getSalesData(dateFilter, params);

        // 2. Obtener productos más vendidos
        const topProductsData = await getTopProducts(dateFilter, params);

        // 3. Obtener movimientos de inventario
        const inventoryMovements = await getInventoryMovements(dateFilter, params);

        // 4. Obtener ventas por categoría
        const salesByCategory = await getSalesByCategory(dateFilter, params);

        // 5. Obtener historial de ventas
        const salesHistory = await getSalesHistory(dateFilter, params);

        // Calcular los cambios respecto al periodo anterior
        const currentPeriodData = await getCurrentVsPreviousPeriod(timeRange);

        res.status(200).json({
            salesData,
            topProductsData,
            inventoryMovements,
            salesByCategory,
            salesHistory,
            currentPeriodData
        });
    } catch (error) {
        console.error('Error al obtener información de análisis:', error);
        res.status(500).json({
            error: 'Error al obtener información de análisis',
            details: error.message
        });
    }
};

/**
 * Obtiene datos para las ventas mensuales/semanales
 */
async function getSalesData(dateFilter, params) {
    try {
        // Consulta para agrupar ventas por mes - adaptada para PostgreSQL
        const query = `
      SELECT 
        TO_CHAR(fecha_venta, 'YYYY-MM') AS periodo,
        TO_CHAR(fecha_venta, 'Month') AS month,
        SUM(total_venta) AS amount,
        COUNT(*) AS count
      FROM ventas
      ${dateFilter}
      GROUP BY TO_CHAR(fecha_venta, 'YYYY-MM'), TO_CHAR(fecha_venta, 'Month')
      ORDER BY periodo
    `;

        const { rows } = await pool.query(query, params);

        // Adaptar los nombres de los meses al español
        const mesesTraduccion = {
            'january': 'Enero',
            'february': 'Febrero',
            'march': 'Marzo',
            'april': 'Abril',
            'may': 'Mayo',
            'june': 'Junio',
            'july': 'Julio',
            'august': 'Agosto',
            'september': 'Septiembre',
            'october': 'Octubre',
            'november': 'Noviembre',
            'december': 'Diciembre'
        };

        return rows.map(row => ({
            ...row,
            amount: parseFloat(row.amount || 0),
            count: parseInt(row.count || 0),
            month: mesesTraduccion[row.month.toLowerCase().trim()] || row.month
        }));
    } catch (error) {
        console.error('Error al obtener datos de ventas mensuales:', error);
        throw error;
    }
}

/**
 * Obtiene los productos más vendidos
 */
async function getTopProducts(dateFilter, params) {
    try {
        // Actualizar la parte del WHERE para reemplazar correctamente 'fecha_venta' con 'v.fecha_venta'
        let updatedFilter = dateFilter;
        if (dateFilter.includes('fecha_venta')) {
            updatedFilter = dateFilter.replace('fecha_venta', 'v.fecha_venta');
            // También actualizar los números de parámetros si es necesario
            if (updatedFilter.includes('$1')) {
                updatedFilter = updatedFilter.replace('$1', '$1').replace('$2', '$2');
            }
        }

        const query = `
      SELECT 
        p.id_producto as id, 
        p.nombre AS name, 
        p.codigo_barras AS sku, 
        c.nombre_categoria AS category,
        COALESCE(SUM(dv.cantidad), 0) AS sales,
        COALESCE(SUM(dv.precio_unitario * dv.cantidad), 0) AS revenue
      FROM detalles_venta dv
      JOIN productos p ON dv.id_producto = p.id_producto
      JOIN ventas v ON dv.id_venta = v.id_venta
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      ${updatedFilter}
      GROUP BY p.id_producto, p.nombre, p.codigo_barras, c.nombre_categoria
      ORDER BY sales DESC
      LIMIT 5
    `;

        const { rows } = await pool.query(query, params);

        return rows.map(product => ({
            ...product,
            sales: parseInt(product.sales || 0),
            revenue: parseFloat(product.revenue || 0)
        }));
    } catch (error) {
        console.error('Error al obtener productos más vendidos:', error);
        throw error;
    }
}

/**
 * Obtiene movimientos de inventario (entradas y salidas)
 */
async function getInventoryMovements(dateFilter, params) {
    try {
        // Actualizar la parte del WHERE para reemplazar correctamente 'fecha_venta' con 'fecha_movimiento'
        let updatedFilter = dateFilter;
        if (dateFilter.includes('fecha_venta')) {
            updatedFilter = dateFilter.replace('fecha_venta', 'fecha_movimiento');
            // También actualizar los números de parámetros si es necesario
            if (updatedFilter.includes('$1')) {
                updatedFilter = updatedFilter.replace('$1', '$1').replace('$2', '$2');
            }
        }

        const query = `
      SELECT 
        tipo_movimiento AS type,
        COUNT(*) AS count
      FROM movimientos_inventario
      ${updatedFilter}
      GROUP BY tipo_movimiento
    `;

        const { rows } = await pool.query(query, params);

        // Calcular porcentajes
        const total = rows.reduce((sum, row) => sum + parseInt(row.count), 0);

        return rows.map(row => ({
            ...row,
            count: parseInt(row.count), // Asegurar que count sea un número
            percentage: Math.round((parseInt(row.count) / (total || 1)) * 100)
        }));
    } catch (error) {
        console.error('Error al obtener movimientos de inventario:', error);
        throw error;
    }
}

/**
 * Obtiene ventas agrupadas por categoría
 */
async function getSalesByCategory(dateFilter, params) {
    try {
        // Actualizar la parte del WHERE para reemplazar correctamente 'fecha_venta' con 'v.fecha_venta'
        let updatedFilter = dateFilter;
        if (dateFilter.includes('fecha_venta')) {
            updatedFilter = dateFilter.replace('fecha_venta', 'v.fecha_venta');
            // También actualizar los números de parámetros si es necesario
            if (updatedFilter.includes('$1')) {
                updatedFilter = updatedFilter.replace('$1', '$1').replace('$2', '$2');
            }
        }

        const query = `
      SELECT 
        c.id_categoria AS id,
        c.nombre_categoria AS category,
        COALESCE(SUM(dv.cantidad), 0) AS sales,
        COALESCE(SUM(dv.precio_unitario * dv.cantidad), 0) AS revenue
      FROM detalles_venta dv
      JOIN productos p ON dv.id_producto = p.id_producto
      JOIN categorias c ON p.id_categoria = c.id_categoria
      JOIN ventas v ON dv.id_venta = v.id_venta
      ${updatedFilter}
      GROUP BY c.id_categoria, c.nombre_categoria
      ORDER BY revenue DESC
    `;

        const { rows } = await pool.query(query, params);

        // Calcular porcentajes
        const totalRevenue = rows.reduce((sum, row) => sum + parseFloat(row.revenue || 0), 0);

        return rows.map(row => ({
            ...row,
            sales: parseInt(row.sales || 0), // Asegurar que sales sea un número
            revenue: parseFloat(row.revenue || 0), // Asegurar que revenue sea un número
            percentage: Math.round((parseFloat(row.revenue || 0) / (totalRevenue || 1)) * 100)
        }));
    } catch (error) {
        console.error('Error al obtener ventas por categoría:', error);
        throw error;
    }
}

/**
 * Obtiene el historial de ventas recientes
 */
async function getSalesHistory(dateFilter, params) {
    try {
        // Actualizar el nombre de la columna fecha a fecha_venta
        let updatedFilter = dateFilter;

        const query = `
      SELECT 
        v.id_venta AS id,
        v.fecha_venta AS date,
        p.nombre AS product,
        dv.cantidad AS quantity,
        (dv.precio_unitario * dv.cantidad) AS amount,
        'Cliente' AS customer  -- Placeholder para clientes si no existe la tabla
      FROM ventas v
      JOIN detalles_venta dv ON v.id_venta = dv.id_venta
      JOIN productos p ON dv.id_producto = p.id_producto
      ${updatedFilter}
      ORDER BY v.fecha_venta DESC
      LIMIT 10
    `;

        const { rows } = await pool.query(query, params);

        // Formatear las fechas a ISO y convertir a números
        return rows.map(row => ({
            ...row,
            quantity: parseInt(row.quantity || 0), // Asegurar que quantity sea un número
            amount: parseFloat(row.amount || 0), // Asegurar que amount sea un número
            date: row.date instanceof Date ? row.date.toISOString().split('T')[0] :
                (typeof row.date === 'string' ? row.date.split('T')[0] : row.date)
        }));
    } catch (error) {
        console.error('Error al obtener historial de ventas:', error);
        throw error;
    }
}

/**
 * Compara datos del periodo actual con el anterior
 */
async function getCurrentVsPreviousPeriod(timeRange) {
    try {
        const today = new Date();
        let currentStart, currentEnd, previousStart, previousEnd;

        switch (timeRange) {
            case 'week':
                // Periodo actual: última semana
                currentEnd = new Date(today);
                currentStart = new Date(today);
                currentStart.setDate(today.getDate() - 7);

                // Periodo anterior: semana anterior a la última
                previousEnd = new Date(currentStart);
                previousEnd.setDate(previousEnd.getDate() - 1);
                previousStart = new Date(previousEnd);
                previousStart.setDate(previousStart.getDate() - 7);
                break;

            case 'month':
            default:
                // Periodo actual: último mes
                currentEnd = new Date(today);
                currentStart = new Date(today);
                currentStart.setMonth(today.getMonth() - 1);

                // Periodo anterior: mes anterior al último
                previousEnd = new Date(currentStart);
                previousEnd.setDate(previousEnd.getDate() - 1);
                previousStart = new Date(previousEnd);
                previousStart.setMonth(previousStart.getMonth() - 1);
        }

        // Formatear fechas para SQL
        const formatDate = (date) => date.toISOString().split('T')[0];

        // Consultar datos para periodo actual - adaptada para PostgreSQL
        const currentQuery = `
      SELECT 
        COALESCE(SUM(total_venta), 0) AS "totalSales",
        COUNT(*) AS "orderCount",
        CASE 
          WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_venta) / COUNT(*), 0)
          ELSE 0
        END AS "avgTicket",
        COUNT(DISTINCT p.id_categoria) AS "categoryCount"
      FROM ventas v
      JOIN detalles_venta dv ON v.id_venta = dv.id_venta
      JOIN productos p ON dv.id_producto = p.id_producto
      WHERE v.fecha_venta BETWEEN $1 AND $2
    `;

        const currentResult = await pool.query(currentQuery, [formatDate(currentStart), formatDate(currentEnd)]);

        // Consultar datos para periodo anterior - adaptada para PostgreSQL
        const previousQuery = `
      SELECT 
        COALESCE(SUM(total_venta), 0) AS "totalSales",
        COUNT(*) AS "orderCount",
        CASE 
          WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_venta) / COUNT(*), 0)
          ELSE 0
        END AS "avgTicket",
        COUNT(DISTINCT p.id_categoria) AS "categoryCount"
      FROM ventas v
      JOIN detalles_venta dv ON v.id_venta = dv.id_venta
      JOIN productos p ON dv.id_producto = p.id_producto
      WHERE v.fecha_venta BETWEEN $1 AND $2
    `;

        const previousResult = await pool.query(previousQuery, [formatDate(previousStart), formatDate(previousEnd)]);

        // Extraer datos de los resultados
        const current = currentResult.rows[0] || {
            totalSales: 0,
            orderCount: 0,
            avgTicket: 0,
            categoryCount: 0
        };

        const previous = previousResult.rows[0] || {
            totalSales: 0,
            orderCount: 0,
            avgTicket: 0,
            categoryCount: 0
        };

        // Convertir campos a números
        const convertToNumber = (obj) => {
            return {
                totalSales: parseFloat(obj.totalSales || 0),
                orderCount: parseInt(obj.orderCount || 0),
                avgTicket: parseFloat(obj.avgTicket || 0),
                categoryCount: parseInt(obj.categoryCount || 0),
            };
        };

        const currentData = convertToNumber(current);
        const previousData = convertToNumber(previous);

        // Calcular porcentajes de cambio
        const calculateChange = (current, previous) => {
            if (!previous || previous === 0) return 100; // Si no hay datos previos, el cambio es 100%
            return ((current - previous) / previous) * 100;
        };

        return {
            current: currentData,
            previous: previousData,
            changes: {
                totalSales: calculateChange(currentData.totalSales, previousData.totalSales),
                orderCount: calculateChange(currentData.orderCount, previousData.orderCount),
                avgTicket: calculateChange(currentData.avgTicket, previousData.avgTicket),
                categoryCount: calculateChange(currentData.categoryCount, previousData.categoryCount)
            }
        };
    } catch (error) {
        console.error('Error al comparar periodos:', error);
        throw error;
    }
}

/**
 * Obtiene estadísticas de ventas por día/semana/mes específico
 */
export const getSalesStats = async (req, res) => {
    try {
        const { timeUnit = 'day', date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Se requiere fecha para las estadísticas' });
        }

        let startDate, endDate;
        const targetDate = new Date(date);

        switch (timeUnit) {
            case 'day':
                startDate = new Date(targetDate);
                endDate = new Date(targetDate);
                endDate.setDate(endDate.getDate() + 1);
                break;

            case 'week':
                // Encontrar el primer día de la semana (domingo)
                const dayOfWeek = targetDate.getDay();
                startDate = new Date(targetDate);
                startDate.setDate(targetDate.getDate() - dayOfWeek);
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 7);
                break;

            case 'month':
                startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
                endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
                break;
        }

        // Formatear fechas para la consulta
        const formatDate = (date) => date.toISOString().split('T')[0];

        // Consulta adaptada para PostgreSQL
        const query = `
      SELECT 
        COALESCE(SUM(total_venta), 0) AS "totalSales",
        COUNT(*) AS "orderCount",
        CASE 
          WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_venta) / COUNT(*), 0)
          ELSE 0
        END AS "avgTicket"
      FROM ventas
      WHERE fecha_venta BETWEEN $1 AND $2
    `;

        const { rows } = await pool.query(query, [formatDate(startDate), formatDate(endDate)]);

        // Obtener datos del mismo periodo en el periodo anterior para comparación
        let prevStartDate, prevEndDate;

        switch (timeUnit) {
            case 'day':
                prevStartDate = new Date(startDate);
                prevStartDate.setDate(prevStartDate.getDate() - 1);
                prevEndDate = new Date(endDate);
                prevEndDate.setDate(prevEndDate.getDate() - 1);
                break;

            case 'week':
                prevStartDate = new Date(startDate);
                prevStartDate.setDate(prevStartDate.getDate() - 7);
                prevEndDate = new Date(endDate);
                prevEndDate.setDate(prevEndDate.getDate() - 7);
                break;

            case 'month':
                prevStartDate = new Date(startDate);
                prevStartDate.setMonth(prevStartDate.getMonth() - 1);
                prevEndDate = new Date(endDate);
                prevEndDate.setMonth(prevEndDate.getMonth() - 1);
                break;
        }

        const prevResult = await pool.query(query, [formatDate(prevStartDate), formatDate(prevEndDate)]);

        // Extraer datos de los resultados
        const current = result.rows[0] || {
            totalSales: 0,
            orderCount: 0,
            avgTicket: 0
        };

        const previous = prevResult.rows[0] || {
            totalSales: 0,
            orderCount: 0,
            avgTicket: 0
        };

        // Convertir campos a números
        const convertToNumber = (obj) => {
            return {
                totalSales: parseFloat(obj.totalSales || 0),
                orderCount: parseInt(obj.orderCount || 0),
                avgTicket: parseFloat(obj.avgTicket || 0)
            };
        };

        const currentData = convertToNumber(current);
        const previousData = convertToNumber(previous);

        // Calcular cambios
        const calculateChange = (current, previous) => {
            if (!previous || previous === 0) return 100;
            return ((current - previous) / previous) * 100;
        };

        const changes = {
            totalSales: calculateChange(currentData.totalSales, previousData.totalSales),
            orderCount: calculateChange(currentData.orderCount, previousData.orderCount),
            avgTicket: calculateChange(currentData.avgTicket, previousData.avgTicket)
        };

        res.status(200).json({
            current: currentData,
            previous: previousData,
            changes,
            period: {
                start: formatDate(startDate),
                end: formatDate(endDate),
                unit: timeUnit
            }
        });
    } catch (error) {
        console.error('Error al obtener estadísticas de ventas:', error);
        res.status(500).json({
            error: 'Error al obtener estadísticas de ventas',
            details: error.message
        });
    }
};

/**
 * Obtiene datos detallados de productos para la pestaña de productos
 */
export const getProductsAnalysis = async (req, res) => {
    try {
        const { timeRange = 'month', startDate, endDate, category } = req.query;

        // Definir el rango de fechas basado en el parámetro timeRange
        let dateFilter = '';
        let params = [];
        let paramCounter = 1; // Contador para los parámetros numerados en PostgreSQL

        if (startDate && endDate) {
            dateFilter = `WHERE v.fecha_venta BETWEEN $${paramCounter} AND $${paramCounter + 1}`;
            params.push(startDate, endDate);
            paramCounter += 2;
        } else {
            const today = new Date();
            let fromDate = new Date();

            switch (timeRange) {
                case 'week':
                    fromDate.setDate(today.getDate() - 7);
                    break;
                case 'month':
                    fromDate.setMonth(today.getMonth() - 1);
                    break;
                case 'year':
                    fromDate.setFullYear(today.getFullYear() - 1);
                    break;
                default:
                    fromDate.setMonth(today.getMonth() - 1);
            }

            dateFilter = `WHERE v.fecha_venta >= $${paramCounter}`;
            params.push(fromDate.toISOString().split('T')[0]);
            paramCounter++;
        }

        // Agregar filtro de categoría si se proporciona
        if (category) {
            dateFilter += dateFilter ? ` AND c.id_categoria = $${paramCounter}` : `WHERE c.id_categoria = $${paramCounter}`;
            params.push(category);
            paramCounter++;
        }

        // Obtener datos detallados de productos - adaptado para PostgreSQL
        // Simplificamos la consulta para evitar el LAG que puede causar problemas
        const query = `
      SELECT 
        p.id_producto AS id, 
        p.nombre AS name, 
        p.codigo_barras AS sku, 
        c.nombre_categoria AS category,
        COALESCE(SUM(dv.cantidad), 0) AS sales,
        COALESCE(SUM(dv.precio_unitario * dv.cantidad), 0) AS revenue,
        p.stock_actual AS stock,
        'up' AS trend
      FROM productos p
      LEFT JOIN detalles_venta dv ON p.id_producto = dv.id_producto
      LEFT JOIN ventas v ON dv.id_venta = v.id_venta
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      ${dateFilter}
      GROUP BY p.id_producto, p.nombre, p.codigo_barras, c.nombre_categoria, p.stock_actual
      ORDER BY sales DESC
    `;

        const productsResult = await pool.query(query, params);

        // Obtener análisis por categoría - adaptado para PostgreSQL
        // Reiniciar el contador para los parámetros
        paramCounter = 1;
        let categoryFilter = dateFilter.replace('WHERE', 'WHERE v.id_venta IS NOT NULL AND');

        const categoryQuery = `
      SELECT 
        c.id_categoria AS id,
        c.nombre_categoria AS category,
        COUNT(DISTINCT p.id_producto) AS "productCount",
        COALESCE(SUM(dv.cantidad), 0) AS sales,
        COALESCE(SUM(dv.precio_unitario * dv.cantidad), 0) AS revenue
      FROM categorias c
      LEFT JOIN productos p ON c.id_categoria = p.id_categoria
      LEFT JOIN detalles_venta dv ON p.id_producto = dv.id_producto
      LEFT JOIN ventas v ON dv.id_venta = v.id_venta
      ${categoryFilter}
      GROUP BY c.id_categoria, c.nombre_categoria
      ORDER BY revenue DESC
    `;

        const categoriesResult = await pool.query(categoryQuery, params);

        // Convertir datos a números 
        const products = productsResult.rows.map(product => ({
            ...product,
            sales: parseInt(product.sales || 0),
            revenue: parseFloat(product.revenue || 0),
            stock: parseInt(product.stock || 0)
        }));

        const categories = categoriesResult.rows.map(category => ({
            ...category,
            productCount: parseInt(category.productCount || 0),
            sales: parseInt(category.sales || 0),
            revenue: parseFloat(category.revenue || 0)
        }));

        // Calcular porcentajes para categorías
        const totalRevenue = categories.reduce((sum, cat) => sum + cat.revenue, 0);

        const categoriesWithPercentage = categories.map(cat => ({
            ...cat,
            percentage: totalRevenue ? Math.round((cat.revenue / totalRevenue) * 100) : 0
        }));

        res.status(200).json({
            products,
            categories: categoriesWithPercentage
        });
    } catch (error) {
        console.error('Error al obtener análisis de productos:', error);
        res.status(500).json({
            error: 'Error al obtener análisis de productos',
            details: error.message
        });
    }
};

/**
 * Busca en el historial de ventas
 */
export const searchSalesHistory = async (req, res) => {
    try {
        const { searchTerm, startDate, endDate, limit = 50 } = req.query;

        let whereClause = '';
        let params = [];
        let paramCounter = 1; // Contador para los parámetros numerados en PostgreSQL

        // Filtro por fecha
        if (startDate && endDate) {
            whereClause = `WHERE v.fecha_venta BETWEEN $${paramCounter} AND $${paramCounter + 1}`;
            params.push(startDate, endDate);
            paramCounter += 2;
        }

        // Filtro por término de búsqueda
        if (searchTerm) {
            const searchWhere = `(p.nombre ILIKE $${paramCounter} OR v.id_venta::text ILIKE $${paramCounter})`;
            whereClause = whereClause
                ? `${whereClause} AND ${searchWhere}`
                : `WHERE ${searchWhere}`;

            params.push(`%${searchTerm}%`);
            paramCounter += 1;
        }

        // Agregar parámetro para el límite
        params.push(Number(limit));

        const query = `
      SELECT 
        v.id_venta AS id,
        v.fecha_venta AS date,
        p.nombre AS product,
        dv.cantidad AS quantity,
        (dv.precio_unitario * dv.cantidad) AS amount,
        u.nombre_usuario AS vendedor
      FROM ventas v
      JOIN detalles_venta dv ON v.id_venta = dv.id_venta
      JOIN productos p ON dv.id_producto = p.id_producto
      JOIN usuarios u ON v.id_usuario = u.id_usuario
      ${whereClause}
      ORDER BY v.fecha_venta DESC
      LIMIT $${paramCounter}
    `;

        const result = await pool.query(query, params);

        // Formatear las fechas y convertir a números
        const formattedRows = result.rows.map(row => ({
            ...row,
            quantity: parseInt(row.quantity || 0),
            amount: parseFloat(row.amount || 0),
            date: row.date instanceof Date ? row.date.toISOString().split('T')[0] :
                (typeof row.date === 'string' ? row.date.split('T')[0] : row.date)
        }));

        res.status(200).json(formattedRows);
    } catch (error) {
        console.error('Error al buscar en el historial de ventas:', error);
        res.status(500).json({
            error: 'Error al buscar en el historial de ventas',
            details: error.message
        });
    }
};

/**
 * Exporta datos de ventas en formato CSV
 */
export const exportSalesData = async (req, res) => {
    try {
        const { startDate, endDate, format = 'csv' } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Se requieren fechas de inicio y fin' });
        }

        // Consulta para exportar datos - adaptada para PostgreSQL
        const query = `
      SELECT 
        v.id_venta AS "ID Venta",
        TO_CHAR(v.fecha_venta, 'YYYY-MM-DD') AS "Fecha",
        u.nombre_usuario AS "Vendedor",
        p.nombre AS "Producto",
        p.codigo_barras AS "SKU",
        cat.nombre_categoria AS "Categoría",
        dv.cantidad AS "Cantidad",
        dv.precio_unitario AS "Precio Unitario",
        (dv.precio_unitario * dv.cantidad) AS "Total"
      FROM ventas v
      JOIN detalles_venta dv ON v.id_venta = dv.id_venta
      JOIN productos p ON dv.id_producto = p.id_producto
      JOIN usuarios u ON v.id_usuario = u.id_usuario
      LEFT JOIN categorias cat ON p.id_categoria = cat.id_categoria
      WHERE v.fecha_venta BETWEEN $1 AND $2
      ORDER BY v.fecha_venta DESC
    `;

        const { rows } = await pool.query(query, [startDate, endDate]);

        // Si no hay datos, enviar una respuesta vacía
        if (rows.length === 0) {
            return res.status(404).json({ message: 'No hay datos para exportar en el rango seleccionado' });
        }

        // Por ahora solo soportamos CSV
        if (format.toLowerCase() === 'csv') {
            // Generar CSV
            const campos = Object.keys(rows[0]);
            const csvHeader = campos.join(',') + '\n';

            const csvRows = rows.map(row => {
                return campos.map(campo => {
                    // Escapar comillas y formatear según el tipo de dato
                    const valor = row[campo] !== null ? row[campo] : '';
                    if (typeof valor === 'string') {
                        // Escapar comillas y envolver en comillas
                        return `"${valor.replace(/"/g, '""')}"`;
                    }
                    return valor;
                }).join(',');
            }).join('\n');

            const csv = csvHeader + csvRows;

            // Configurar la respuesta como un archivo CSV para descargar
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="ventas_${startDate}_a_${endDate}.csv"`);

            return res.status(200).send(csv);
        }

        // Si se solicita otro formato que no soportamos
        return res.status(400).json({ error: 'Formato no soportado' });
    } catch (error) {
        console.error('Error al exportar datos:', error);
        res.status(500).json({
            error: 'Error al exportar datos',
            details: error.message
        });
    }
};