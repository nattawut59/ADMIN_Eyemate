const express = require('express');
const { getDashboardStats, getRecentActivities, getPendingTasks, getRecentPatients } = require('../controllers/dashboardController');
const verifyAdmin = require('../middleware/verifyAdmin');

const router = express.Router();

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get dashboard statistics
 * @access  Private (Admin only)
 */
router.get('/stats', verifyAdmin, getDashboardStats);

/**
 * @route   GET /api/dashboard/activities
 * @desc    Get recent activities
 * @access  Private (Admin only)
 */
router.get('/activities', verifyAdmin, getRecentActivities);

router.get('/pending-tasks', verifyAdmin, getPendingTasks);
router.get('/recent-patients', verifyAdmin, getRecentPatients);

module.exports = router;