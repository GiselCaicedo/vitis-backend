import nodemailer from 'nodemailer';
import { pool } from '../config/db.js';

// Función para obtener resumen de stock crítico
export const getStockSummary = async () => {
  try {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE p.Stock_actual <= p.Stock_minimo) AS productos_criticos,
        COUNT(*) FILTER (WHERE p.Stock_actual = 0) AS productos_agotados,
        COUNT(*) FILTER (WHERE p.Stock_actual <= p.Stock_minimo * 1.2 AND p.Stock_actual > p.Stock_minimo) AS productos_proximamente_criticos,
        COUNT(*) AS total_productos
      FROM 
        Productos p
    `;

    const result = await pool.query(query);
    return result.rows[0];
  } catch (error) {
    console.error('Error al obtener resumen de stock:', error);
    throw error;
  }
};

// Función para obtener productos con stock crítico
export const getCriticalProducts = async () => {
  try {
    const query = `
      SELECT 
        p.Nombre AS producto,
        p.Stock_actual,
        p.Stock_minimo,
        c.Nombre_categoria AS categoria,
        CASE 
          WHEN p.Stock_actual = 0 THEN 'AGOTADO'
          WHEN p.Stock_actual <= p.Stock_minimo THEN 'CRÍTICO'
          ELSE 'BAJO'
        END AS estado_stock
      FROM 
        Productos p
      LEFT JOIN 
        Categorias c ON p.ID_categoria = c.ID_categoria
      WHERE 
        p.Stock_actual <= p.Stock_minimo * 1.2
      ORDER BY 
        CASE 
          WHEN p.Stock_actual = 0 THEN 1
          WHEN p.Stock_actual <= p.Stock_minimo THEN 2
          ELSE 3
        END,
        p.Stock_actual ASC
      LIMIT 10
    `;

    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error al obtener productos críticos:', error);
    throw error;
  }
};

// Función para generar el HTML del correo
const generateEmailHTML = (summary, products) => {
  const productRows = products.map(product => `
    <tr style="border-bottom: 1px solid #e0e0e0;">
      <td style="padding: 8px; text-align: left;">${product.producto}</td>
      <td style="padding: 8px; text-align: center;">${product.categoria || 'Sin categoría'}</td>
      <td style="padding: 8px; text-align: center;">${product.stock_actual}</td>
      <td style="padding: 8px; text-align: center;">${product.stock_minimo}</td>
      <td style="padding: 8px; text-align: center;">
        <span style="
          padding: 4px 8px; 
          border-radius: 4px; 
          font-size: 12px; 
          font-weight: bold;
          color: white;
          background-color: ${product.estado_stock === 'AGOTADO' ? '#dc2626' : 
                             product.estado_stock === 'CRÍTICO' ? '#ea580c' : '#d97706'};
        ">
          ${product.estado_stock}
        </span>
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Alerta de Stock - Vitis Store</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 24px;">Alerta de Stock - Vitis Store</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Resumen diario del inventario</p>
      </div>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #495057; margin-top: 0;">Resumen General</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
          <div style="background: white; padding: 15px; border-radius: 6px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${summary.productos_agotados}</div>
            <div style="font-size: 12px; color: #6b7280;">Productos Agotados</div>
          </div>
          <div style="background: white; padding: 15px; border-radius: 6px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="font-size: 24px; font-weight: bold; color: #ea580c;">${summary.productos_criticos}</div>
            <div style="font-size: 12px; color: #6b7280;">Stock Crítico</div>
          </div>
          <div style="background: white; padding: 15px; border-radius: 6px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="font-size: 24px; font-weight: bold; color: #d97706;">${summary.productos_proximamente_criticos}</div>
            <div style="font-size: 12px; color: #6b7280;">Próximos a Crítico</div>
          </div>
          <div style="background: white; padding: 15px; border-radius: 6px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="font-size: 24px; font-weight: bold; color: #059669;">${summary.total_productos}</div>
            <div style="font-size: 12px; color: #6b7280;">Total Productos</div>
          </div>
        </div>
      </div>

      ${products.length > 0 ? `
      <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #495057; margin: 0; padding: 20px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0;">
          Productos que Requieren Atención (Top 3)
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f1f3f4;">
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #495057;">Producto</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #495057;">Categoría</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #495057;">Stock Actual</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #495057;">Stock Mínimo</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #495057;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
        </table>
      </div>
      ` : ''}

      <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          📧 Este es un reporte automático generado por el sistema de inventario de Vitis Store<br>
          📅 Generado el: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
        </p>
      </div>
    </body>
    </html>
  `;
};

// Función principal para enviar alerta de stock - VERSIÓN GMAIL CORREGIDA
export const sendStockAlert = async () => {
  try {
    console.log('🔄 Iniciando envío de alerta de stock...');
    
    // Verificar que tenemos las variables de entorno
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error('Faltan variables de entorno EMAIL_USER y EMAIL_PASS');
    }
    
    console.log('📧 Usuario configurado:', process.env.EMAIL_USER);
    console.log('🔑 Contraseña configurada:', process.env.EMAIL_PASS ? '***configurada***' : 'NO CONFIGURADA');
    
    // Configurar transporter con Gmail
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true para 465, false para otros puertos
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // Verificar la conexión
    console.log('🔌 Verificando conexión con Gmail...');
    await transporter.verify();
    console.log('✅ Conexión con Gmail exitosa');
    
    // Obtener datos de la base de datos
    const [summary, products] = await Promise.all([
      getStockSummary(),
      getCriticalProducts()
    ]);

    console.log('📊 Resumen obtenido:', summary);
    console.log('📦 Productos críticos encontrados:', products.length);

    // Verificar si hay productos críticos
    const totalCritical = parseInt(summary.productos_criticos || 0) + parseInt(summary.productos_agotados || 0);

    if (totalCritical === 0) {
      console.log('✅ No hay productos críticos. Se enviará un reporte general.');
    }

    // Configurar el correo
    const mailOptions = {
      from: `"Vitis Store - Sistema de Inventario" <${process.env.EMAIL_USER}>`,
      to: process.env.ALERT_EMAIL || 'gcaicedo43@uan.edu.co',
      subject: totalCritical > 0
        ? `🚨 Alerta de Stock - ${totalCritical} productos requieren atención`
        : `📊 Reporte de Stock - Todo en orden`,
      html: generateEmailHTML(summary, products)
    };

    // Enviar correo
    console.log('📤 Enviando correo a:', mailOptions.to);
    const info = await transporter.sendMail(mailOptions);

    console.log('✅ Alerta de stock enviada exitosamente a Gmail!');
    console.log('📧 Message ID:', info.messageId);

    return {
      success: true,
      message: 'Alerta enviada exitosamente a Gmail',
      messageId: info.messageId,
      recipient: mailOptions.to,
      summary: summary,
      totalProducts: products.length
    };

  } catch (error) {
    console.error('❌ Error al enviar alerta de stock:', error);
    
    // Ayuda específica para errores comunes
    if (error.message.includes('Invalid login') || error.code === 'EAUTH') {
      console.log('💡 Problema de autenticación detectado');
      console.log('🔧 Verifica que:');
      console.log('   - La contraseña de aplicación esté correcta (16 caracteres)');
      console.log('   - Tengas activada la verificación en 2 pasos');
      console.log('   - El email sea correcto');
    }
    
    throw error;
  }
};