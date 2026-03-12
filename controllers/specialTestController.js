const db = require('../config/database');
const fs = require('fs');
const path = require('path');

const generateTestId = () => `TEST${Date.now()}`;
const generateOctId  = () => `OCT${Date.now()}`;
// ✅ เพิ่ม generateDocId
const generateDocId  = () => `DOC${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

exports.uploadTestReport = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { patient_id, doctor_id, test_date, test_type, eye, notes, visit_id } = req.body;

    if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ PDF ที่จะอัปโหลด' });
    if (!patient_id || !doctor_id || !test_date || !test_type || !eye) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const [patientCheck] = await connection.query('SELECT patient_id FROM PatientProfiles WHERE patient_id = ?', [patient_id]);
    if (patientCheck.length === 0) { fs.unlinkSync(req.file.path); await connection.rollback(); return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ป่วยในระบบ' }); }

    const [doctorCheck] = await connection.query('SELECT doctor_id FROM DoctorProfiles WHERE doctor_id = ?', [doctor_id]);
    if (doctorCheck.length === 0) { fs.unlinkSync(req.file.path); await connection.rollback(); return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลแพทย์ในระบบ' }); }

    const testId    = generateTestId();
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const reportUrl = `${baseUrl}/uploads/${path.basename(path.dirname(req.file.path))}/${req.file.filename}`;

    if (test_type === 'CTVF') {
      await connection.query(
        `INSERT INTO VisualFieldTests (test_id, patient_id, doctor_id, test_date, test_type, pdf_report_url, notes, visit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [testId, patient_id, doctor_id, test_date, 'Visual Field Test', reportUrl, notes, visit_id || null]
      );
    } else {
      await connection.query(
        `INSERT INTO SpecialEyeTests (test_id, patient_id, doctor_id, test_date, test_type, eye, report_url, notes, visit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [testId, patient_id, doctor_id, test_date, test_type, eye, reportUrl, notes, visit_id || null]
      );
      if (test_type === 'OCT') {
        await connection.query(`INSERT INTO OCT_Results (oct_id, test_id) VALUES (?, ?)`, [generateOctId(), testId]);
      }
    }

    // ✅ จุดที่ 1: Insert ลง MedicalDocuments ด้วยทุกครั้งที่ upload
    const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const d = new Date(test_date);
    const thaiDateStr = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
    await connection.query(
      `INSERT INTO MedicalDocuments (document_id, patient_id, document_type, document_title, file_url, file_size, file_format, uploaded_by, description, visit_id, is_archived) VALUES (?, ?, 'examination_result', ?, ?, ?, ?, ?, ?, ?, 0)`,
      [generateDocId(), patient_id, `ผลการตรวจ ${test_type} วันที่ ${thaiDateStr}`, reportUrl, req.file.size, path.extname(req.file.originalname).replace('.', '').toLowerCase(), doctor_id, notes || null, visit_id || null]
    );

    await connection.commit();
    res.status(201).json({ success: true, message: 'อัปโหลดผลการตรวจสำเร็จ', data: { test_id: testId, patient_id, test_type, test_date, report_url: reportUrl, filename: req.file.filename } });

  } catch (error) {
    await connection.rollback();
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error uploading test report:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปโหลดผลการตรวจ', error: error.message });
  } finally {
    connection.release();
  }
};

exports.getAllTestReports = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', test_type = '', start_date = '', end_date = '' } = req.query;
    const offset = (page - 1) * limit;
    let whereConditions = [], queryParams = [];

    if (search) {
      whereConditions.push(`(pp.first_name LIKE ? OR pp.last_name LIKE ? OR pp.patient_hn LIKE ? OR st.patient_id LIKE ?)`);
      const s = `%${search}%`;
      queryParams.push(s, s, s, s);
    }
    if (test_type) { whereConditions.push('st.test_type = ?'); queryParams.push(test_type); }
    if (start_date) { whereConditions.push('st.test_date >= ?'); queryParams.push(start_date); }
    if (end_date) { whereConditions.push('st.test_date <= ?'); queryParams.push(end_date); }
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const specialTestsQuery = `SELECT st.test_id, st.patient_id, pp.patient_hn, CONCAT(pp.first_name, ' ', pp.last_name) as patient_name, st.doctor_id, CONCAT(dp.first_name, ' ', dp.last_name) as doctor_name, st.test_date, st.test_type, st.eye, st.report_url, st.notes, 'SpecialEyeTests' as source_table FROM SpecialEyeTests st INNER JOIN PatientProfiles pp ON st.patient_id = pp.patient_id INNER JOIN DoctorProfiles dp ON st.doctor_id = dp.doctor_id ${whereClause}`;
    const visualFieldQuery  = `SELECT vft.test_id, vft.patient_id, pp.patient_hn, CONCAT(pp.first_name, ' ', pp.last_name) as patient_name, vft.doctor_id, CONCAT(dp.first_name, ' ', dp.last_name) as doctor_name, vft.test_date, 'CTVF' as test_type, 'both' as eye, vft.pdf_report_url as report_url, vft.notes, 'VisualFieldTests' as source_table FROM VisualFieldTests vft INNER JOIN PatientProfiles pp ON vft.patient_id = pp.patient_id INNER JOIN DoctorProfiles dp ON vft.doctor_id = dp.doctor_id ${whereClause.replace(/st\./g, 'vft.')}`;

    const [tests]       = await db.query(`SELECT * FROM (${specialTestsQuery} UNION ALL ${visualFieldQuery}) as combined_tests ORDER BY test_date DESC LIMIT ? OFFSET ?`, [...queryParams, ...queryParams, parseInt(limit), parseInt(offset)]);
    const [countResult] = await db.query(`SELECT COUNT(*) as total FROM (${specialTestsQuery} UNION ALL ${visualFieldQuery}) as combined_tests`, [...queryParams, ...queryParams]);

    res.json({ success: true, data: tests, pagination: { page: parseInt(page), limit: parseInt(limit), total: countResult[0].total, totalPages: Math.ceil(countResult[0].total / limit) } });
  } catch (error) {
    console.error('Error getting test reports:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผลการตรวจ', error: error.message });
  }
};

exports.getTestReportById = async (req, res) => {
  try {
    const { test_id } = req.params;
    const [specialTests] = await db.query(`SELECT st.*, pp.patient_hn, CONCAT(pp.first_name, ' ', pp.last_name) as patient_name, pp.date_of_birth, CONCAT(dp.first_name, ' ', dp.last_name) as doctor_name, dp.specialty, 'SpecialEyeTests' as source_table FROM SpecialEyeTests st INNER JOIN PatientProfiles pp ON st.patient_id = pp.patient_id INNER JOIN DoctorProfiles dp ON st.doctor_id = dp.doctor_id WHERE st.test_id = ?`, [test_id]);
    if (specialTests.length > 0) return res.json({ success: true, data: specialTests[0] });

    const [visualFieldTests] = await db.query(`SELECT vft.*, pp.patient_hn, CONCAT(pp.first_name, ' ', pp.last_name) as patient_name, pp.date_of_birth, CONCAT(dp.first_name, ' ', dp.last_name) as doctor_name, dp.specialty, 'VisualFieldTests' as source_table FROM VisualFieldTests vft INNER JOIN PatientProfiles pp ON vft.patient_id = pp.patient_id INNER JOIN DoctorProfiles dp ON vft.doctor_id = dp.doctor_id WHERE vft.test_id = ?`, [test_id]);
    if (visualFieldTests.length > 0) return res.json({ success: true, data: visualFieldTests[0] });

    res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผลการตรวจ' });
  } catch (error) {
    console.error('Error getting test report by ID:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผลการตรวจ', error: error.message });
  }
};

exports.deleteTestReport = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { test_id } = req.params;

    const [specialTests] = await connection.query('SELECT report_url FROM SpecialEyeTests WHERE test_id = ?', [test_id]);
    let reportUrl = null, deletedFrom = null;

    if (specialTests.length > 0) {
      reportUrl = specialTests[0].report_url; deletedFrom = 'SpecialEyeTests';
      await connection.query('DELETE FROM SpecialEyeTests WHERE test_id = ?', [test_id]);
    } else {
      const [visualFieldTests] = await connection.query('SELECT pdf_report_url as report_url FROM VisualFieldTests WHERE test_id = ?', [test_id]);
      if (visualFieldTests.length > 0) {
        reportUrl = visualFieldTests[0].report_url || 'no_file'; deletedFrom = 'VisualFieldTests';
        await connection.query('DELETE FROM VisualFieldTests WHERE test_id = ?', [test_id]);
      }
    }

    if (!deletedFrom) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผลการตรวจที่ต้องการลบ' });
    }

    // ✅ จุดที่ 2: ลบออกจาก MedicalDocuments ด้วย
    if (reportUrl && reportUrl !== 'no_file') {
      await connection.query('DELETE FROM MedicalDocuments WHERE file_url = ?', [reportUrl]);
    }

    const filePath = path.join(__dirname, '..', reportUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await connection.commit();
    res.json({ success: true, message: 'ลบผลการตรวจสำเร็จ', data: { test_id, deleted_from: deletedFrom } });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting test report:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบผลการตรวจ', error: error.message });
  } finally {
    connection.release();
  }
};

exports.updateTestReport = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { test_id } = req.params;
    const { doctor_id, test_date, test_type, eye, notes } = req.body;

    if (doctor_id) {
      const [doctorCheck] = await connection.query('SELECT doctor_id FROM DoctorProfiles WHERE doctor_id = ?', [doctor_id]);
      if (doctorCheck.length === 0) { await connection.rollback(); return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลแพทย์ในระบบ' }); }
    }

    const [su] = await connection.query(`UPDATE SpecialEyeTests SET doctor_id = COALESCE(?, doctor_id), test_date = COALESCE(?, test_date), test_type = COALESCE(?, test_type), eye = COALESCE(?, eye), notes = COALESCE(?, notes) WHERE test_id = ?`, [doctor_id, test_date, test_type, eye, notes, test_id]);
    if (su.affectedRows > 0) {
      await connection.commit();
      const [u] = await connection.query(`SELECT st.*, CONCAT(pp.first_name, ' ', pp.last_name) as patient_name, CONCAT(dp.first_name, ' ', dp.last_name) as doctor_name FROM SpecialEyeTests st INNER JOIN PatientProfiles pp ON st.patient_id = pp.patient_id INNER JOIN DoctorProfiles dp ON st.doctor_id = dp.doctor_id WHERE st.test_id = ?`, [test_id]);
      return res.json({ success: true, message: 'แก้ไขข้อมูลผลการตรวจสำเร็จ', data: u[0] });
    }

    const [vu] = await connection.query(`UPDATE VisualFieldTests SET doctor_id = COALESCE(?, doctor_id), test_date = COALESCE(?, test_date), notes = COALESCE(?, notes) WHERE test_id = ?`, [doctor_id, test_date, notes, test_id]);
    if (vu.affectedRows > 0) {
      await connection.commit();
      const [u] = await connection.query(`SELECT vft.*, CONCAT(pp.first_name, ' ', pp.last_name) as patient_name, CONCAT(dp.first_name, ' ', dp.last_name) as doctor_name FROM VisualFieldTests vft INNER JOIN PatientProfiles pp ON vft.patient_id = pp.patient_id INNER JOIN DoctorProfiles dp ON vft.doctor_id = dp.doctor_id WHERE vft.test_id = ?`, [test_id]);
      return res.json({ success: true, message: 'แก้ไขข้อมูลผลการตรวจสำเร็จ', data: u[0] });
    }

    await connection.rollback();
    res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผลการตรวจที่ต้องการแก้ไข' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating test report:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลผลการตรวจ', error: error.message });
  } finally {
    connection.release();
  }
};

exports.downloadTestReport = async (req, res) => {
  try {
    const { test_id } = req.params;
    const [specialTests] = await db.query('SELECT report_url, test_type, patient_id FROM SpecialEyeTests WHERE test_id = ?', [test_id]);
    let reportUrl, testType, patientId;

    if (specialTests.length > 0) {
      reportUrl = specialTests[0].report_url; testType = specialTests[0].test_type; patientId = specialTests[0].patient_id;
    } else {
      const [vf] = await db.query('SELECT pdf_report_url as report_url, patient_id FROM VisualFieldTests WHERE test_id = ?', [test_id]);
      if (vf.length > 0) { reportUrl = vf[0].report_url; testType = 'CTVF'; patientId = vf[0].patient_id; }
    }

    if (!reportUrl) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์ที่ต้องการดาวน์โหลด' });
    const filePath = path.join(__dirname, '..', reportUrl);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์ในระบบ' });

    res.download(filePath, `${testType}_${patientId}_${test_id}.pdf`, (err) => {
      if (err) { console.error('Error downloading file:', err); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์' }); }
    });
  } catch (error) {
    console.error('Error in download:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์', error: error.message });
  }
};

exports.getPatientsList = async (req, res) => {
  try {
    const [patients] = await db.query(`SELECT patient_id, patient_hn, CONCAT(first_name, ' ', last_name) as patient_name, date_of_birth, gender FROM PatientProfiles WHERE patient_id IN (SELECT user_id FROM users WHERE status = 'active') ORDER BY patient_hn`);
    res.json({ success: true, data: patients });
  } catch (error) {
    console.error('Error getting patients list:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงรายชื่อผู้ป่วย', error: error.message });
  }
};

exports.getDoctorsList = async (req, res) => {
  try {
    const [doctors] = await db.query(`SELECT doctor_id, CONCAT(first_name, ' ', last_name) as doctor_name, specialty, department FROM DoctorProfiles WHERE doctor_id IN (SELECT user_id FROM users WHERE status = 'active') ORDER BY first_name`);
    res.json({ success: true, data: doctors });
  } catch (error) {
    console.error('Error getting doctors list:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงรายชื่อแพทย์', error: error.message });
  }
};