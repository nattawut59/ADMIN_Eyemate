const db = require('../config/database');

// =========================================
// สถิติภาพรวมทั้งหมด (All-in-one)
// =========================================
exports.getOverviewStatistics = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    // ใช้ Transaction เพื่อความถูกต้องของข้อมูล
    await connection.beginTransaction();
    
    // 1. จำนวนผู้ใช้ทั้งหมด (แยกตาม role)
    const [userStats] = await connection.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'patient' THEN 1 ELSE 0 END) as total_patients,
        SUM(CASE WHEN role = 'doctor' THEN 1 ELSE 0 END) as total_doctors,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as total_admins,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_users
      FROM users
    `);
    
    // 2. จำนวนนัดหมายในเดือนนี้
    const [appointmentStats] = await connection.query(`
      SELECT 
        COUNT(*) as total_appointments,
        SUM(CASE WHEN appointment_status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
        SUM(CASE WHEN appointment_status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN appointment_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN appointment_status = 'rescheduled' THEN 1 ELSE 0 END) as rescheduled,
        SUM(CASE WHEN appointment_status = 'no_show' THEN 1 ELSE 0 END) as no_show
      FROM Appointments
      WHERE YEAR(appointment_date) = YEAR(CURRENT_DATE)
        AND MONTH(appointment_date) = MONTH(CURRENT_DATE)
    `);
    
    // 3. อัตราการเลื่อนนัดหมาย (เดือนนี้)
    const [rescheduleStats] = await connection.query(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN request_type = 'reschedule' THEN 1 ELSE 0 END) as reschedule_requests,
        SUM(CASE WHEN request_type = 'cancel' THEN 1 ELSE 0 END) as cancel_requests,
        SUM(CASE WHEN request_status = 'pending' THEN 1 ELSE 0 END) as pending_requests,
        SUM(CASE WHEN request_status = 'approved' THEN 1 ELSE 0 END) as approved_requests,
        SUM(CASE WHEN request_status = 'rejected' THEN 1 ELSE 0 END) as rejected_requests
      FROM AppointmentChangeRequests
      WHERE YEAR(created_at) = YEAR(CURRENT_DATE)
        AND MONTH(created_at) = MONTH(CURRENT_DATE)
    `);
    
    // คำนวณอัตราการเลื่อนนัดหมาย (%)
    const totalAppointmentsThisMonth = appointmentStats[0].total_appointments || 0;
    const totalRescheduleRequests = rescheduleStats[0].reschedule_requests || 0;
    const rescheduleRate = totalAppointmentsThisMonth > 0 
      ? ((totalRescheduleRequests / totalAppointmentsThisMonth) * 100).toFixed(2)
      : 0;
    
    // 4. สถิติการใช้ยา
    const [medicationStats] = await connection.query(`
      SELECT 
        COUNT(DISTINCT pm.prescription_id) as total_prescriptions,
        COUNT(DISTINCT pm.patient_id) as patients_on_medication,
        COUNT(DISTINCT pm.medication_id) as unique_medications_used,
        SUM(CASE WHEN pm.status = 'active' THEN 1 ELSE 0 END) as active_prescriptions,
        SUM(CASE WHEN pm.status = 'completed' THEN 1 ELSE 0 END) as completed_prescriptions,
        SUM(CASE WHEN pm.status = 'discontinued' THEN 1 ELSE 0 END) as discontinued_prescriptions
      FROM PatientMedications pm
    `);
    
    // 5. สถิติการปฏิบัติตามการใช้ยา (Medication Adherence)
    const [adherenceStats] = await connection.query(`
      SELECT 
        COUNT(*) as total_records,
        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
        SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed_count
      FROM MedicationUsageRecords
      WHERE YEAR(scheduled_time) = YEAR(CURRENT_DATE)
        AND MONTH(scheduled_time) = MONTH(CURRENT_DATE)
    `);
    
    // คำนวณอัตราการปฏิบัติตามการใช้ยา (%)
    const totalMedicationRecords = adherenceStats[0].total_records || 0;
    const takenCount = adherenceStats[0].taken_count || 0;
    const adherenceRate = totalMedicationRecords > 0
      ? ((takenCount / totalMedicationRecords) * 100).toFixed(2)
      : 0;
    
    await connection.commit();
    
    // Response ข้อมูลทั้งหมด
    res.status(200).json({
      success: true,
      data: {
        users: {
          total: userStats[0].total_users || 0,
          patients: userStats[0].total_patients || 0,
          doctors: userStats[0].total_doctors || 0,
          admins: userStats[0].total_admins || 0,
          active: userStats[0].active_users || 0,
          inactive: userStats[0].inactive_users || 0
        },
        appointments: {
          this_month: {
            total: appointmentStats[0].total_appointments || 0,
            scheduled: appointmentStats[0].scheduled || 0,
            completed: appointmentStats[0].completed || 0,
            cancelled: appointmentStats[0].cancelled || 0,
            rescheduled: appointmentStats[0].rescheduled || 0,
            no_show: appointmentStats[0].no_show || 0
          },
          reschedule_requests: {
            total: rescheduleStats[0].total_requests || 0,
            reschedule: rescheduleStats[0].reschedule_requests || 0,
            cancel: rescheduleStats[0].cancel_requests || 0,
            pending: rescheduleStats[0].pending_requests || 0,
            approved: rescheduleStats[0].approved_requests || 0,
            rejected: rescheduleStats[0].rejected_requests || 0,
            reschedule_rate: `${rescheduleRate}%`
          }
        },
        medications: {
          prescriptions: {
            total: medicationStats[0].total_prescriptions || 0,
            active: medicationStats[0].active_prescriptions || 0,
            completed: medicationStats[0].completed_prescriptions || 0,
            discontinued: medicationStats[0].discontinued_prescriptions || 0
          },
          patients_on_medication: medicationStats[0].patients_on_medication || 0,
          unique_medications_used: medicationStats[0].unique_medications_used || 0,
          adherence: {
            this_month: {
              total_records: adherenceStats[0].total_records || 0,
              taken: adherenceStats[0].taken_count || 0,
              skipped: adherenceStats[0].skipped_count || 0,
              delayed: adherenceStats[0].delayed_count || 0,
              adherence_rate: `${adherenceRate}%`
            }
          }
        }
      },
      message: 'ดึงข้อมูลสถิติภาพรวมสำเร็จ'
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error getting overview statistics:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// =========================================
// สถิติผู้ใช้งาน (รายละเอียด)
// =========================================
exports.getUserStatistics = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    // จำนวนผู้ใช้ทั้งหมดแยกตาม role และ status
    const [userStats] = await connection.query(`
      SELECT 
        role,
        status,
        COUNT(*) as count
      FROM users
      GROUP BY role, status
      ORDER BY role, status
    `);
    
    // จำนวนผู้ใช้ใหม่ในแต่ละเดือน (6 เดือนล่าสุด)
    const [newUsersPerMonth] = await connection.query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        role,
        COUNT(*) as count
      FROM users
      WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m'), role
      ORDER BY month DESC, role
    `);
    
    // ผู้ใช้ที่ login ล่าสุด (24 ชั่วโมง)
    const [recentLogins] = await connection.query(`
      SELECT 
        role,
        COUNT(*) as count
      FROM users
      WHERE last_login >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY role
    `);
    
    res.status(200).json({
      success: true,
      data: {
        by_role_and_status: userStats,
        new_users_per_month: newUsersPerMonth,
        recent_logins_24h: recentLogins
      },
      message: 'ดึงข้อมูลสถิติผู้ใช้สำเร็จ'
    });
    
  } catch (error) {
    console.error('Error getting user statistics:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติผู้ใช้',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// =========================================
// สถิตินัดหมาย (รายละเอียด)
// =========================================
exports.getAppointmentStatistics = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    // สถิตินัดหมายแยกตาม status (ทั้งหมด)
    const [statusStats] = await connection.query(`
      SELECT 
        appointment_status,
        COUNT(*) as count
      FROM Appointments
      GROUP BY appointment_status
      ORDER BY count DESC
    `);
    
    // นัดหมายในแต่ละเดือน (6 เดือนล่าสุด)
    const [appointmentsPerMonth] = await connection.query(`
      SELECT 
        DATE_FORMAT(appointment_date, '%Y-%m') as month,
        appointment_status,
        COUNT(*) as count
      FROM Appointments
      WHERE appointment_date >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(appointment_date, '%Y-%m'), appointment_status
      ORDER BY month DESC, appointment_status
    `);
    
    // สถิติการเลื่อนนัดหมายแยกตาม status
    const [rescheduleStats] = await connection.query(`
      SELECT 
        request_type,
        request_status,
        COUNT(*) as count
      FROM AppointmentChangeRequests
      GROUP BY request_type, request_status
      ORDER BY request_type, request_status
    `);
    
    // คำขอเลื่อนนัดที่รอดำเนินการ
    const [pendingRequests] = await connection.query(`
      SELECT 
        acr.request_id,
        acr.appointment_id,
        acr.patient_id,
        CONCAT(pp.first_name, ' ', pp.last_name) as patient_name,
        acr.request_type,
        acr.requested_new_date,
        acr.requested_new_time,
        acr.reason,
        acr.created_at,
        a.appointment_date as original_date,
        a.appointment_time as original_time
      FROM AppointmentChangeRequests acr
      JOIN PatientProfiles pp ON acr.patient_id = pp.patient_id
      JOIN Appointments a ON acr.appointment_id = a.appointment_id
      WHERE acr.request_status = 'pending'
      ORDER BY acr.created_at ASC
      LIMIT 10
    `);
    
    // นัดหมายที่จะถึงในอีก 7 วัน
    const [upcomingAppointments] = await connection.query(`
      SELECT 
        COUNT(*) as count,
        appointment_date
      FROM Appointments
      WHERE appointment_status = 'scheduled'
        AND appointment_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
      GROUP BY appointment_date
      ORDER BY appointment_date
    `);
    
    res.status(200).json({
      success: true,
      data: {
        by_status: statusStats,
        per_month: appointmentsPerMonth,
        reschedule_requests: rescheduleStats,
        pending_requests: {
          count: pendingRequests.length,
          requests: pendingRequests
        },
        upcoming_7_days: upcomingAppointments
      },
      message: 'ดึงข้อมูลสถิตินัดหมายสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error getting appointment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิตินัดหมาย',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// =========================================
// สถิติการใช้ยา (รายละเอียด)
// =========================================
exports.getMedicationStatistics = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    // ยาที่ถูกใช้มากที่สุด (Top 10)
    const [topMedications] = await connection.query(`
      SELECT 
        m.medication_id,
        m.name,
        m.generic_name,
        m.category,
        COUNT(DISTINCT pm.prescription_id) as prescription_count,
        COUNT(DISTINCT pm.patient_id) as patient_count
      FROM Medications m
      JOIN PatientMedications pm ON m.medication_id = pm.medication_id
      WHERE pm.status = 'active'
      GROUP BY m.medication_id, m.name, m.generic_name, m.category
      ORDER BY prescription_count DESC
      LIMIT 10
    `);
    
    // สถิติการปฏิบัติตามการใช้ยารายเดือน (6 เดือนล่าสุด)
    const [adherencePerMonth] = await connection.query(`
      SELECT 
        DATE_FORMAT(scheduled_time, '%Y-%m') as \`month\`,
        COUNT(*) as total_records,
        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
        SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed_count,
        ROUND((SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords
      WHERE scheduled_time >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(scheduled_time, '%Y-%m')
      ORDER BY \`month\` DESC
    `);
    
    // จำนวน prescription แยกตาม status
    const [prescriptionStatus] = await connection.query(`
      SELECT 
        status,
        COUNT(*) as count,
        COUNT(DISTINCT patient_id) as unique_patients
      FROM PatientMedications
      GROUP BY status
      ORDER BY count DESC
    `);
    
    // ผู้ป่วยที่มี adherence rate ต่ำ (< 70%)
    const [lowAdherencePatients] = await connection.query(`
      SELECT 
        mur.patient_id,
        CONCAT(pp.first_name, ' ', pp.last_name) as patient_name,
        COUNT(*) as total_records,
        SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        ROUND((SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords mur
      JOIN PatientProfiles pp ON mur.patient_id = pp.patient_id
      WHERE mur.scheduled_time >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
      GROUP BY mur.patient_id, pp.first_name, pp.last_name
      HAVING adherence_rate < 70
      ORDER BY adherence_rate ASC
      LIMIT 10
    `);
    
    // Medication Inventory ที่ใกล้หมด
    const [lowInventory] = await connection.query(`
      SELECT 
        mi.inventory_id,
        mi.patient_id,
        CONCAT(pp.first_name, ' ', pp.last_name) as patient_name,
        m.name as medication_name,
        mi.bottles_dispensed,
        mi.expected_end_date,
        DATEDIFF(mi.expected_end_date, CURRENT_DATE) as days_remaining
      FROM MedicationInventory mi
      JOIN PatientProfiles pp ON mi.patient_id = pp.patient_id
      JOIN Medications m ON mi.medication_id = m.medication_id
      WHERE mi.is_depleted = 0
        AND mi.expected_end_date IS NOT NULL
        AND DATEDIFF(mi.expected_end_date, CURRENT_DATE) <= 7
      ORDER BY days_remaining ASC
      LIMIT 10
    `);
    
    res.status(200).json({
      success: true,
      data: {
        top_medications: topMedications,
        adherence_per_month: adherencePerMonth,
        prescription_by_status: prescriptionStatus,
        low_adherence_patients: {
          count: lowAdherencePatients.length,
          patients: lowAdherencePatients
        },
        low_inventory_alert: {
          count: lowInventory.length,
          items: lowInventory
        }
      },
      message: 'ดึงข้อมูลสถิติการใช้ยาสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error getting medication statistics:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติการใช้ยา',
      error: error.message
    });
  } finally {
    connection.release();
  }
};