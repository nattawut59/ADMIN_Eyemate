// backend/controllers/userController.js
const pool = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * ดูรายการผู้ใช้ทั้งหมด (with pagination, search, filter)
 * GET /api/users?page=1&limit=10&search=&role=&status=
 */
exports.getAllUsers = async (req, res) => {
  try {
    // รับ query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const roleFilter = req.query.role || '';
    const statusFilter = req.query.status || '';
    const offset = (page - 1) * limit;

    // สร้าง WHERE clause สำหรับ search และ filter
    let whereConditions = [];
    let queryParams = [];

    // Search by username, id_card, phone
    if (search) {
      whereConditions.push('(u.username LIKE ? OR u.id_card LIKE ? OR u.phone LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    // Filter by role
    if (roleFilter && ['patient', 'doctor', 'admin'].includes(roleFilter)) {
      whereConditions.push('u.role = ?');
      queryParams.push(roleFilter);
    }

    // Filter by status
    if (statusFilter && ['active', 'inactive', 'suspended'].includes(statusFilter)) {
      whereConditions.push('u.status = ?');
      queryParams.push(statusFilter);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';

    // นับจำนวนผู้ใช้ทั้งหมด (สำหรับ pagination)
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM users u 
      ${whereClause}
    `;
    const [countResult] = await pool.query(countQuery, queryParams);
    const total = countResult[0].total;

    // Query ข้อมูลผู้ใช้พร้อม profile information
    const dataQuery = `
      SELECT 
        u.user_id,
        u.id_card,
        u.role,
        u.username,
        u.phone,
        u.status,
        u.created_at,
        u.last_login,
        CASE 
          WHEN u.role = 'patient' THEN CONCAT(pp.first_name, ' ', pp.last_name)
          WHEN u.role = 'doctor' THEN CONCAT(dp.first_name, ' ', dp.last_name)
          ELSE NULL
        END as full_name,
        CASE 
          WHEN u.role = 'patient' THEN pp.patient_hn
          WHEN u.role = 'doctor' THEN dp.license_number
          ELSE NULL
        END as profile_number
      FROM users u
      LEFT JOIN PatientProfiles pp ON u.user_id = pp.patient_id AND u.role = 'patient'
      LEFT JOIN DoctorProfiles dp ON u.user_id = dp.doctor_id AND u.role = 'doctor'
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const [users] = await pool.query(dataQuery, [...queryParams, limit, offset]);

    // คำนวณข้อมูล pagination
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      message: 'ดึงข้อมูลผู้ใช้สำเร็จ'
    });

  } catch (error) {
    console.error('Error in getAllUsers:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้',
      error: error.message
    });
  }
};

/**
 * ดูรายละเอียดผู้ใช้ตาม ID
 * GET /api/users/:userId
 */
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    // ตรวจสอบว่า userId ถูกต้อง
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ user_id'
      });
    }

    // Query ข้อมูล user
    const userQuery = `
      SELECT 
        user_id,
        id_card,
        role,
        username,
        phone,
        status,
        created_at,
        updated_at,
        last_login,
        require_password_change
      FROM users 
      WHERE user_id = ?
    `;
    const [users] = await pool.query(userQuery, [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบผู้ใช้ที่ระบุ'
      });
    }

    const user = users[0];
    let profileData = null;

    // ดึงข้อมูล profile ตาม role
    if (user.role === 'patient') {
      const patientQuery = `
        SELECT 
          patient_id,
          patient_hn,
          first_name,
          last_name,
          date_of_birth,
          gender,
          address,
          emergency_contact_first_name,
          emergency_contact_last_name,
          emergency_contact_phone,
          emergency_contact_relation,
          consent_to_data_usage,
          registration_date
        FROM PatientProfiles 
        WHERE patient_id = ?
      `;
      const [patientProfile] = await pool.query(patientQuery, [userId]);
      profileData = patientProfile[0] || null;

    } else if (user.role === 'doctor') {
      const doctorQuery = `
        SELECT 
          doctor_id,
          first_name,
          last_name,
          license_number,
          department,
          specialty,
          hospital_affiliation,
          profile_image,
          consultation_hours,
          registration_date,
          status
        FROM DoctorProfiles 
        WHERE doctor_id = ?
      `;
      const [doctorProfile] = await pool.query(doctorQuery, [userId]);
      profileData = doctorProfile[0] || null;
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        profile: profileData
      },
      message: 'ดึงข้อมูลผู้ใช้สำเร็จ'
    });

  } catch (error) {
    console.error('Error in getUserById:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้',
      error: error.message
    });
  }
};

/**
 * แก้ไขข้อมูลผู้ใช้
 * PUT /api/users/:userId
 */
exports.updateUser = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { userId } = req.params;
    const { 
      username, 
      phone, 
      password,  // ถ้ามีการเปลี่ยนรหัสผ่าน
      profile    // ข้อมูล profile (patient หรือ doctor)
    } = req.body;

    // ตรวจสอบว่า user มีอยู่จริง
    const [existingUser] = await connection.query(
      'SELECT user_id, role FROM users WHERE user_id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบผู้ใช้ที่ระบุ'
      });
    }

    const userRole = existingUser[0].role;

    // ตรวจสอบ username ซ้ำ (ถ้ามีการเปลี่ยน)
    if (username) {
      const [duplicateUsername] = await connection.query(
        'SELECT user_id FROM users WHERE username = ? AND user_id != ?',
        [username, userId]
      );

      if (duplicateUsername.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Username นี้มีผู้ใช้งานแล้ว'
        });
      }
    }

    // อัปเดตข้อมูล users table
    let updateFields = [];
    let updateValues = [];

    if (username) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }

    if (phone) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }

    // ถ้ามีการเปลี่ยนรหัสผ่าน
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password_hash = ?');
      updateValues.push(hashedPassword);
      updateFields.push('require_password_change = ?');
      updateValues.push(0);
    }

    if (updateFields.length > 0) {
      updateValues.push(userId);
      const updateQuery = `
        UPDATE users 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `;
      await connection.query(updateQuery, updateValues);
    }

    // อัปเดตข้อมูล profile ตาม role
    if (profile) {
      if (userRole === 'patient' && profile.patient) {
        const {
          first_name,
          last_name,
          date_of_birth,
          gender,
          address,
          emergency_contact_first_name,
          emergency_contact_last_name,
          emergency_contact_phone,
          emergency_contact_relation
        } = profile.patient;

        let profileUpdateFields = [];
        let profileUpdateValues = [];

        if (first_name) {
          profileUpdateFields.push('first_name = ?');
          profileUpdateValues.push(first_name);
        }
        if (last_name) {
          profileUpdateFields.push('last_name = ?');
          profileUpdateValues.push(last_name);
        }
        if (date_of_birth) {
          profileUpdateFields.push('date_of_birth = ?');
          profileUpdateValues.push(date_of_birth);
        }
        if (gender) {
          profileUpdateFields.push('gender = ?');
          profileUpdateValues.push(gender);
        }
        if (address !== undefined) {
          profileUpdateFields.push('address = ?');
          profileUpdateValues.push(address);
        }
        if (emergency_contact_first_name !== undefined) {
          profileUpdateFields.push('emergency_contact_first_name = ?');
          profileUpdateValues.push(emergency_contact_first_name);
        }
        if (emergency_contact_last_name !== undefined) {
          profileUpdateFields.push('emergency_contact_last_name = ?');
          profileUpdateValues.push(emergency_contact_last_name);
        }
        if (emergency_contact_phone !== undefined) {
          profileUpdateFields.push('emergency_contact_phone = ?');
          profileUpdateValues.push(emergency_contact_phone);
        }
        if (emergency_contact_relation !== undefined) {
          profileUpdateFields.push('emergency_contact_relation = ?');
          profileUpdateValues.push(emergency_contact_relation);
        }

        if (profileUpdateFields.length > 0) {
          profileUpdateValues.push(userId);
          const profileUpdateQuery = `
            UPDATE PatientProfiles 
            SET ${profileUpdateFields.join(', ')}
            WHERE patient_id = ?
          `;
          await connection.query(profileUpdateQuery, profileUpdateValues);
        }

      } else if (userRole === 'doctor' && profile.doctor) {
        const {
          first_name,
          last_name,
          department,
          specialty,
          hospital_affiliation,
          consultation_hours
        } = profile.doctor;

        let profileUpdateFields = [];
        let profileUpdateValues = [];

        if (first_name) {
          profileUpdateFields.push('first_name = ?');
          profileUpdateValues.push(first_name);
        }
        if (last_name) {
          profileUpdateFields.push('last_name = ?');
          profileUpdateValues.push(last_name);
        }
        if (department !== undefined) {
          profileUpdateFields.push('department = ?');
          profileUpdateValues.push(department);
        }
        if (specialty !== undefined) {
          profileUpdateFields.push('specialty = ?');
          profileUpdateValues.push(specialty);
        }
        if (hospital_affiliation !== undefined) {
          profileUpdateFields.push('hospital_affiliation = ?');
          profileUpdateValues.push(hospital_affiliation);
        }
        if (consultation_hours !== undefined) {
          profileUpdateFields.push('consultation_hours = ?');
          profileUpdateValues.push(consultation_hours);
        }

        if (profileUpdateFields.length > 0) {
          profileUpdateValues.push(userId);
          const profileUpdateQuery = `
            UPDATE DoctorProfiles 
            SET ${profileUpdateFields.join(', ')}
            WHERE doctor_id = ?
          `;
          await connection.query(profileUpdateQuery, profileUpdateValues);
        }
      }
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'อัปเดตข้อมูลผู้ใช้สำเร็จ'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error in updateUser:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูลผู้ใช้',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * เปลี่ยนสถานะผู้ใช้
 * PATCH /api/users/:userId/status
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // Validation
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุสถานะ'
      });
    }

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'สถานะไม่ถูกต้อง (ต้องเป็น active, inactive, หรือ suspended)'
      });
    }

    // ตรวจสอบว่า user มีอยู่จริง
    const [existingUser] = await pool.query(
      'SELECT user_id, role FROM users WHERE user_id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบผู้ใช้ที่ระบุ'
      });
    }

    // ป้องกันการเปลี่ยนสถานะตัวเอง (ถ้า admin พยายามเปลี่ยนสถานะตัวเอง)
    if (userId === req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'ไม่สามารถเปลี่ยนสถานะของตัวเองได้'
      });
    }

    // อัปเดตสถานะ
    await pool.query(
      'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [status, userId]
    );

    res.status(200).json({
      success: true,
      message: 'เปลี่ยนสถานะผู้ใช้สำเร็จ'
    });

  } catch (error) {
    console.error('Error in updateUserStatus:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะผู้ใช้',
      error: error.message
    });
  }
};

/**
 * ลบผู้ใช้ (Soft delete โดยเปลี่ยนสถานะเป็น inactive)
 * DELETE /api/users/:userId
 */
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // ตรวจสอบว่า user มีอยู่จริง
    const [existingUser] = await pool.query(
      'SELECT user_id, role, status FROM users WHERE user_id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบผู้ใช้ที่ระบุ'
      });
    }

    // ป้องกันการลบตัวเอง
    if (userId === req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'ไม่สามารถลบบัญชีของตัวเองได้'
      });
    }

    // ป้องกันการลบ admin คนอื่น (ถ้าต้องการ)
    if (existingUser[0].role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'ไม่สามารถลบบัญชี admin ได้'
      });
    }

    // Soft delete: เปลี่ยนสถานะเป็น inactive แทนการลบจริง
    await pool.query(
      'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      ['inactive', userId]
    );

    res.status(200).json({
      success: true,
      message: 'ลบผู้ใช้สำเร็จ'
    });

  } catch (error) {
    console.error('Error in deleteUser:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการลบผู้ใช้',
      error: error.message
    });
  }
};

/**
 * รีเซ็ตรหัสผ่านผู้ใช้
 * POST /api/users/:userId/reset-password
 */
exports.resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    // Validation
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
      });
    }

    // ตรวจสอบว่า user มีอยู่จริง
    const [existingUser] = await pool.query(
      'SELECT user_id FROM users WHERE user_id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบผู้ใช้ที่ระบุ'
      });
    }

    // Hash รหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // อัปเดตรหัสผ่าน และบังคับให้เปลี่ยนรหัสผ่านในครั้งแรกที่ login
    await pool.query(
      `UPDATE users 
       SET password_hash = ?, 
           require_password_change = 1,
           updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = ?`,
      [hashedPassword, userId]
    );

    res.status(200).json({
      success: true,
      message: 'รีเซ็ตรหัสผ่านสำเร็จ ผู้ใช้จะต้องเปลี่ยนรหัสผ่านในครั้งแรกที่เข้าสู่ระบบ'
    });

  } catch (error) {
    console.error('Error in resetUserPassword:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน',
      error: error.message
    });
  }
};

/**
 * ดูสถิติผู้ใช้
 * GET /api/users/statistics
 */
exports.getUserStatistics = async (req, res) => {
  try {
    // นับจำนวนผู้ใช้ตาม role และ status
    const [stats] = await pool.query(`
      SELECT 
        role,
        status,
        COUNT(*) as count
      FROM users
      GROUP BY role, status
    `);

    // นับจำนวนผู้ใช้ที่สร้างใหม่ในแต่ละเดือน (6 เดือนล่าสุด)
    const [newUsersByMonth] = await pool.query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        role,
        COUNT(*) as count
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month, role
      ORDER BY month DESC
    `);

    // นับจำนวน active sessions
    const [activeSessions] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM UserSessions 
      WHERE is_active = 1 AND expires_at > NOW()
    `);

    // จัดรูปแบบข้อมูล
    const summary = {
      byRole: {},
      byStatus: {},
      total: 0
    };

    stats.forEach(stat => {
      // นับตาม role
      if (!summary.byRole[stat.role]) {
        summary.byRole[stat.role] = 0;
      }
      summary.byRole[stat.role] += stat.count;

      // นับตาม status
      if (!summary.byStatus[stat.status]) {
        summary.byStatus[stat.status] = 0;
      }
      summary.byStatus[stat.status] += stat.count;

      // นับรวม
      summary.total += stat.count;
    });

    res.status(200).json({
      success: true,
      data: {
        summary,
        newUsersByMonth,
        activeSessions: activeSessions[0].count
      },
      message: 'ดึงสถิติผู้ใช้สำเร็จ'
    });

  } catch (error) {
    console.error('Error in getUserStatistics:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงสถิติผู้ใช้',
      error: error.message
    });
  }
};

/**
 * สร้างผู้ใช้ใหม่ (Patient หรือ Doctor)
 * POST /api/users
 */
exports.createUser = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      id_card,
      phone,
      role, // 'patient' หรือ 'doctor'
      username, // สำหรับ doctor เท่านั้น (patient จะใช้ id_card อัตโนมัติ)
      password, // ทั้ง patient และ doctor ต้องระบุ
      profile // ข้อมูล profile ตาม role
    } = req.body;

    // ========== Validation ==========
    // ตรวจสอบ required fields
    if (!id_card || !role || !password) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน (id_card, role, password)'
      });
    }

    // ตรวจสอบ role
    if (!['patient', 'doctor'].includes(role)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'role ต้องเป็น patient หรือ doctor เท่านั้น'
      });
    }

    // ตรวจสอบความยาว id_card (13 หลัก)
    if (id_card.length !== 13 || !/^\d{13}$/.test(id_card)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'
      });
    }

    // ตรวจสอบความยาวรหัสผ่าน
    if (password.length < 6) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
      });
    }

    // ตรวจสอบ username สำหรับ doctor
    if (role === 'doctor' && !username) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก username สำหรับแพทย์'
      });
    }

    // ========== Check Duplicates ==========
    // ตรวจสอบ id_card ซ้ำ
    const [existingIdCard] = await connection.query(
      'SELECT user_id FROM users WHERE id_card = ?',
      [id_card]
    );

    if (existingIdCard.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'เลขบัตรประชาชนนี้มีในระบบแล้ว'
      });
    }

    // ========== กำหนด Username ตาม Role ==========
    let finalUsername;

    if (role === 'patient') {
      // Patient: ใช้เลขบัตรประชาชนเป็น username
      finalUsername = id_card;
      
      // ตรวจสอบว่าเลขบัตรนี้ถูกใช้เป็น username แล้วหรือยัง (ป้องกัน edge case)
      const [existingUsername] = await connection.query(
        'SELECT user_id FROM users WHERE username = ?',
        [finalUsername]
      );

      if (existingUsername.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'เลขบัตรประชาชนนี้มีในระบบแล้ว'
        });
      }

    } else if (role === 'doctor') {
      // Doctor: ใช้ username ที่กรอกมา
      finalUsername = username;

      // ตรวจสอบ username ซ้ำ
      const [existingUsername] = await connection.query(
        'SELECT user_id FROM users WHERE username = ?',
        [finalUsername]
      );

      if (existingUsername.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Username นี้มีผู้ใช้งานแล้ว'
        });
      }
    }

    // ========== Generate User ID ==========
    // สร้าง user_id ตาม role
    let prefix = role === 'patient' ? 'PAT' : 'DOC';
    
    // หา running number
    const [maxId] = await connection.query(
      `SELECT user_id FROM users WHERE user_id LIKE ? ORDER BY user_id DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let newNumber = 1;
    if (maxId.length > 0) {
      const lastNumber = parseInt(maxId[0].user_id.substring(3));
      newNumber = lastNumber + 1;
    }

    const user_id = `${prefix}${String(newNumber).padStart(4, '0')}`;

    // ========== Hash Password ==========
    const hashedPassword = await bcrypt.hash(password, 10);

    // ========== Insert User ==========
    await connection.query(
      `INSERT INTO users (user_id, id_card, role, username, password_hash, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [user_id, id_card, role, finalUsername, hashedPassword, phone || null]
    );

    // ========== Create Profile ==========
    if (role === 'patient' && profile && profile.patient) {
      const {
        patient_hn, // รับ HN จาก admin
        first_name,
        last_name,
        date_of_birth,
        gender,
        address,
        emergency_contact_first_name,
        emergency_contact_last_name,
        emergency_contact_phone,
        emergency_contact_relation,
        consent_to_data_usage
      } = profile.patient;

      // Validation สำหรับ patient profile
      if (!first_name || !last_name) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกชื่อ-นามสกุลของผู้ป่วย'
        });
      }

      if (!patient_hn) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอก HN ของผู้ป่วย'
        });
      }

      // ตรวจสอบ HN ซ้ำ
      const [existingHN] = await connection.query(
        'SELECT patient_id FROM PatientProfiles WHERE patient_hn = ?',
        [patient_hn]
      );

      if (existingHN.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `HN ${patient_hn} มีในระบบแล้ว`
        });
      }

      // Insert patient profile
      await connection.query(
        `INSERT INTO PatientProfiles (
          patient_id, patient_hn, first_name, last_name, date_of_birth, gender, address,
          emergency_contact_first_name, emergency_contact_last_name, 
          emergency_contact_phone, emergency_contact_relation, consent_to_data_usage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user_id,
          patient_hn,
          first_name,
          last_name,
          date_of_birth || null,
          gender || null,
          address || null,
          emergency_contact_first_name || null,
          emergency_contact_last_name || null,
          emergency_contact_phone || null,
          emergency_contact_relation || null,
          consent_to_data_usage || 0
        ]
      );

    } else if (role === 'doctor' && profile && profile.doctor) {
      const {
        first_name,
        last_name,
        license_number,
        department,
        specialty,
        hospital_affiliation,
        consultation_hours
      } = profile.doctor;

      // Validation สำหรับ doctor profile
      if (!first_name || !last_name || !license_number) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกชื่อ-นามสกุล และใบอนุญาตของแพทย์'
        });
      }

      // ตรวจสอบ license_number ซ้ำ
      const [existingLicense] = await connection.query(
        'SELECT doctor_id FROM DoctorProfiles WHERE license_number = ?',
        [license_number]
      );

      if (existingLicense.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'เลขใบอนุญาตนี้มีในระบบแล้ว'
        });
      }

      // Insert doctor profile
      await connection.query(
        `INSERT INTO DoctorProfiles (
          doctor_id, first_name, last_name, license_number, department, 
          specialty, hospital_affiliation, consultation_hours, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          user_id,
          first_name,
          last_name,
          license_number,
          department || null,
          specialty || null,
          hospital_affiliation || null,
          consultation_hours || null
        ]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        user_id,
        username: finalUsername,
        role,
        ...(role === 'patient' && { 
          note: 'คนไข้ใช้เลขบัตรประชาชนเป็น username'
        }),
        ...(role === 'patient' && profile?.patient?.patient_hn && { 
          patient_hn: profile.patient.patient_hn 
        })
      },
      message: 'สร้างผู้ใช้สำเร็จ'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error in createUser:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการสร้างผู้ใช้',
      error: error.message
    });
  } finally {
    connection.release();
  }
};
