const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ฟังก์ชันสร้างโฟลเดอร์ถ้ายังไม่มี
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// กำหนดที่เก็บไฟล์ตามประเภทการตรวจ
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const testType = req.body.test_type;
    let uploadPath;

    // เลือกโฟลเดอร์ตามประเภทการตรวจ
    switch (testType) {
      case 'OCT':
        uploadPath = path.join(__dirname, '../uploads/oct-reports');
        break;
      case 'CTVF':
        uploadPath = path.join(__dirname, '../uploads/visual-field-reports');
        break;
      case 'Pachymetry':
      case 'Gonioscopy':
      case 'Other':
      default:
        uploadPath = path.join(__dirname, '../uploads/special-test-reports');
        break;
    }

    // สร้างโฟลเดอร์ถ้ายังไม่มี
    ensureDirectoryExists(uploadPath);
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // สร้างชื่อไฟล์: TEST_P001_1733567890.pdf
    const patientId = req.body.patient_id;
    const timestamp = Date.now();
    const prefix = req.body.test_type === 'CTVF' ? 'VFT' : 'TEST';
    const filename = `${prefix}_${patientId}_${timestamp}.pdf`;
    
    cb(null, filename);
  }
});

// ตรวจสอบไฟล์
const fileFilter = (req, file, cb) => {
  // ตรวจสอบว่าเป็น PDF เท่านั้น
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('อนุญาตให้อัปโหลดเฉพาะไฟล์ PDF เท่านั้น'), false);
  }
};

// กำหนดขนาดไฟล์สูงสุด 10MB
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

module.exports = upload;