const bcrypt = require('bcrypt');
const pool = require('./config/database');

/**
 * Script สำหรับสร้าง Admin User คนแรก
 */
async function createFirstAdmin() {
  let connection;
  
  try {
    console.log('🚀 Creating first admin user...\n');

    // ข้อมูล admin ที่จะสร้าง
    const adminData = {
      userId: 'ADM001',
      idCard: '1234567890123',
      username: 'admin001',
      password: 'Admin@123456', // เปลี่ยนได้ตามต้องการ
      phone: '0812345678',
      role: 'admin',
      status: 'active'
    };

    console.log('📝 Admin information:');
    console.log(`   User ID: ${adminData.userId}`);
    console.log(`   Username: ${adminData.username}`);
    console.log(`   Password: ${adminData.password}`);
    console.log(`   Phone: ${adminData.phone}`);
    console.log(`   Role: ${adminData.role}\n`);

    // Hash password
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(adminData.password, 12);
    console.log('✅ Password hashed successfully\n');

    // เชื่อมต่อ database
    connection = await pool.getConnection();

    // ตรวจสอบว่ามี admin อยู่แล้วหรือไม่
    console.log('🔍 Checking if admin already exists...');
    const [existing] = await connection.execute(
      'SELECT user_id, username FROM users WHERE username = ? OR user_id = ?',
      [adminData.username, adminData.userId]
    );

    if (existing.length > 0) {
      console.log('⚠️  Admin user already exists!');
      console.log(`   Username: ${existing[0].username}`);
      console.log(`   User ID: ${existing[0].user_id}`);
      console.log('\n💡 If you want to create a new admin, please:');
      console.log('   1. Change username in this script');
      console.log('   2. Change user_id in this script');
      console.log('   3. Run this script again\n');
      return;
    }

    // สร้าง admin user
    console.log('➕ Creating admin user in database...');
    await connection.execute(
      `INSERT INTO users 
        (user_id, id_card, role, username, password_hash, phone, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        adminData.userId,
        adminData.idCard,
        adminData.role,
        adminData.username,
        passwordHash,
        adminData.phone,
        adminData.status
      ]
    );

    console.log('✅ Admin user created successfully!\n');
    console.log('🎉 You can now login with:');
    console.log(`   Username: ${adminData.username}`);
    console.log(`   Password: ${adminData.password}\n`);
    console.log('📡 Test login at: POST http://localhost:3001/api/auth/admin/login\n');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    
    if (error.code === 'ER_DUP_ENTRY') {
      console.error('\n⚠️  Duplicate entry detected.');
      console.error('   Username or User ID already exists.');
      console.error('   Please change them in the script.\n');
    }
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit();
  }
}

// รัน script
createFirstAdmin();