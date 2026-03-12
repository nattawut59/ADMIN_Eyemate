const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { verifyToken } = require('../middleware/authMiddleware');
const  verifyAdmin  = require('../middleware/verifyAdmin');

// ทุก route ต้อง login และเป็น admin เท่านั้น
router.use(verifyToken);
router.use(verifyAdmin);

/**
 * GET /api/tickets
 * ดูรายการ tickets ทั้งหมด (พร้อม filter และ pagination)
 */
router.get('/', ticketController.getAllTickets);

/**
 * GET /api/tickets/statistics
 * ดูสถิติ tickets
 */
router.get('/statistics', ticketController.getTicketStatistics);

/**
 * GET /api/tickets/:ticketId
 * ดูรายละเอียด ticket เฉพาะรายการ
 */
router.get('/:ticketId', ticketController.getTicketById);

/**
 * POST /api/tickets/:ticketId/assign
 * รับเคส (assign ให้ตัวเอง)
 */
router.post('/:ticketId/assign', ticketController.assignTicketToSelf);

/**
 * POST /api/tickets/:ticketId/reply
 * ตอบกลับ ticket
 */
router.post('/:ticketId/reply', ticketController.replyToTicket);

/**
 * PATCH /api/tickets/:ticketId/status
 * เปลี่ยนสถานะ ticket
 */
router.patch('/:ticketId/status', ticketController.updateTicketStatus);

/**
 * PATCH /api/tickets/:ticketId/priority
 * เปลี่ยนระดับความสำคัญ
 */
router.patch('/:ticketId/priority', ticketController.updateTicketPriority);

/**
 * PATCH /api/tickets/:ticketId/reassign
 * โอนเคสให้แอดมินคนอื่น
 */
router.patch('/:ticketId/reassign', ticketController.reassignTicket);

module.exports = router;