// middleware/auditLogger.js
const pool = require('../config/database');

/**
 * Middleware สำหรับบันทึก audit logs
 */
const auditLogger = (action, entityType = null) => {
  return async (req, res, next) => {
    // เก็บ original response.json
    const originalJson = res.json.bind(res);
    
    // Override res.json เพื่อจับ response
    res.json = async (data) => {
      try {
        // บันทึก log ก็ต่อเมื่อสำเร็จ (status 2xx)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const logId = 'LOG' + Date.now();
          
          await pool.execute(
            `INSERT INTO AuditLogs 
              (log_id, user_id, action, entity_type, entity_id, ip_address, user_agent, details, status, severity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              logId,
              req.user?.userId || null,
              action,
              entityType,
              req.params?.id || req.body?.id || null,
              req.ip || req.connection.remoteAddress,
              req.headers['user-agent'] || null,
              JSON.stringify({
                method: req.method,
                url: req.originalUrl,
                body: req.body,
                params: req.params,
                query: req.query
              }),
              'success',
              determineSeverity(action)
            ]
          );
        }
      } catch (error) {
        console.error('❌ Audit log error:', error);
        // ไม่ให้ audit log error ทำให้ request fail
      }
      
      // ส่ง response ปกติ
      return originalJson(data);
    };
    
    next();
  };
};

/**
 * กำหนดระดับความสำคัญ
 */
function determineSeverity(action) {
  const HIGH_SEVERITY = ['DELETE_USER', 'UPDATE_USER_ROLE', 'SUSPEND_USER'];
  const MEDIUM_SEVERITY = ['CREATE_USER', 'APPROVE_RESCHEDULE', 'DELETE_MEDICINE'];
  
  if (HIGH_SEVERITY.includes(action)) return 'critical';
  if (MEDIUM_SEVERITY.includes(action)) return 'warning';
  return 'info';
}

module.exports = auditLogger;