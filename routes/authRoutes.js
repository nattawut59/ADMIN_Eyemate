const express = require('express');
const { body } = require('express-validator');
const { adminLogin, verifyToken } = require('../controllers/authController');
const verifyAdmin = require('../middleware/verifyAdmin');

const router = express.Router();

/**
 * @route   POST /api/auth/admin/login
 * @desc    Admin login
 * @access  Public
 */
router.post(
  '/admin/login',
  [
    // Validation middleware
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required')
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3-30 characters'),
    body('password')
      .trim()
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters')
  ],
  adminLogin
);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify JWT token
 * @access  Private (Admin only)
 */
router.get('/verify', verifyAdmin, verifyToken);

module.exports = router;