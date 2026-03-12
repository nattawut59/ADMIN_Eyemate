const db = require('../config/database');

// ==================== ฟังก์ชันช่วยสร้าง ID ====================

// สร้าง appointment_id แบบ APPT + วันที่ + เลข 4 หัก
function generateAppointmentId() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `APPT${year}${month}${day}${random}`;
}

// สร้าง request_id แบบ REQ + วันที่ + เลข 4 หลัก
function generateRequestId() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `REQ${year}${month}${day}${random}`;
}

// ==================== 1. สร้างนัดหมายใหม่ ====================

exports.createAppointment = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const {
      patient_id,
      doctor_id,
      appointment_date,
      appointment_time,
      appointment_type,
      appointment_location,
      appointment_duration,
      notes
    } = req.body;

    // Validation ข้อมูลที่จำเป็น
    if (!patient_id || !doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (patient_id, doctor_id, appointment_date, appointment_time)'
      });
    }

    // Debug log - ตรวจสอบ req.user
    console.log('🔍 =================================');
    console.log('🔍 req.user:', JSON.stringify(req.user, null, 2));
    console.log('🔍 req.user.userId:', req.user?.userId);
    console.log('🔍 typeof req.user.userId:', typeof req.user?.userId);
    console.log('🔍 =================================');

    // ตรวจสอบว่ามี req.user และ userId
    if (!req.user || !req.user.userId) {
      console.log('❌ req.user หรือ req.user.userId ไม่มีค่า!');
      return res.status(401).json({
        success: false,
        message: 'ไม่พบข้อมูล user กรุณา login ใหม่',
        error: 'User ID not found in token'
      });
    }

    // เริ่ม transaction
    await connection.beginTransaction();

    // 1. ตรวจสอบว่า patient_id มีอยู่จริงใน PatientProfiles
    const [patientCheck] = await connection.query(
      'SELECT patient_id FROM PatientProfiles WHERE patient_id = ?',
      [patient_id]
    );

    if (patientCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลผู้ป่วยในระบบ'
      });
    }

    // 2. ตรวจสอบว่า doctor_id มีอยู่จริงใน DoctorProfiles
    const [doctorCheck] = await connection.query(
      'SELECT doctor_id FROM DoctorProfiles WHERE doctor_id = ? AND status = "active"',
      [doctor_id]
    );

    if (doctorCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลแพทย์ในระบบหรือแพทย์ไม่ได้ active'
      });
    }

    // 3. ตรวจสอบว่าแพทย์มีนัดซ้อนในช่วงเวลานั้นหรือไม่
    const [existingAppointments] = await connection.query(
      `SELECT appointment_id 
       FROM Appointments 
       WHERE doctor_id = ? 
       AND appointment_date = ? 
       AND appointment_time = ? 
       AND appointment_status NOT IN ('cancelled', 'rescheduled')`,
      [doctor_id, appointment_date, appointment_time]
    );

    if (existingAppointments.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'แพทย์มีนัดหมายในช่วงเวลานี้แล้ว กรุณาเลือกเวลาอื่น'
      });
    }

    // 4. ตรวจสอบว่าผู้ป่วยมีนัดซ้อนในช่วงเวลานั้นหรือไม่
    const [patientAppointments] = await connection.query(
      `SELECT appointment_id 
       FROM Appointments 
       WHERE patient_id = ? 
       AND appointment_date = ? 
       AND appointment_time = ? 
       AND appointment_status NOT IN ('cancelled', 'rescheduled')`,
      [patient_id, appointment_date, appointment_time]
    );

    if (patientAppointments.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'ผู้ป่วยมีนัดหมายในช่วงเวลานี้แล้ว กรุณาเลือกเวลาอื่น'
      });
    }

    // 5. สร้าง appointment_id
    const appointment_id = generateAppointmentId();
    
    // ตรวจสอบว่ามี req.user หรือไม่
    if (!req.user || !req.user.userId) {
      await connection.rollback();
      return res.status(401).json({
        success: false,
        message: 'ไม่พบข้อมูลผู้ใช้ กรุณา login ใหม่',
        error: 'User information not found in token'
      });
    }
    
    const created_by = req.user.userId; // เปลี่ยนจาก user_id เป็น userId

    // 6. Insert ข้อมูลนัดหมายใหม่
    await connection.query(
      `INSERT INTO Appointments (
        appointment_id,
        patient_id,
        doctor_id,
        appointment_date,
        appointment_time,
        appointment_type,
        appointment_location,
        appointment_duration,
        appointment_status,
        notes,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      [
        appointment_id,
        patient_id,
        doctor_id,
        appointment_date,
        appointment_time,
        appointment_type || null,
        appointment_location || null,
        appointment_duration || null,
        notes || null,
        created_by
      ]
    );

    // Commit transaction
    await connection.commit();

    // 7. ดึงข้อมูลนัดหมายที่สร้างเสร็จแล้วพร้อมข้อมูลผู้ป่วยและแพทย์
    const [newAppointment] = await connection.query(
      `SELECT 
        a.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty as doctor_specialty
       FROM Appointments a
       JOIN PatientProfiles p ON a.patient_id = p.patient_id
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       WHERE a.appointment_id = ?`,
      [appointment_id]
    );

    res.status(201).json({
      success: true,
      message: 'สร้างนัดหมายเรียบร้อยแล้ว',
      data: newAppointment[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Create Appointment Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการสร้างนัดหมาย',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// ==================== 2. ดูรายการนัดหมายทั้งหมด ====================

exports.getAllAppointments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      doctor_id,
      patient_id,
      date_from,
      date_to,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];

    // Filter ตาม status
    if (status) {
      whereConditions.push('a.appointment_status = ?');
      queryParams.push(status);
    }

    // Filter ตาม doctor_id
    if (doctor_id) {
      whereConditions.push('a.doctor_id = ?');
      queryParams.push(doctor_id);
    }

    // Filter ตาม patient_id
    if (patient_id) {
      whereConditions.push('a.patient_id = ?');
      queryParams.push(patient_id);
    }

    // Filter ตาม date range
    if (date_from) {
      whereConditions.push('a.appointment_date >= ?');
      queryParams.push(date_from);
    }

    if (date_to) {
      whereConditions.push('a.appointment_date <= ?');
      queryParams.push(date_to);
    }

    // Search โดยชื่อผู้ป่วยหรือชื่อแพทย์
    if (search) {
      whereConditions.push(`(
        CONCAT(p.first_name, ' ', p.last_name) LIKE ? OR
        CONCAT(d.first_name, ' ', d.last_name) LIKE ?
      )`);
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // นับจำนวนทั้งหมด
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total 
       FROM Appointments a
       JOIN PatientProfiles p ON a.patient_id = p.patient_id
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       ${whereClause}`,
      queryParams
    );

    const total = countResult[0].total;

    // ดึงข้อมูลนัดหมาย
    const [appointments] = await db.query(
      `SELECT 
        a.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.patient_hn,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty as doctor_specialty,
        d.department as doctor_department
       FROM Appointments a
       JOIN PatientProfiles p ON a.patient_id = p.patient_id
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       ${whereClause}
       ORDER BY a.appointment_date DESC, a.appointment_time DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: appointments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get All Appointments Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย',
      error: error.message
    });
  }
};

// ==================== 3. ดูรายละเอียดนัดหมาย ====================

exports.getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const [appointment] = await db.query(
      `SELECT 
        a.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.patient_hn,
        p.gender as patient_gender,
        p.date_of_birth as patient_dob,
        u_patient.phone as patient_phone,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty as doctor_specialty,
        d.department as doctor_department,
        d.license_number as doctor_license,
        u_doctor.phone as doctor_phone,
        CONCAT(u.username) as created_by_name
       FROM Appointments a
       JOIN PatientProfiles p ON a.patient_id = p.patient_id
       JOIN users u_patient ON p.patient_id = u_patient.user_id
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       JOIN users u_doctor ON d.doctor_id = u_doctor.user_id
       JOIN users u ON a.created_by = u.user_id
       WHERE a.appointment_id = ?`,
      [id]
    );

    if (appointment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลนัดหมาย'
      });
    }

    res.json({
      success: true,
      data: appointment[0]
    });

  } catch (error) {
    console.error('Get Appointment By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย',
      error: error.message
    });
  }
};

// ==================== 4. อัปเดตนัดหมาย ====================

exports.updateAppointment = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { id } = req.params;
    const {
      appointment_date,
      appointment_time,
      appointment_type,
      appointment_location,
      appointment_duration,
      appointment_status,
      cancellation_reason,
      notes
    } = req.body;

    await connection.beginTransaction();

    // 1. ตรวจสอบว่านัดหมายมีอยู่จริง
    const [existingAppointment] = await connection.query(
      'SELECT * FROM Appointments WHERE appointment_id = ?',
      [id]
    );

    if (existingAppointment.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลนัดหมาย'
      });
    }

    const appointment = existingAppointment[0];

    // 2. ถ้ามีการเปลี่ยนวันเวลา ต้องเช็คว่าไม่ซ้อนกับนัดอื่น
    if (appointment_date && appointment_time) {
      const [conflicts] = await connection.query(
        `SELECT appointment_id 
         FROM Appointments 
         WHERE doctor_id = ? 
         AND appointment_date = ? 
         AND appointment_time = ? 
         AND appointment_id != ?
         AND appointment_status NOT IN ('cancelled', 'rescheduled')`,
        [appointment.doctor_id, appointment_date, appointment_time, id]
      );

      if (conflicts.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'แพทย์มีนัดหมายในช่วงเวลานี้แล้ว กรุณาเลือกเวลาอื่น'
        });
      }
    }

    // 3. สร้าง update query แบบ dynamic
    const updates = [];
    const updateParams = [];

    if (appointment_date) {
      updates.push('appointment_date = ?');
      updateParams.push(appointment_date);
    }

    if (appointment_time) {
      updates.push('appointment_time = ?');
      updateParams.push(appointment_time);
    }

    if (appointment_type !== undefined) {
      updates.push('appointment_type = ?');
      updateParams.push(appointment_type);
    }

    if (appointment_location !== undefined) {
      updates.push('appointment_location = ?');
      updateParams.push(appointment_location);
    }

    if (appointment_duration !== undefined) {
      updates.push('appointment_duration = ?');
      updateParams.push(appointment_duration);
    }

    if (appointment_status) {
      updates.push('appointment_status = ?');
      updateParams.push(appointment_status);
    }

    if (cancellation_reason !== undefined) {
      updates.push('cancellation_reason = ?');
      updateParams.push(cancellation_reason);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      updateParams.push(notes);
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'ไม่มีข้อมูลที่ต้องการอัปเดต'
      });
    }

    // 4. Update appointment
    await connection.query(
      `UPDATE Appointments 
       SET ${updates.join(', ')} 
       WHERE appointment_id = ?`,
      [...updateParams, id]
    );

    await connection.commit();

    // 5. ดึงข้อมูลที่อัปเดตแล้ว
    const [updatedAppointment] = await connection.query(
      `SELECT 
        a.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty as doctor_specialty
       FROM Appointments a
       JOIN PatientProfiles p ON a.patient_id = p.patient_id
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       WHERE a.appointment_id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'อัปเดตข้อมูลนัดหมายเรียบร้อยแล้ว',
      data: updatedAppointment[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Update Appointment Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปเดตนัดหมาย',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// ==================== 5. ยกเลิกนัดหมาย ====================

exports.cancelAppointment = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;

    if (!cancellation_reason) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุเหตุผลในการยกเลิกนัดหมาย'
      });
    }

    await connection.beginTransaction();

    // ตรวจสอบว่านัดหมายมีอยู่จริง
    const [appointment] = await connection.query(
      'SELECT * FROM Appointments WHERE appointment_id = ?',
      [id]
    );

    if (appointment.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลนัดหมาย'
      });
    }

    // ตรวจสอบว่านัดหมายถูกยกเลิกแล้วหรือไม่
    if (appointment[0].appointment_status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'นัดหมายนี้ถูกยกเลิกไปแล้ว'
      });
    }

    // Update status เป็น cancelled
    await connection.query(
      `UPDATE Appointments 
       SET appointment_status = 'cancelled', 
           cancellation_reason = ? 
       WHERE appointment_id = ?`,
      [cancellation_reason, id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'ยกเลิกนัดหมายเรียบร้อยแล้ว'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Cancel Appointment Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการยกเลิกนัดหมาย',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// ==================== 6. ดูรายการคำขอเลื่อนนัดทั้งหมด ====================

exports.getAllChangeRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      request_type,
      patient_id
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];

    // Filter ตาม status
    if (status) {
      whereConditions.push('acr.request_status = ?');
      queryParams.push(status);
    }

    // Filter ตาม request_type
    if (request_type) {
      whereConditions.push('acr.request_type = ?');
      queryParams.push(request_type);
    }

    // Filter ตาม patient_id
    if (patient_id) {
      whereConditions.push('acr.patient_id = ?');
      queryParams.push(patient_id);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // นับจำนวนทั้งหมด
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total 
       FROM AppointmentChangeRequests acr
       ${whereClause}`,
      queryParams
    );

    const total = countResult[0].total;

    // ดึงข้อมูลคำขอ
    const [requests] = await db.query(
      `SELECT 
        acr.*,
        a.appointment_date as original_date,
        a.appointment_time as original_time,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.patient_hn,
        u_patient.phone as patient_phone,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty as doctor_specialty,
        CONCAT(u.username) as action_by_name
       FROM AppointmentChangeRequests acr
       JOIN Appointments a ON acr.appointment_id = a.appointment_id
       JOIN PatientProfiles p ON acr.patient_id = p.patient_id
       JOIN users u_patient ON p.patient_id = u_patient.user_id
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       LEFT JOIN users u ON acr.action_by_id = u.user_id
       ${whereClause}
       ORDER BY acr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get All Change Requests Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำขอเลื่อนนัด',
      error: error.message
    });
  }
};

// ==================== 7. ดูรายละเอียดคำขอเลื่อนนัด ====================

exports.getChangeRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const [request] = await db.query(
      `SELECT 
        acr.*,
        a.appointment_date as original_date,
        a.appointment_time as original_time,
        a.appointment_type,
        a.appointment_location,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.patient_hn,
        u_patient.phone as patient_phone,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty as doctor_specialty,
        d.department as doctor_department,
        CONCAT(u.username) as action_by_name
       FROM AppointmentChangeRequests acr
       JOIN Appointments a ON acr.appointment_id = a.appointment_id
       JOIN PatientProfiles p ON acr.patient_id = p.patient_id
       JOIN users u_patient ON p.patient_id = u_patient.user_id
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       LEFT JOIN users u ON acr.action_by_id = u.user_id
       WHERE acr.request_id = ?`,
      [id]
    );

    if (request.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลคำขอเลื่อนนัด'
      });
    }

    res.json({
      success: true,
      data: request[0]
    });

  } catch (error) {
    console.error('Get Change Request By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำขอเลื่อนนัด',
      error: error.message
    });
  }
};

// ==================== 8. อนุมัติคำขอเลื่อนนัด ====================

exports.approveChangeRequest = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const admin_id = req.user.userId;

    await connection.beginTransaction();

    // 1. ดึงข้อมูลคำขอ
    const [request] = await connection.query(
      'SELECT * FROM AppointmentChangeRequests WHERE request_id = ?',
      [id]
    );

    if (request.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลคำขอเลื่อนนัด'
      });
    }

    const changeRequest = request[0];

    // 2. ตรวจสอบว่าคำขอยังไม่ได้ดำเนินการ
    if (changeRequest.request_status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `คำขอนี้ถูก${changeRequest.request_status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}ไปแล้ว`
      });
    }

    // 3. ดึงข้อมูลนัดหมายเดิม
    const [appointment] = await connection.query(
      'SELECT * FROM Appointments WHERE appointment_id = ?',
      [changeRequest.appointment_id]
    );

    if (appointment.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลนัดหมาย'
      });
    }

    const originalAppointment = appointment[0];

    // 4. ดำเนินการตาม request_type
    if (changeRequest.request_type === 'cancel') {
      // ยกเลิกนัดหมาย
      await connection.query(
        `UPDATE Appointments 
         SET appointment_status = 'cancelled', 
             cancellation_reason = ? 
         WHERE appointment_id = ?`,
        [changeRequest.reason || 'ผู้ป่วยขอยกเลิก', changeRequest.appointment_id]
      );

    } else if (changeRequest.request_type === 'reschedule') {
      // ตรวจสอบว่าวันเวลาใหม่ไม่ซ้อนกับนัดอื่น
      const [conflicts] = await connection.query(
        `SELECT appointment_id 
         FROM Appointments 
         WHERE doctor_id = ? 
         AND appointment_date = ? 
         AND appointment_time = ? 
         AND appointment_id != ?
         AND appointment_status NOT IN ('cancelled', 'rescheduled')`,
        [
          originalAppointment.doctor_id,
          changeRequest.requested_new_date,
          changeRequest.requested_new_time,
          changeRequest.appointment_id
        ]
      );

      if (conflicts.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'แพทย์มีนัดหมายในช่วงเวลาที่ขอเลื่อนแล้ว ไม่สามารถอนุมัติได้'
        });
      }

      // อัปเดตนัดหมาย
      await connection.query(
        `UPDATE Appointments 
         SET appointment_date = ?,
             appointment_time = ?,
             appointment_status = 'rescheduled'
         WHERE appointment_id = ?`,
        [
          changeRequest.requested_new_date,
          changeRequest.requested_new_time,
          changeRequest.appointment_id
        ]
      );
    }

    // 5. อัปเดต status ของคำขอเป็น approved
    await connection.query(
      `UPDATE AppointmentChangeRequests 
       SET request_status = 'approved',
           action_by_id = ?,
           action_date = NOW(),
           admin_notes = ?
       WHERE request_id = ?`,
      [admin_id, admin_notes || null, id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'อนุมัติคำขอเรียบร้อยแล้ว'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Approve Change Request Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอนุมัติคำขอ',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// ==================== 9. ปฏิเสธคำขอเลื่อนนัด ====================

exports.rejectChangeRequest = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const admin_id = req.user.userId;

    if (!admin_notes) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุเหตุผลในการปฏิเสธ'
      });
    }

    await connection.beginTransaction();

    // 1. ดึงข้อมูลคำขอ
    const [request] = await connection.query(
      'SELECT * FROM AppointmentChangeRequests WHERE request_id = ?',
      [id]
    );

    if (request.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลคำขอเลื่อนนัด'
      });
    }

    const changeRequest = request[0];

    // 2. ตรวจสอบว่าคำขอยังไม่ได้ดำเนินการ
    if (changeRequest.request_status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `คำขอนี้ถูก${changeRequest.request_status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}ไปแล้ว`
      });
    }

    // 3. อัปเดต status ของคำขอเป็น rejected
    await connection.query(
      `UPDATE AppointmentChangeRequests 
       SET request_status = 'rejected',
           action_by_id = ?,
           action_date = NOW(),
           admin_notes = ?
       WHERE request_id = ?`,
      [admin_id, admin_notes, id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'ปฏิเสธคำขอเรียบร้อยแล้ว'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Reject Change Request Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// ==================== 10. สถิติคำขอเลื่อนนัด ====================

exports.getChangeRequestStatistics = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    
    let dateCondition = '';
    let queryParams = [];

    if (date_from && date_to) {
      dateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [date_from, date_to];
    }

    // สถิติแบ่งตาม status
    const [statusStats] = await db.query(
      `SELECT 
        request_status,
        COUNT(*) as count
       FROM AppointmentChangeRequests
       ${dateCondition}
       GROUP BY request_status`,
      queryParams
    );

    // สถิติแบ่งตาม request_type
    const [typeStats] = await db.query(
      `SELECT 
        request_type,
        COUNT(*) as count
       FROM AppointmentChangeRequests
       ${dateCondition}
       GROUP BY request_type`,
      queryParams
    );

    // Average response time (เวลาเฉลี่ยในการตอบสนอง)
    const [avgResponseTime] = await db.query(
      `SELECT 
        AVG(TIMESTAMPDIFF(HOUR, created_at, action_date)) as avg_hours
       FROM AppointmentChangeRequests
       WHERE action_date IS NOT NULL
       ${dateCondition ? 'AND created_at BETWEEN ? AND ?' : ''}`,
      queryParams
    );

    res.json({
      success: true,
      data: {
        by_status: statusStats,
        by_type: typeStats,
        avg_response_time_hours: avgResponseTime[0].avg_hours || 0
      }
    });

  } catch (error) {
    console.error('Get Change Request Statistics Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงสถิติ',
      error: error.message
    });
  }
};

// ==================== 11. สถิติโดยรวมของนัดหมาย ====================

exports.getAppointmentStatistics = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    
    let dateCondition = '';
    let queryParams = [];

    if (date_from && date_to) {
      dateCondition = 'WHERE appointment_date BETWEEN ? AND ?';
      queryParams = [date_from, date_to];
    }

    // สถิติแบ่งตาม status
    const [statusStats] = await db.query(
      `SELECT 
        appointment_status,
        COUNT(*) as count
       FROM Appointments
       ${dateCondition}
       GROUP BY appointment_status`,
      queryParams
    );

    // จำนวนนัดหมายในแต่ละเดือน
    const [monthlyStats] = await db.query(
      `SELECT 
        DATE_FORMAT(appointment_date, '%Y-%m') as month,
        COUNT(*) as count
       FROM Appointments
       ${dateCondition}
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`,
      queryParams
    );

    // แพทย์ที่มีนัดมากที่สุด
    const [topDoctors] = await db.query(
      `SELECT 
        d.doctor_id,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty,
        COUNT(*) as appointment_count
       FROM Appointments a
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       ${dateCondition}
       GROUP BY d.doctor_id
       ORDER BY appointment_count DESC
       LIMIT 10`,
      queryParams
    );

    res.json({
      success: true,
      data: {
        by_status: statusStats,
        by_month: monthlyStats,
        top_doctors: topDoctors
      }
    });

  } catch (error) {
    console.error('Get Appointment Statistics Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงสถิติ',
      error: error.message
    });
  }
};