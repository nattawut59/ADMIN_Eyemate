const express = require('express');
const router = express.Router();
const statisticsController = require('../controllers/statisticsController');
const { verifyToken, checkAdmin } = require('../middleware/authMiddleware');

// ใช้ middleware ตรวจสอบ token และ admin ทุก route
router.use(verifyToken, checkAdmin);

// สถิติภาพรวมทั้งหมด
router.get('/overview', statisticsController.getOverviewStatistics);

// สถิติผู้ใช้งาน
router.get('/users', statisticsController.getUserStatistics);

// สถิตินัดหมาย
router.get('/appointments', statisticsController.getAppointmentStatistics);

// สถิติการใช้ยา
router.get('/medications', statisticsController.getMedicationStatistics);

module.exports = router;