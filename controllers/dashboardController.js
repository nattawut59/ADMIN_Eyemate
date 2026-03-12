const pool = require('../config/database');

/**
 * Get Dashboard Statistics
 */
const getDashboardStats = async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();

    // ========== นับจำนวนผู้ป่วยทั้งหมด ==========
    const [patientsCount] = await connection.execute(
      `SELECT COUNT(*) as total FROM PatientProfiles`
    );

    // ========== นับจำนวนแพทย์ทั้งหมด ==========
    const [doctorsCount] = await connection.execute(
      `SELECT COUNT(*) as total FROM DoctorProfiles WHERE status = 'active'`
    );

    // ========== นับจำนวนนัดหมายวันนี้ ==========
    const [todayAppointments] = await connection.execute(
      `SELECT COUNT(*) as total 
       FROM Appointments 
       WHERE DATE(appointment_date) = CURDATE() 
       AND appointment_status IN ('scheduled', 'completed')`
    );

    // ========== นับจำนวนยาที่ active ==========
    const [medicationsCount] = await connection.execute(
      `SELECT COUNT(*) as total FROM Medications WHERE status = 'active'`
    );

    // ========== นับจำนวนนัดหมายที่รอดำเนินการ ==========
    const [pendingAppointments] = await connection.execute(
      `SELECT COUNT(*) as total 
       FROM Appointments 
       WHERE appointment_status = 'scheduled' 
       AND appointment_date >= CURDATE()`
    );

    // ========== นับจำนวน Change Requests ที่รออนุมัติ ==========
    const [pendingChangeRequests] = await connection.execute(
      `SELECT COUNT(*) as total 
       FROM AppointmentChangeRequests 
       WHERE request_status = 'pending'`
    );

    // ส่งข้อมูลกลับ
    return res.status(200).json({
      success: true,
      data: {
        totalPatients: patientsCount[0].total,
        totalDoctors: doctorsCount[0].total,
        todayAppointments: todayAppointments[0].total,
        totalMedications: medicationsCount[0].total,
        pendingAppointments: pendingAppointments[0].total,
        pendingChangeRequests: pendingChangeRequests[0].total,
      }
    });

  } catch (error) {
    console.error('❌ Get Dashboard Stats Error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
    
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get Recent Activities
 */
const getRecentActivities = async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();

    // ดึงกิจกรรมล่าสุด (ตัวอย่าง: ผู้ป่วยใหม่ 5 คนล่าสุด)
    const [recentPatients] = await connection.execute(
      `SELECT 
        CONCAT(first_name, ' ', last_name) as name,
        registration_date,
        'new_patient' as type
       FROM PatientProfiles 
       ORDER BY registration_date DESC 
       LIMIT 5`
    );

    // ดึงนัดหมายล่าสุด
    const [recentAppointments] = await connection.execute(
      `SELECT 
        a.appointment_id,
        a.appointment_date,
        a.appointment_time,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        a.created_at,
        'appointment' as type
       FROM Appointments a
       JOIN PatientProfiles p ON a.patient_id = p.patient_id
       JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
       ORDER BY a.created_at DESC 
       LIMIT 5`
    );

    // รวมและเรียงตามเวลา
    const activities = [
      ...recentPatients.map(p => ({
        text: `ผู้ป่วยใหม่: ${p.name}`,
        time: p.registration_date,
        type: p.type
      })),
      ...recentAppointments.map(a => ({
        text: `นัดหมาย: ${a.doctor_name} - ${a.patient_name}`,
        time: a.created_at,
        type: a.type
      }))
    ]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 10);

    return res.status(200).json({
      success: true,
      data: activities
    });

  } catch (error) {
    console.error('❌ Get Recent Activities Error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลกิจกรรม',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
    
  } finally {
    if (connection) connection.release();
  }
};


/**
 * Get Pending Tasks
 */
const getPendingTasks = async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();

    // 1. คำขอเลื่อนนัดหมาย
    const [changeRequests] = await connection.execute(
      `SELECT COUNT(*) as count FROM AppointmentChangeRequests WHERE request_status = 'pending'`
    );

    // 2. Support Tickets ที่ยังไม่ได้จัดการ
    const [openTickets] = await connection.execute(
      `SELECT COUNT(*) as count FROM SupportTickets WHERE status = 'open'`
    );

    // 3. นัดหมายวันนี้ที่ยังไม่เสร็จ
    const [todayPending] = await connection.execute(
      `SELECT COUNT(*) as count 
       FROM Appointments 
       WHERE DATE(appointment_date) = CURDATE() 
       AND appointment_status = 'scheduled'`
    );

    // 4. Alerts ที่ยังไม่ได้ acknowledge
    //const [unacknowledgedAlerts] = await connection.execute(
      //`SELECT COUNT(*) as count 
       //FROM Alerts 
       //WHERE acknowledged = 0 AND resolution_status = 'pending'`
    //);
    const unacknowledgedAlerts = [{ count: 0 }];
    const tasks = [
      {
        id: 1,
        type: 'appointment',
        title: 'อนุมัติคำขอเลื่อนนัดหมาย',
        count: changeRequests[0].count,
        priority: changeRequests[0].count > 5 ? 'high' : 'medium',
      },
      {
        id: 2,
        type: 'support',
        title: 'Support Tickets ใหม่',
        count: openTickets[0].count,
        priority: openTickets[0].count > 3 ? 'high' : 'low',
      },
      {
        id: 3,
        type: 'today',
        title: 'นัดหมายวันนี้รอดำเนินการ',
        count: todayPending[0].count,
        priority: 'high',
      },
      {
        id: 4,
        type: 'alert',
        title: 'แจ้งเตือนรอตรวจสอบ',
        count: unacknowledgedAlerts[0].count,
        priority: unacknowledgedAlerts[0].count > 10 ? 'high' : 'medium',
      },
    ];

    return res.status(200).json({
      success: true,
      data: tasks.filter(task => task.count > 0),
    });

  } catch (error) {
    console.error('❌ Get Pending Tasks Error:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get Recent Patients
 */
const getRecentPatients = async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();

    const [patients] = await connection.execute(
      `SELECT 
        pp.patient_id,
        pp.patient_hn,
        pp.first_name,
        pp.last_name,
        pv.visit_date as last_visit_date,
        iop.left_eye_iop,
        iop.right_eye_iop,
        0 as alert_count
      FROM PatientProfiles pp
      LEFT JOIN (
        SELECT patient_id, MAX(visit_date) as visit_date
        FROM PatientVisits
        GROUP BY patient_id
      ) pv ON pp.patient_id = pv.patient_id
      LEFT JOIN (
        SELECT patient_id, left_eye_iop, right_eye_iop
        FROM IOP_Measurements
        WHERE (patient_id, measurement_date) IN (
          SELECT patient_id, MAX(measurement_date)
          FROM IOP_Measurements
          GROUP BY patient_id
        )
      ) iop ON pp.patient_id = iop.patient_id
      ORDER BY pv.visit_date DESC
      LIMIT 10`
);

    const formattedPatients = patients.map(p => {
      const avgIOP = p.left_eye_iop && p.right_eye_iop 
        ? Math.round((parseFloat(p.left_eye_iop) + parseFloat(p.right_eye_iop)) / 2)
        : p.left_eye_iop || p.right_eye_iop || 0;

      let status = 'active';
      if (avgIOP > 21 || p.alert_count > 0) {
        status = 'warning';
      }

      let lastVisit = 'ไม่มีข้อมูล';
      if (p.last_visit_date) {
        const daysDiff = Math.floor((new Date() - new Date(p.last_visit_date)) / (1000 * 60 * 60 * 24));
        if (daysDiff === 0) lastVisit = 'วันนี้';
        else if (daysDiff === 1) lastVisit = 'เมื่อวาน';
        else if (daysDiff < 7) lastVisit = `${daysDiff} วันที่แล้ว`;
        else if (daysDiff < 30) lastVisit = `${Math.floor(daysDiff / 7)} สัปดาห์ที่แล้ว`;
        else lastVisit = `${Math.floor(daysDiff / 30)} เดือนที่แล้ว`;
      }

      return {
        id: p.patient_id,
        hn: p.patient_hn,
        name: `${p.first_name} ${p.last_name}`,
        status,
        lastVisit,
        iop: avgIOP,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedPatients,
    });

  } catch (error) {
    console.error('❌ Get Recent Patients Error:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  getDashboardStats,
  getRecentActivities,
  getPendingTasks,
  getRecentPatients
};