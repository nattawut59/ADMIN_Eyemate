const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const verifyAdmin = require('../middleware/verifyAdmin');

// ใช้ middleware ตรวจสอบ admin (รวม authentication + authorization)
router.use(verifyAdmin);

// ==================== Statistics Routes (ต้องมาก่อน dynamic routes) ====================

// สถิติโดยรวมของนัดหมาย
// GET /api/appointments/statistics/overview
router.get('/statistics/overview', appointmentController.getAppointmentStatistics);

// สถิติคำขอเลื่อนนัด
// GET /api/appointments/change-requests/statistics/overview
router.get('/change-requests/statistics/overview', appointmentController.getChangeRequestStatistics);

// ==================== Change Requests Management ====================

// ดูรายการคำขอเลื่อนนัดทั้งหมด (มี pagination และ filter)
// GET /api/appointments/change-requests?page=1&limit=10&status=pending&request_type=reschedule&patient_id=xxx
router.get('/change-requests', appointmentController.getAllChangeRequests);

// อนุมัติคำขอเลื่อนนัด
// POST /api/appointments/change-requests/:id/approve
router.post('/change-requests/:id/approve', appointmentController.approveChangeRequest);

// ปฏิเสธคำขอเลื่อนนัด
// POST /api/appointments/change-requests/:id/reject
router.post('/change-requests/:id/reject', appointmentController.rejectChangeRequest);

// ดูรายละเอียดคำขอเลื่อนนัดตาม ID
// GET /api/appointments/change-requests/:id
router.get('/change-requests/:id', appointmentController.getChangeRequestById);

// ==================== Appointments Management ====================

// สร้างนัดหมายใหม่
// POST /api/appointments
router.post('/', appointmentController.createAppointment);

// ดูรายการนัดหมายทั้งหมด (มี pagination และ filter)
// GET /api/appointments?page=1&limit=10&status=scheduled&doctor_id=xxx&patient_id=xxx&date_from=2024-01-01&date_to=2024-12-31&search=keyword
router.get('/', appointmentController.getAllAppointments);

// อัปเดตนัดหมาย
// PUT /api/appointments/:id
router.put('/:id', appointmentController.updateAppointment);

// ยกเลิกนัดหมาย
// DELETE /api/appointments/:id
router.delete('/:id', appointmentController.cancelAppointment);

// ดูรายละเอียดนัดหมายตาม ID (ต้องอยู่ท้ายสุดเพราะเป็น dynamic route)
// GET /api/appointments/:id
router.get('/:id', appointmentController.getAppointmentById);

module.exports = router;