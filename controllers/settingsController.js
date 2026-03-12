const pool = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * =============================================
 * Settings Controller
 * =============================================
 */

// ============================================
// 1. PROFILE SETTINGS
// ============================================

// อัปเดตข้อมูลโปรไฟล์
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { phone } = req.body;

    // Validation
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกเบอร์โทรศัพท์',
      });
    }

    await pool.query(
      'UPDATE users SET phone = ?, updated_at = NOW() WHERE user_id = ?',
      [phone, userId]
    );

    res.json({
      success: true,
      message: 'อัปเดตข้อมูลสำเร็จ',
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล',
      error: error.message,
    });
  }
};

// เปลี่ยนรหัสผ่าน
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
      });
    }

    // Get current password hash
    const [users] = await pool.query(
      'SELECT password_hash FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบผู้ใช้นี้',
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, users[0].password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = ?, require_password_change = 0, updated_at = NOW() WHERE user_id = ?',
      [newPasswordHash, userId]
    );

    res.json({
      success: true,
      message: 'เปลี่ยนรหัสผ่านสำเร็จ',
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน',
      error: error.message,
    });
  }
};

// ============================================
// 2. NOTIFICATION SETTINGS
// ============================================

// ดึงการตั้งค่าการแจ้งเตือน
exports.getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [settings] = await pool.query(
      `SELECT notification_preferences 
       FROM UserSettings 
       WHERE user_id = ?`,
      [userId]
    );

    if (settings.length === 0) {
      // Return default settings
      return res.json({
        success: true,
        data: {
          allNotifications: true,
          newPatients: true,
          appointments: true,
          changeRequests: true,
          systemAlerts: true,
        },
      });
    }

    const preferences = settings[0].notification_preferences 
      ? JSON.parse(settings[0].notification_preferences)
      : {
          allNotifications: true,
          newPatients: true,
          appointments: true,
          changeRequests: true,
          systemAlerts: true,
        };

    res.json({
      success: true,
      data: preferences,
    });

  } catch (error) {
    console.error('Error getting notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล',
      error: error.message,
    });
  }
};

// อัปเดตการตั้งค่าการแจ้งเตือน
exports.updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const settings = req.body;

    // Check if settings exist
    const [existing] = await pool.query(
      'SELECT setting_id FROM UserSettings WHERE user_id = ?',
      [userId]
    );

    const preferencesJSON = JSON.stringify(settings);

    if (existing.length === 0) {
      // Insert new settings
      await pool.query(
        `INSERT INTO UserSettings (setting_id, user_id, notification_preferences, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [`SET${Date.now()}`, userId, preferencesJSON]
      );
    } else {
      // Update existing settings
      await pool.query(
        'UPDATE UserSettings SET notification_preferences = ?, updated_at = NOW() WHERE user_id = ?',
        [preferencesJSON, userId]
      );
    }

    res.json({
      success: true,
      message: 'บันทึกการตั้งค่าสำเร็จ',
    });

  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า',
      error: error.message,
    });
  }
};

// ============================================
// 3. DISPLAY SETTINGS
// ============================================

// ดึงการตั้งค่าการแสดงผล
exports.getDisplaySettings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [settings] = await pool.query(
      'SELECT time_zone FROM UserSettings WHERE user_id = ?',
      [userId]
    );

    if (settings.length === 0) {
      return res.json({
        success: true,
        data: {
          timezone: 'Asia/Bangkok',
        },
      });
    }

    res.json({
      success: true,
      data: {
        timezone: settings[0].time_zone || 'Asia/Bangkok',
      },
    });

  } catch (error) {
    console.error('Error getting display settings:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล',
      error: error.message,
    });
  }
};

// อัปเดตการตั้งค่าการแสดงผล
exports.updateDisplaySettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { timezone } = req.body;

    // Check if settings exist
    const [existing] = await pool.query(
      'SELECT setting_id FROM UserSettings WHERE user_id = ?',
      [userId]
    );

    if (existing.length === 0) {
      // Insert new settings
      await pool.query(
        `INSERT INTO UserSettings (setting_id, user_id, time_zone, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [`SET${Date.now()}`, userId, timezone]
      );
    } else {
      // Update existing settings
      await pool.query(
        'UPDATE UserSettings SET time_zone = ?, updated_at = NOW() WHERE user_id = ?',
        [timezone, userId]
      );
    }

    res.json({
      success: true,
      message: 'บันทึกการตั้งค่าสำเร็จ',
    });

  } catch (error) {
    console.error('Error updating display settings:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า',
      error: error.message,
    });
  }
};

// ============================================
// 4. SECURITY SETTINGS
// ============================================

// ดึงประวัติการเข้าสู่ระบบ
exports.getLoginHistory = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [logs] = await pool.query(
      `SELECT log_id, action, action_time, ip_address, user_agent, status
       FROM AuditLogs
       WHERE user_id = ? AND action = 'login'
       ORDER BY action_time DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      success: true,
      data: logs,
    });

  } catch (error) {
    console.error('Error getting login history:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล',
      error: error.message,
    });
  }
};

// ดึง Active Sessions
exports.getActiveSessions = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [sessions] = await pool.query(
      `SELECT session_id, device_info, ip_address, created_at, expires_at, is_active
       FROM UserSessions
       WHERE user_id = ? AND is_active = 1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: sessions,
    });

  } catch (error) {
    console.error('Error getting active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล',
      error: error.message,
    });
  }
};

// ลบ Session
exports.deleteSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;

    // Verify session belongs to user
    const [sessions] = await pool.query(
      'SELECT session_id FROM UserSessions WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ Session นี้',
      });
    }

    // Delete session
    await pool.query(
      'UPDATE UserSessions SET is_active = 0 WHERE session_id = ?',
      [sessionId]
    );

    res.json({
      success: true,
      message: 'ลบ Session สำเร็จ',
    });

  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการลบ Session',
      error: error.message,
    });
  }
};

module.exports = exports;