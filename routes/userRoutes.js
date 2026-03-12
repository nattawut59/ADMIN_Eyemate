// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const userController = require('../controllers/userController');
const verifyAdmin = require('../middleware/verifyAdmin');
const auditLogger = require('../middleware/auditLogger'); // ถ้ามี

// ========== Apply Middleware ==========
// ตรวจสอบว่าเป็น admin ทุก route
router.use(verifyAdmin);

// ========== Validation Rules ==========
const createUserValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
  body('password')
    .trim()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role')
    .isIn(['patient', 'doctor', 'admin']).withMessage('Invalid role'),
  body('idCard')
    .trim()
    .isLength({ min: 13, max: 13 }).withMessage('ID card must be 13 digits'),
  body('phone')
    .optional()
    .isMobilePhone('th-TH').withMessage('Invalid phone number')
];

const updateUserValidation = [
  param('userId').trim().notEmpty(),
  body('username').optional().trim().isLength({ min: 3, max: 30 }),
  body('phone').optional().isMobilePhone('th-TH'),
  body('role').optional().isIn(['patient', 'doctor', 'admin'])
];

const userIdValidation = [
  param('userId')
    .trim()
    .notEmpty().withMessage('User ID is required')
    .matches(/^(PAT|DOC|ADM)\d+$/).withMessage('Invalid user ID format')
];

const statusValidation = [
  param('userId').trim().notEmpty(),
  body('status')
    .isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
];

// ========== Routes ==========


router.post(
  '/',
  createUserValidation,
  auditLogger('CREATE_USER', 'users'),
  userController.createUser
);

router.get(
  '/statistics',
  userController.getUserStatistics
);

router.get(
    '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isIn(['patient', 'doctor', 'admin']),
    query('status').optional().isIn(['active', 'inactive', 'suspended'])
  ],
  userController.getAllUsers
);

router.get(
  '/:userId',
  userIdValidation,
  userController.getUserById
);

router.put(
  '/:userId',
  updateUserValidation,
  auditLogger('UPDATE_USER', 'users'),
  userController.updateUser
);

router.patch(
  '/:userId/status',
  statusValidation,
  auditLogger('UPDATE_USER_STATUS', 'users'),
  userController.updateUserStatus
);

router.post(
  '/:userId/reset-password',
  userIdValidation,
  [
    body('newPassword')
      .optional()
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('sendEmail')
      .optional()
      .isBoolean()
  ],
  auditLogger('RESET_PASSWORD', 'users'),
  userController.resetUserPassword
);

router.delete(
  '/:userId',
  userIdValidation,
  [
    body('reason').optional().trim().isLength({ max: 500 })
  ],
  auditLogger('DELETE_USER', 'users'),
  userController.deleteUser
);

module.exports = router;