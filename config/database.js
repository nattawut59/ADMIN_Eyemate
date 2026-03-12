const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ตรวจสอบว่ามี environment variables ครบหรือไม่
//const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
//const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

//if (missingEnvVars.length > 0) {
  //console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  //console.error('Please check your .env file');
  //process.exit(1);
//}

// อ่าน CA certificate (ถ้ามี)
let sslConfig = {
  minVersion: 'TLSv1.2',
  rejectUnauthorized: true
};

const caPath = path.join(__dirname, 'ca.pem');
if (fs.existsSync(caPath)) {
  sslConfig.ca = fs.readFileSync(caPath);
  console.log('🔐 Using CA certificate for secure connection');
}

// สร้าง connection pool สำหรับ TiDB Cloud
const pool = mysql.createPool({
  host: process.env.DB_HOST||'gateway01.ap-northeast-1.prod.aws.tidbcloud.com',
  user: process.env.DB_USER||'43sZQPoB6vQC2k5.root',
  password: process.env.DB_PASSWORD||'3FiK8RuPIkz4vPCA',
  database: process.env.DB_NAME||'EyeMate',
  port: parseInt(process.env.DB_PORT) || 4000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 10000,
  ssl: sslConfig
});

// ทดสอบการเชื่อมต่อ
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    console.log(`📊 Database: ${process.env.DB_NAME}`);
    console.log(`🌐 Host: ${process.env.DB_HOST}`);
    console.log(`🔐 SSL: Enabled`);
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Check your database credentials in .env file');
    console.error('   2. Verify your IP is allowed in TiDB Cloud console');
    console.error('   3. Ensure SSL/TLS is properly configured');
    process.exit(1);
  });

module.exports = pool;