const express = require('express');
const router = express.Router();
const medicineController = require('../controllers/medicineController');
const { verifyToken, checkAdmin } = require('../middleware/authMiddleware');

// ทุก routes ต้อง login และเป็น admin เท่านั้น
router.use(verifyToken);
router.use(checkAdmin);

/**
 * @route   GET /api/medicines
 * @desc    ดึงรายการยาทั้งหมด พร้อม search, filter, pagination
 * @access  Admin only
 * @query   search, category, status, page, limit
 */
router.get('/', medicineController.getAllMedicines);

/**
 * @route   GET /api/medicines/:id
 * @desc    ดึงข้อมูลยาตาม ID
 * @access  Admin only
 */
router.get('/:id', medicineController.getMedicineById);

/**
 * @route   POST /api/medicines
 * @desc    เพิ่มยาใหม่
 * @access  Admin only
 */
router.post('/', medicineController.createMedicine);

/**
 * @route   PUT /api/medicines/:id
 * @desc    แก้ไขข้อมูลยา
 * @access  Admin only
 */
router.put('/:id', medicineController.updateMedicine);

/**
 * @route   DELETE /api/medicines/:id
 * @desc    ลบยา (soft delete - เปลี่ยนสถานะเป็น discontinued)
 * @access  Admin only
 */
router.delete('/:id', medicineController.deleteMedicine);

/**
 * @route   DELETE /api/medicines/:id/permanent
 * @desc    ลบยาถาวร (hard delete)
 * @access  Admin only
 * @warning ใช้เฉพาะกรณีจำเป็น
 */
router.delete('/:id/permanent', medicineController.permanentDeleteMedicine);

module.exports = router;