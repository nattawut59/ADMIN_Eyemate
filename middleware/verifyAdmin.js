const jwt = require('jsonwebtoken');

// Middleware สำหรับตรวจสอบ admin (รวม authentication + authorization)
const verifyAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'ไม่พบ token กรุณา login ใหม่',
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7);

    // ใช้ synchronous verify เพื่อให้แน่ใจว่า req.user ถูกตั้งค่าก่อน next()
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'ไม่มีสิทธิ์เข้าถึง - เฉพาะ admin เท่านั้น',
          error: 'Insufficient permissions'
        });
      }

      // ตั้งค่า req.user
      req.user = decoded;
      
      // Debug log
      console.log('✅ Token decoded successfully:', decoded);
      
      next();

    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Token หมดอายุหรือไม่ถูกต้อง กรุณา login ใหม่',
        error: jwtError.message
      });
    }

  } catch (error) {
    console.error('❌ Verify Admin Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = verifyAdmin;