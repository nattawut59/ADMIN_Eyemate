const express = require('express');
const router = express.Router();
const medicationReportController = require('../controllers/medicationReportController');
const { verifyToken, checkAdmin } = require('../middleware/authMiddleware');

// ใช้ middleware ตรวจสอบ admin ทุก route
router.use(verifyToken, checkAdmin);

// ⚠️ สำคัญ: ต้องประกาศ route ที่เฉพาะเจาะจงก่อน (ไม่มี :parameter)

// Alert ผู้ป่วยที่ต้องติดตาม
router.get('/alerts', medicationReportController.getMedicationAlerts);

// Overview Dashboard ⬅️ เพิ่มตรงนี้
router.get('/overview', medicationReportController.getMedicationOverview);

// รายการผู้ป่วยทั้งหมดพร้อม Adherence Rate
router.get('/patients/adherence', medicationReportController.getAllPatientsAdherence);

// รายงานรายเดือนของผู้ป่วยแต่ละคน
router.get('/patient/:patientId/monthly', medicationReportController.getPatientMonthlyReport);

module.exports = router;