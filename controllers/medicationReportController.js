const db = require('../config/database');

// =========================================
// 1. รายงานการใช้ยารายเดือนของผู้ป่วยแต่ละคน
// =========================================
exports.getPatientMonthlyReport = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { patientId } = req.params;
    const { year, month } = req.query;
    
    // ใช้เดือนปัจจุบันถ้าไม่ระบุ
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || (new Date().getMonth() + 1);
    
    // ตรวจสอบว่า patient มีอยู่จริง
    const [patientCheck] = await connection.query(
      `SELECT patient_id, patient_hn, first_name, last_name, date_of_birth 
       FROM PatientProfiles 
       WHERE patient_id = ?`,
      [patientId]
    );
    
    if (patientCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบผู้ป่วยในระบบ'
      });
    }
    
    const patient = patientCheck[0];
    
    // 1. ข้อมูล Prescriptions ที่ active
    const [activePrescriptions] = await connection.query(`
      SELECT 
        pm.prescription_id,
        pm.medication_id,
        m.name as medication_name,
        m.generic_name,
        m.category,
        pm.eye,
        pm.dosage,
        pm.frequency,
        pm.status,
        DATE_FORMAT(pm.created_at, '%Y-%m-%d') as prescribed_date
      FROM PatientMedications pm
      JOIN Medications m ON pm.medication_id = m.medication_id
      WHERE pm.patient_id = ?
        AND pm.status = 'active'
      ORDER BY pm.created_at DESC
    `, [patientId]);
    
    // 2. สถิติการใช้ยาในเดือนที่เลือก (แยกตามยาแต่ละตัว)
    const [medicationStats] = await connection.query(`
      SELECT 
        mur.medication_id,
        m.name as medication_name,
        m.generic_name,
        COUNT(*) as total_scheduled,
        SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        SUM(CASE WHEN mur.status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
        SUM(CASE WHEN mur.status = 'delayed' THEN 1 ELSE 0 END) as delayed_count,
        ROUND((SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords mur
      JOIN Medications m ON mur.medication_id = m.medication_id
      WHERE mur.patient_id = ?
        AND YEAR(mur.scheduled_time) = ?
        AND MONTH(mur.scheduled_time) = ?
      GROUP BY mur.medication_id, m.name, m.generic_name
      ORDER BY adherence_rate ASC
    `, [patientId, targetYear, targetMonth]);
    
    // 3. สถิติรวมทั้งหมดในเดือนนี้
    const [overallStats] = await connection.query(`
      SELECT 
        COUNT(*) as total_scheduled,
        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
        SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed_count,
        ROUND((SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as overall_adherence_rate
      FROM MedicationUsageRecords
      WHERE patient_id = ?
        AND YEAR(scheduled_time) = ?
        AND MONTH(scheduled_time) = ?
    `, [patientId, targetYear, targetMonth]);
    
    // 4. แนวโน้ม 6 เดือนล่าสุด
    const [trendData] = await connection.query(`
      SELECT 
        DATE_FORMAT(scheduled_time, '%Y-%m') as month,
        COUNT(*) as total_records,
        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        ROUND((SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords
      WHERE patient_id = ?
        AND scheduled_time >= DATE_SUB(CONCAT(?, '-', LPAD(?, 2, '0'), '-01'), INTERVAL 5 MONTH)
        AND scheduled_time < DATE_ADD(CONCAT(?, '-', LPAD(?, 2, '0'), '-01'), INTERVAL 1 MONTH)
      GROUP BY DATE_FORMAT(scheduled_time, '%Y-%m')
      ORDER BY month ASC
    `, [patientId, targetYear, targetMonth, targetYear, targetMonth]);
    
    // 5. สต็อกยาปัจจุบัน
    const [inventoryData] = await connection.query(`
      SELECT 
        mi.inventory_id,
        mi.medication_id,
        m.name as medication_name,
        mi.bottles_dispensed,
        mi.bottle_volume_ml,
        DATE_FORMAT(mi.dispensed_date, '%Y-%m-%d') as dispensed_date,
        DATE_FORMAT(mi.expected_end_date, '%Y-%m-%d') as expected_end_date,
        DATEDIFF(mi.expected_end_date, CURRENT_DATE) as days_remaining,
        mi.is_depleted
      FROM MedicationInventory mi
      JOIN Medications m ON mi.medication_id = m.medication_id
      WHERE mi.patient_id = ?
        AND mi.is_depleted = 0
      ORDER BY mi.expected_end_date ASC
    `, [patientId]);
    
    // 6. รายการหยดยาล่าสุด 10 ครั้ง (ในเดือนที่เลือก)
    const [recentUsage] = await connection.query(`
      SELECT 
        mur.record_id,
        m.name as medication_name,
        mur.eye,
        DATE_FORMAT(mur.scheduled_time, '%Y-%m-%d %H:%i') as scheduled_time,
        DATE_FORMAT(mur.actual_time, '%Y-%m-%d %H:%i') as actual_time,
        mur.status,
        mur.drops_count,
        CASE 
          WHEN mur.status = 'taken' AND mur.actual_time IS NOT NULL 
          THEN TIMESTAMPDIFF(MINUTE, mur.scheduled_time, mur.actual_time)
          ELSE NULL
        END as delay_minutes,
        mur.notes
      FROM MedicationUsageRecords mur
      JOIN Medications m ON mur.medication_id = m.medication_id
      WHERE mur.patient_id = ?
        AND YEAR(mur.scheduled_time) = ?
        AND MONTH(mur.scheduled_time) = ?
      ORDER BY mur.scheduled_time DESC
      LIMIT 10
    `, [patientId, targetYear, targetMonth]);
    
    // คำนวณสถานะ adherence
    const overallAdherence = overallStats[0]?.overall_adherence_rate || 0;
    let adherenceStatus = 'unknown';
    let adherenceMessage = '';
    
    if (overallAdherence >= 90) {
      adherenceStatus = 'excellent';
      adherenceMessage = 'ดีมาก - ปฏิบัติตามการใช้ยาได้เป็นอย่างดี';
    } else if (overallAdherence >= 80) {
      adherenceStatus = 'good';
      adherenceMessage = 'ดี - ปฏิบัติตามการใช้ยาได้ดี';
    } else if (overallAdherence >= 70) {
      adherenceStatus = 'fair';
      adherenceMessage = 'ปานกลาง - ควรเพิ่มความสม่ำเสมอในการใช้ยา';
    } else if (overallAdherence > 0) {
      adherenceStatus = 'poor';
      adherenceMessage = 'ต่ำ - ต้องติดตามและให้คำแนะนำเพิ่มเติม';
    } else {
      adherenceStatus = 'no_data';
      adherenceMessage = 'ไม่มีข้อมูลการใช้ยาในเดือนนี้';
    }
    
    // คำนวณ trend direction
    let trendDirection = 'stable';
    if (trendData.length >= 2) {
      const lastMonth = trendData[trendData.length - 1].adherence_rate;
      const previousMonth = trendData[trendData.length - 2].adherence_rate;
      const difference = lastMonth - previousMonth;
      
      if (difference > 5) {
        trendDirection = 'improving';
      } else if (difference < -5) {
        trendDirection = 'declining';
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        patient_info: {
          patient_id: patient.patient_id,
          patient_hn: patient.patient_hn,
          full_name: `${patient.first_name} ${patient.last_name}`,
          date_of_birth: patient.date_of_birth
        },
        report_period: {
          year: parseInt(targetYear),
          month: parseInt(targetMonth),
          month_name_th: new Date(targetYear, targetMonth - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
        },
        overall_summary: {
          total_scheduled: overallStats[0]?.total_scheduled || 0,
          taken: overallStats[0]?.taken_count || 0,
          skipped: overallStats[0]?.skipped_count || 0,
          delayed: overallStats[0]?.delayed_count || 0,
          adherence_rate: overallAdherence,
          adherence_status: adherenceStatus,
          adherence_message: adherenceMessage
        },
        active_prescriptions: {
          count: activePrescriptions.length,
          medications: activePrescriptions
        },
        medication_details: medicationStats,
        trend_6_months: {
          data: trendData,
          direction: trendDirection,
          message: trendDirection === 'improving' ? 'แนวโน้มดีขึ้น' :
                   trendDirection === 'declining' ? 'แนวโน้มลดลง - ต้องติดตาม' :
                   'แนวโน้มคงที่'
        },
        inventory_status: {
          count: inventoryData.length,
          items: inventoryData,
          low_stock_alert: inventoryData.filter(item => item.days_remaining <= 7).length
        },
        recent_usage: recentUsage
      },
      message: 'ดึงข้อมูลรายงานการใช้ยารายเดือนสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error getting patient monthly report:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายงาน',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// =========================================
// 2. รายการผู้ป่วยทั้งหมดพร้อม Adherence Rate
// =========================================
exports.getAllPatientsAdherence = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { year, month, minAdherence, maxAdherence } = req.query;
    
    // ใช้เดือนปัจจุบันถ้าไม่ระบุ
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || (new Date().getMonth() + 1);
    
    // Query ผู้ป่วยทั้งหมดพร้อม adherence rate
    let query = `
      SELECT 
        pp.patient_id,
        pp.patient_hn,
        CONCAT(pp.first_name, ' ', pp.last_name) as patient_name,
        COUNT(DISTINCT pm.prescription_id) as active_prescriptions,
        COUNT(mur.record_id) as total_scheduled,
        SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        ROUND((SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) / COUNT(mur.record_id)) * 100, 2) as adherence_rate
      FROM PatientProfiles pp
      LEFT JOIN PatientMedications pm ON pp.patient_id = pm.patient_id AND pm.status = 'active'
      LEFT JOIN MedicationUsageRecords mur ON pp.patient_id = mur.patient_id
        AND YEAR(mur.scheduled_time) = ?
        AND MONTH(mur.scheduled_time) = ?
      GROUP BY pp.patient_id, pp.patient_hn, pp.first_name, pp.last_name
      HAVING total_scheduled > 0
    `;
    
    const params = [targetYear, targetMonth];
    
    // Filter ตาม adherence rate ถ้ามี
    if (minAdherence !== undefined) {
      query += ` AND adherence_rate >= ?`;
      params.push(parseFloat(minAdherence));
    }
    
    if (maxAdherence !== undefined) {
      query += ` AND adherence_rate <= ?`;
      params.push(parseFloat(maxAdherence));
    }
    
    query += ` ORDER BY adherence_rate ASC`;
    
    const [patients] = await connection.query(query, params);
    
    // จัดกลุ่มผู้ป่วยตาม adherence level
    const excellent = patients.filter(p => p.adherence_rate >= 90);
    const good = patients.filter(p => p.adherence_rate >= 80 && p.adherence_rate < 90);
    const fair = patients.filter(p => p.adherence_rate >= 70 && p.adherence_rate < 80);
    const poor = patients.filter(p => p.adherence_rate < 70);
    
    res.status(200).json({
      success: true,
      data: {
        report_period: {
          year: parseInt(targetYear),
          month: parseInt(targetMonth),
          month_name_th: new Date(targetYear, targetMonth - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
        },
        summary: {
          total_patients: patients.length,
          excellent_count: excellent.length,
          good_count: good.length,
          fair_count: fair.length,
          poor_count: poor.length,
          average_adherence: patients.length > 0 
            ? (patients.reduce((sum, p) => sum + parseFloat(p.adherence_rate), 0) / patients.length).toFixed(2)
            : 0
        },
        patients_by_level: {
          excellent: excellent,
          good: good,
          fair: fair,
          poor: poor
        },
        all_patients: patients
      },
      message: 'ดึงข้อมูลรายการผู้ป่วยสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error getting all patients adherence:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการผู้ป่วย',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// =========================================
// 3. Alert ผู้ป่วยที่ต้องติดตามเร่งด่วน
// =========================================
exports.getMedicationAlerts = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    // 1. ผู้ป่วยที่ไม่ได้หยดยามากกว่า 2 วัน
    const [missedDoses] = await connection.query(`
      SELECT 
        pp.patient_id,
        pp.patient_hn,
        CONCAT(pp.first_name, ' ', pp.last_name) as patient_name,
        m.name as medication_name,
        DATE_FORMAT(MAX(mur.scheduled_time), '%Y-%m-%d %H:%i') as last_missed_time,
        DATEDIFF(CURRENT_DATE, DATE(MAX(mur.scheduled_time))) as days_missed,
        COUNT(*) as total_missed
      FROM MedicationUsageRecords mur
      JOIN PatientProfiles pp ON mur.patient_id = pp.patient_id
      JOIN Medications m ON mur.medication_id = m.medication_id
      WHERE mur.status = 'skipped'
        AND mur.scheduled_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY pp.patient_id, pp.patient_hn, pp.first_name, pp.last_name, m.medication_id, m.name
      HAVING days_missed >= 2
      ORDER BY days_missed DESC, last_missed_time DESC
    `);
    
    // 2. ผู้ป่วยที่ adherence ต่ำกว่า 70% (30 วันล่าสุด)
    const [lowAdherence] = await connection.query(`
      SELECT 
        pp.patient_id,
        pp.patient_hn,
        CONCAT(pp.first_name, ' ', pp.last_name) as patient_name,
        COUNT(*) as total_scheduled,
        SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        SUM(CASE WHEN mur.status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
        ROUND((SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords mur
      JOIN PatientProfiles pp ON mur.patient_id = pp.patient_id
      WHERE mur.scheduled_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY pp.patient_id, pp.patient_hn, pp.first_name, pp.last_name
      HAVING adherence_rate < 70
      ORDER BY adherence_rate ASC
    `);
    
    res.status(200).json({
      success: true,
      data: {
        summary: {
          total_alerts: missedDoses.length + lowAdherence.length,
          critical_count: missedDoses.length,
          warning_count: lowAdherence.length
        },
        alerts: {
          critical: {
            title: 'ไม่ได้หยดยามากกว่า 2 วัน',
            description: 'ผู้ป่วยที่ข้ามการหยดยาติดต่อกันมากกว่า 2 วัน ต้องติดตามเร่งด่วน',
            count: missedDoses.length,
            patients: missedDoses,
            priority: 'high',
            action_required: 'ติดต่อผู้ป่วยทันที'
          },
          warning: {
            title: 'Adherence Rate ต่ำกว่า 70%',
            description: 'ผู้ป่วยที่มีอัตราการปฏิบัติตามการใช้ยาต่ำกว่า 70% ใน 30 วันที่ผ่านมา',
            count: lowAdherence.length,
            patients: lowAdherence,
            priority: 'medium',
            action_required: 'ติดตามและให้คำแนะนำ'
          }
        }
      },
      message: 'ดึงข้อมูล alerts สำเร็จ'
    });
    
  } catch (error) {
    console.error('Error getting medication alerts:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล alerts',
      error: error.message
    });
  } finally {
    connection.release();
  }
};


// =========================================
// 4. ภาพรวมรายงานการใช้ยาทั้งระบบ
// =========================================
exports.getMedicationOverview = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { year, month } = req.query;
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || (new Date().getMonth() + 1);
    
    // 1. สถิติรวม
    const [overallStats] = await connection.query(`
      SELECT 
        COUNT(DISTINCT mur.patient_id) as total_patients,
        COUNT(DISTINCT mur.medication_id) as total_medications,
        COUNT(*) as total_scheduled,
        SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) as total_taken,
        SUM(CASE WHEN mur.status = 'skipped' THEN 1 ELSE 0 END) as total_skipped,
        SUM(CASE WHEN mur.status = 'delayed' THEN 1 ELSE 0 END) as total_delayed,
        ROUND((SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as average_adherence_rate
      FROM MedicationUsageRecords mur
      WHERE YEAR(mur.scheduled_time) = ?
        AND MONTH(mur.scheduled_time) = ?
    `, [targetYear, targetMonth]);
    
    // 2. Alert Summary
    const [criticalAlerts] = await connection.query(`
      SELECT COUNT(DISTINCT patient_id) as count
      FROM MedicationUsageRecords
      WHERE status = 'skipped'
        AND scheduled_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY patient_id, medication_id
      HAVING DATEDIFF(CURRENT_DATE, DATE(MAX(scheduled_time))) >= 2
    `);
    
    const [warningAlerts] = await connection.query(`
      SELECT COUNT(DISTINCT patient_id) as count
      FROM (
        SELECT 
          patient_id,
          ROUND((SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
        FROM MedicationUsageRecords
        WHERE scheduled_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY patient_id
        HAVING adherence_rate < 70
      ) as low_adherence_patients
    `);
    
    // 3. การกระจาย Adherence
    const [adherenceDistribution] = await connection.query(`
      SELECT 
        CASE 
          WHEN adherence_rate >= 90 THEN 'excellent'
          WHEN adherence_rate >= 80 THEN 'good'
          WHEN adherence_rate >= 70 THEN 'fair'
          ELSE 'poor'
        END as level,
        COUNT(*) as count
      FROM (
        SELECT 
          patient_id,
          ROUND((SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
        FROM MedicationUsageRecords
        WHERE YEAR(scheduled_time) = ?
          AND MONTH(scheduled_time) = ?
        GROUP BY patient_id
      ) as patient_adherence
      GROUP BY level
      ORDER BY 
        CASE level
          WHEN 'excellent' THEN 1
          WHEN 'good' THEN 2
          WHEN 'fair' THEN 3
          WHEN 'poor' THEN 4
        END
    `, [targetYear, targetMonth]);
    
    // 4. Top 10 ผู้ป่วยดีที่สุด
    const [topPatients] = await connection.query(`
      SELECT 
        pp.patient_id,
        pp.patient_hn,
        CONCAT(pp.first_name, ' ', pp.last_name) as patient_name,
        COUNT(*) as total_scheduled,
        SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        ROUND((SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords mur
      JOIN PatientProfiles pp ON mur.patient_id = pp.patient_id
      WHERE YEAR(mur.scheduled_time) = ?
        AND MONTH(mur.scheduled_time) = ?
      GROUP BY pp.patient_id, pp.patient_hn, pp.first_name, pp.last_name
      HAVING total_scheduled >= 10
      ORDER BY adherence_rate DESC, taken_count DESC
      LIMIT 10
    `, [targetYear, targetMonth]);
    
    // 5. Top 10 ผู้ป่วยต้องปรับปรุง
    const [bottomPatients] = await connection.query(`
      SELECT 
        pp.patient_id,
        pp.patient_hn,
        CONCAT(pp.first_name, ' ', pp.last_name) as patient_name,
        COUNT(*) as total_scheduled,
        SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        SUM(CASE WHEN mur.status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
        ROUND((SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords mur
      JOIN PatientProfiles pp ON mur.patient_id = pp.patient_id
      WHERE YEAR(mur.scheduled_time) = ?
        AND MONTH(mur.scheduled_time) = ?
      GROUP BY pp.patient_id, pp.patient_hn, pp.first_name, pp.last_name
      HAVING total_scheduled >= 10
      ORDER BY adherence_rate ASC, skipped_count DESC
      LIMIT 10
    `, [targetYear, targetMonth]);
    
    // 6. แนวโน้ม 6 เดือนล่าสุด
    const [trendData] = await connection.query(`
      SELECT 
        DATE_FORMAT(scheduled_time, '%Y-%m') as month,
        COUNT(*) as total_scheduled,
        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken_count,
        ROUND((SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords
      WHERE scheduled_time >= DATE_SUB(CONCAT(?, '-', LPAD(?, 2, '0'), '-01'), INTERVAL 6 MONTH)
        AND scheduled_time < DATE_ADD(CONCAT(?, '-', LPAD(?, 2, '0'), '-01'), INTERVAL 1 MONTH)
      GROUP BY DATE_FORMAT(scheduled_time, '%Y-%m')
      ORDER BY month ASC
    `, [targetYear, targetMonth, targetYear, targetMonth]);
    const trendDataWithLabels = trendData.map(row => ({
      ...row,
      month_label_th: new Date(row.month + '-01').toLocaleDateString('th-TH', { 
        month: 'short', 
        year: 'numeric' 
      })
    }));
    console.log('Trend Data with Labels:', trendDataWithLabels);

    // 7. ยาที่ใช้บ่อยที่สุด
    const [topMedications] = await connection.query(`
      SELECT 
        m.medication_id,
        m.name as medication_name,
        m.generic_name,
        COUNT(DISTINCT mur.patient_id) as patient_count,
        COUNT(*) as usage_count,
        ROUND((SUM(CASE WHEN mur.status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as adherence_rate
      FROM MedicationUsageRecords mur
      JOIN Medications m ON mur.medication_id = m.medication_id
      WHERE YEAR(mur.scheduled_time) = ?
        AND MONTH(mur.scheduled_time) = ?
      GROUP BY m.medication_id, m.name, m.generic_name
      ORDER BY patient_count DESC, usage_count DESC
      LIMIT 10
    `, [targetYear, targetMonth]);
    
    // แปลง adherenceDistribution เป็น object
    const distribution = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0
    };
    
    adherenceDistribution.forEach(row => {
      distribution[row.level] = parseInt(row.count);
    });
    
    res.status(200).json({
      success: true,
      data: {
        report_period: {
          year: parseInt(targetYear),
          month: parseInt(targetMonth),
          month_name_th: new Date(targetYear, targetMonth - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
        },
        overall_stats: {
          total_patients: overallStats[0]?.total_patients || 0,
          total_medications: overallStats[0]?.total_medications || 0,
          total_scheduled: overallStats[0]?.total_scheduled || 0,
          total_taken: overallStats[0]?.total_taken || 0,
          total_skipped: overallStats[0]?.total_skipped || 0,
          total_delayed: overallStats[0]?.total_delayed || 0,
          average_adherence_rate: overallStats[0]?.average_adherence_rate || 0
        },
        alert_summary: {
          critical_count: criticalAlerts.length,
          warning_count: warningAlerts.length > 0 ? warningAlerts[0].count : 0,
          total_alerts: criticalAlerts.length + (warningAlerts.length > 0 ? warningAlerts[0].count : 0)
        },
        adherence_distribution: distribution,
        top_performers: topPatients,
        need_improvement: bottomPatients,
        trend_6_months: trendData,
        top_medications: topMedications
      },
      message: 'ดึงข้อมูลภาพรวมรายงานสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error getting medication overview:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลภาพรวม',
      error: error.message
    });
  } finally {
    connection.release();
  }
};