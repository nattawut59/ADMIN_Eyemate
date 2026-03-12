const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyToken } = require('../middleware/authMiddleware');
const verifyAdmin = require('../middleware/verifyAdmin');

/**
 * =============================================
 * Settings Routes
 * =============================================
 */

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(verifyAdmin);

// ============================================
// PROFILE SETTINGS
// ============================================
router.put('/profile', settingsController.updateProfile);
router.put('/change-password', settingsController.changePassword);

// ============================================
// NOTIFICATION SETTINGS
// ============================================
router.get('/notification-settings', settingsController.getNotificationSettings);
router.put('/notification-settings', settingsController.updateNotificationSettings);

// ============================================
// DISPLAY SETTINGS
// ============================================
router.get('/display-settings', settingsController.getDisplaySettings);
router.put('/display-settings', settingsController.updateDisplaySettings);

// ============================================
// SECURITY SETTINGS
// ============================================
router.get('/login-history', settingsController.getLoginHistory);
router.get('/sessions', settingsController.getActiveSessions);
router.delete('/sessions/:sessionId', settingsController.deleteSession);

module.exports = router;

// ============================================
// PROFILE SETTINGS
// ============================================
router.put('/profile', settingsController.updateProfile);
router.put('/change-password', settingsController.changePassword);

// ============================================
// NOTIFICATION SETTINGS
// ============================================
router.get('/notification-settings', settingsController.getNotificationSettings);
router.put('/notification-settings', settingsController.updateNotificationSettings);

// ============================================
// DISPLAY SETTINGS
// ============================================
router.get('/display-settings', settingsController.getDisplaySettings);
router.put('/display-settings', settingsController.updateDisplaySettings);

// ============================================
// SECURITY SETTINGS
// ============================================
router.get('/login-history', settingsController.getLoginHistory);
router.get('/sessions', settingsController.getActiveSessions);
router.delete('/sessions/:sessionId', settingsController.deleteSession);

module.exports = router;