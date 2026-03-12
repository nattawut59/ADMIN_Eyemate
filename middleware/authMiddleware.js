const jwt = require('jsonwebtoken');
const db = require('../config/database'); 


const verifyToken = async (req, res, next) => {
  try {
    // ดึง token จาก Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'ไม่พบ token หรือ token ไม่ถูกต้อง'
      });
    }
    
    // แยก token ออกจาก "Bearer "
    const token = authHeader.substring(7);
    
    // ตรวจสอบและ decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ตรวจสอบว่า user ยังมีอยู่ในระบบและ active
    const [users] = await db.query(
      'SELECT user_id, username, role, status FROM users WHERE user_id = ?',
      [decoded.userId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'ไม่พบผู้ใช้งานในระบบ'
      });
    }
    
    const user = users[0];
    
    // ตรวจสอบสถานะผู้ใช้
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'บัญชีผู้ใช้ถูกระงับหรือไม่สามารถใช้งานได้'
      });
    }
    
    // เก็บข้อมูล user ไว้ใน req สำหรับใช้ใน controller
    req.user = {
      userId: user.user_id,
      username: user.username,
      role: user.role
    };
    
    next();
    
  } catch (error) {
    console.error('Error in verifyToken:', error);
    
    // จัดการ error ต่างๆ
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token ไม่ถูกต้อง'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token หมดอายุ กรุณา login ใหม่'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบ token',
      error: error.message
    });
  }
};

/**
 * Middleware: ตรวจสอบว่าเป็น Admin
 * ใช้หลังจาก verifyToken
 */
const checkAdmin = (req, res, next) => {
  try {
    // ตรวจสอบว่ามี user object จาก verifyToken หรือไม่
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'กรุณา login ก่อนเข้าใช้งาน'
      });
    }
    
    // ตรวจสอบ role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (Admin only)'
      });
    }
    
    next();
    
  } catch (error) {
    console.error('Error in checkAdmin:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์',
      error: error.message
    });
  }
};

/**
 * Middleware: ตรวจสอบว่าเป็น Doctor
 * ใช้หลังจาก verifyToken
 */
const checkDoctor = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'กรุณา login ก่อนเข้าใช้งาน'
      });
    }
    
    if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (Doctor/Admin only)'
      });
    }
    
    next();
    
  } catch (error) {
    console.error('Error in checkDoctor:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์',
      error: error.message
    });
  }
};

/**
 * Middleware: ตรวจสอบว่าเป็น Patient
 * ใช้หลังจาก verifyToken
 */
const checkPatient = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'กรุณา login ก่อนเข้าใช้งาน'
      });
    }
    
    if (req.user.role !== 'patient') {
      return res.status(403).json({
        success: false,
        message: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (Patient only)'
      });
    }
    
    next();
    
  } catch (error) {
    console.error('Error in checkPatient:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์',
      error: error.message
    });
  }
};

/**
 * Middleware: อนุญาตหลายบทบาท
 * ใช้หลังจาก verifyToken
 * @param {Array} roles - array ของ roles ที่อนุญาต เช่น ['admin', 'doctor']
 */
const checkRoles = (roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'กรุณา login ก่อนเข้าใช้งาน'
        });
      }
      
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (ต้องเป็น: ${roles.join(' หรือ ')})`
        });
      }
      
      next();
      
    } catch (error) {
      console.error('Error in checkRoles:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์',
        error: error.message
      });
    }
  };
};

module.exports = {
  verifyToken,
  checkAdmin,
  checkDoctor,
  checkPatient,
  checkRoles
};