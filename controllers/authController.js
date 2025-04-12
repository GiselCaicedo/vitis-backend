import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

// Login de usuario
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(req.body)
    // Buscar el usuario por correo o nombre de usuario
    const query = `
      SELECT 
        id_usuario, 
        nombre_usuario, 
        contraseña, 
        rol,
        correo
      FROM 
        usuarios 
      WHERE 
        correo = $1 OR nombre_usuario = $1
    `;

    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    console.log('Contraseña ingresada:', password);
    console.log('Hash almacenado:', user.contraseña);
    console.log('Resultado de la comparación:', await bcrypt.compare(password, user.contraseña));
    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.contraseña);
    if (!validPassword) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: user.id_usuario,
        username: user.nombre_usuario,
        rol: user.rol
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Establecer cookie con el token
    res.cookie('cookieKey', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 día
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    // Actualizar último acceso
    await pool.query(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = $1',
      [user.id_usuario]
    );

    // Devolver datos del usuario
    res.status(200).json({
      id: user.id_usuario,
      user: user.nombre_usuario,
      rol: user.rol,
      token
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

export const generatePasswordHash = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'La contraseña es requerida' });
    }

    // Generar hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    res.status(200).json({
      message: 'Hash generado correctamente',
      hashedPassword
    });
  } catch (error) {
    console.error('Error al generar hash:', error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};
