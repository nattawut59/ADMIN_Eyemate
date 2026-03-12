const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const userRoutes = require('./routes/userRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');
const medicationReportRoutes = require('./routes/medicationReportRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const faqRoutes = require('./routes/faqRoutes');
const specialTestRoutes = require('./routes/specialTestRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const settingsRoutes = require('./routes/settingsRoutes');


// ========== Initialize Express App ==========
const app = express();

// ========== Middleware ==========
// Enable CORS
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-vercel-url.vercel.app', // ← เพิ่ม Vercel URL ทีหลังได้ครับ
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ========== Routes ==========
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin/statistics', statisticsRoutes);
app.use('/api/admin/medication-reports', medicationReportRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/special-tests', specialTestRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', settingsRoutes);


// ========== Error Handling ==========
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: `Cannot ${req.method} ${req.path}`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดในระบบ',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// ========== Start Server ==========
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`
  ✅ Server is running on port ${PORT}
  🌍 Environment: ${process.env.NODE_ENV || 'development'}
  📡 API URL: http://localhost:${PORT}
  `);
});

module.exports = app;
