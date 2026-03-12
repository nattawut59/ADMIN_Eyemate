const express = require('express');
const router = express.Router();
const specialTestController = require('../controllers/specialTestController');
const { verifyToken, checkAdmin } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

// ใช้ middleware ตรวจสอบ authentication และ admin role ทุก route
router.use(verifyToken);  // ตรวจสอบ token ก่อน
router.use(checkAdmin);   // จากนั้นตรวจสอบว่าเป็น admin

/**
 * @route   POST /api/special-tests/upload
 * @desc    อัปโหลดไฟล์ PDF ผลการตรวจ
 * @access  Admin only
 */
router.post('/upload', upload.single('pdf_file'), specialTestController.uploadTestReport);

/**
 * @route   GET /api/special-tests
 * @desc    ดูรายการผลการตรวจทั้งหมด (พร้อม search, filter, pagination)
 * @access  Admin only
 * @query   ?page=1&limit=10&search=สมชาย&test_type=OCT&start_date=2024-12-01&end_date=2024-12-06
 */
router.get('/', specialTestController.getAllTestReports);

/**
 * @route   GET /api/special-tests/patients/list
 * @desc    ดูรายชื่อผู้ป่วยทั้งหมด (สำหรับ dropdown)
 * @access  Admin only
 */
router.get('/patients/list', specialTestController.getPatientsList);

/**
 * @route   GET /api/special-tests/doctors/list
 * @desc    ดูรายชื่อแพทย์ทั้งหมด (สำหรับ dropdown)
 * @access  Admin only
 */
router.get('/doctors/list', specialTestController.getDoctorsList);

/**
 * @route   GET /api/special-tests/:test_id
 * @desc    ดูรายละเอียดผลการตรวจ
 * @access  Admin only
 */
router.get('/:test_id', specialTestController.getTestReportById);

/**
 * @route   GET /api/special-tests/:test_id/download
 * @desc    ดาวน์โหลดไฟล์ PDF ผลการตรวจ
 * @access  Admin only
 */
router.get('/:test_id/download', specialTestController.downloadTestReport);

/**
 * @route   PUT /api/special-tests/:test_id
 * @desc    แก้ไขข้อมูลผลการตรวจ (ไม่รวมไฟล์ PDF)
 * @access  Admin only
 */
router.put('/:test_id', specialTestController.updateTestReport);

/**
 * @route   DELETE /api/special-tests/:test_id
 * @desc    ลบผลการตรวจและไฟล์ PDF
 * @access  Admin only
 */
router.delete('/:test_id', specialTestController.deleteTestReport);

module.exports = router;