const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../config/database');

/**
 * =============================================
 * Session Helper Functions
 * =============================================
 */

// สร้าง Session ID
const generateSessionId = () => {
  const timestamp = Date.now().toString().slice(-8); // เอา 8 หลักสุดท้าย
  const random = Math.random().toString(36).substr(2, 6); // 6 ตัวอักษร
  return `SES${timestamp}${random}`; // ความยาวรวม = 3 + 8 + 6 = 17 ตัวอักษร
};

// สร้าง Log ID
const generateLogId = () => {
  const timestamp = Date.now().toString().slice(-8); // เอา 8 หลักสุดท้าย
  const random = Math.random().toString(36).substr(2, 6); // 6 ตัวอักษร
  return `LOG${timestamp}${random}`; // ความยาวรวม = 3 + 8 + 6 = 17 ตัวอักษร
};

// บันทึก Session ลง Database
const createSession = async (connection, userId, token, req) => {
  try {
    const sessionId = generateSessionId();
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    
    // Token หมดอายุใน 7 วัน
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await connection.execute(
      `INSERT INTO UserSessions 
       (session_id, user_id, token, device_info, ip_address, created_at, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, 1)`,
      [sessionId, userId, token, deviceInfo, ipAddress, expiresAt]
    );

    console.log(`✅ Session created: ${sessionId} for user: ${userId}`);
    return sessionId;

  } catch (error) {
    console.error('❌ Error creating session:', error);
    // ไม่ throw error เพื่อไม่ให้กระทบ login process
  }
};

// บันทึก Login Log
const logLogin = async (connection, userId, status, req) => {
  try {
    const logId = generateLogId();
    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown User Agent';

    await connection.execute(
      `INSERT INTO AuditLogs 
       (log_id, user_id, action, action_time, ip_address, user_agent, status, severity)
       VALUES (?, ?, 'login', NOW(), ?, ?, ?, 'info')`,
      [logId, userId, ipAddress, userAgent, status]
    );

    console.log(`📝 Login logged: ${userId} - ${status}`);

  } catch (error) {
    console.error('❌ Error logging login:', error);
    // ไม่ throw error เพื่อไม่ให้กระทบ login process
  }
};

/**
 * Admin Login Controller
 * ตรวจสอบ credentials และสร้าง JWT token
 */
const adminLogin = async (req, res) => {
  let connection;
  
  try {
    // ========== Express Validator Errors ==========
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'ข้อมูลไม่ถูกต้อง',
        errors: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }

    const { username, password } = req.body;

    // ========== Validation ==========
    // ตรวจสอบว่ามี username และ password
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก username และ password',
        error: 'Missing required fields'
      });
    }

    // ตรวจสอบความยาว
    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'username หรือ password ไม่ถูกต้อง',
        error: 'Invalid credentials format'
      });
    }

    // ========== Database Query ==========
    connection = await pool.getConnection();

    // ดึงข้อมูล admin จาก table users
    const [users] = await connection.execute(
      `SELECT 
        user_id,
        username,
        password_hash,
        role,
        status,
        phone,
        last_login
      FROM users 
      WHERE username = ? AND role = 'admin'`,
      [username]
    );

    // ========== User Validation ==========
    // ตรวจสอบว่าพบ user หรือไม่
    if (users.length === 0) {
      // บันทึก failed login attempt
      if (connection) {
        await logLogin(connection, null, 'failed', req);
      }
      
      return res.status(401).json({
        success: false,
        message: 'username หรือ password ไม่ถูกต้อง',
        error: 'Invalid credentials'
      });
    }

    const admin = users[0];

    // Debug log - ตรวจสอบข้อมูลจาก database
    console.log('🔍 =================================');
    console.log('🔍 Admin from DB:', JSON.stringify(admin, null, 2));
    console.log('🔍 admin.user_id:', admin.user_id);
    console.log('🔍 typeof admin.user_id:', typeof admin.user_id);
    console.log('🔍 =================================');

    // ตรวจสอบสถานะบัญชี
    if (admin.status !== 'active') {
      // บันทึก failed login attempt (account suspended)
      await logLogin(connection, admin.user_id, 'failed', req);
      
      return res.status(403).json({
        success: false,
        message: 'บัญชีของคุณถูกระงับ กรุณาติดต่อผู้ดูแลระบบ',
        error: `Account status: ${admin.status}`
      });
    }

    // ========== Password Verification ==========
    // เปรียบเทียบ password กับ hash ในฐานข้อมูล
    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);

    if (!isPasswordValid) {
      // บันทึก failed login attempt (wrong password)
      await logLogin(connection, admin.user_id, 'failed', req);
      
      return res.status(401).json({
        success: false,
        message: 'username หรือ password ไม่ถูกต้อง',
        error: 'Invalid credentials'
      });
    }

    // ========== Generate JWT Token ==========
    // สร้าง payload สำหรับ JWT
    const tokenPayload = {
      userId: admin.user_id,
      username: admin.username,
      role: admin.role
    };

    // Debug log - ตรวจสอบ payload
    console.log('🔍 JWT Payload:', JSON.stringify(tokenPayload, null, 2));
    console.log('🔍 admin.user_id:', admin.user_id);

    // สร้าง token
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // ========== บันทึก Session และ Login Log ==========
    // สร้าง Session ใหม่
    await createSession(connection, admin.user_id, token, req);
    
    // บันทึก Login Log
    await logLogin(connection, admin.user_id, 'success', req);

    // ========== Update Last Login ==========
    // บันทึกเวลา login ล่าสุด
    await connection.execute(
      'UPDATE users SET last_login = NOW() WHERE user_id = ?',
      [admin.user_id]
    );

    console.log('✅ Login successful for user:', admin.username);

    // ========== Success Response ==========
    return res.status(200).json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      data: {
        token,
        admin: {
          userId: admin.user_id,
          username: admin.username,
          role: admin.role,
          phone: admin.phone,
          lastLogin: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ Admin Login Error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
    
  } finally {
    // ปล่อย connection กลับไปที่ pool
    if (connection) {
      connection.release();
    }
  }
};

/**
 * Verify Token Controller
 * ตรวจสอบว่า token ยังใช้งานได้อยู่หรือไม่
 */
const verifyToken = async (req, res) => {
  try {
    // token ถูกตรวจสอบแล้วใน middleware
    // ส่งข้อมูล admin กลับไป
    return res.status(200).json({
      success: true,
      message: 'Token ถูกต้อง',
      data: {
        admin: {
          userId: req.user.userId,
          username: req.user.username,
          role: req.user.role
        }
      }
    });
  } catch (error) {
    console.error('❌ Verify Token Error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบ token',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  adminLogin,
  verifyToken
};