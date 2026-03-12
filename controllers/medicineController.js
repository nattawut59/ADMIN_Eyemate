const db = require('../config/database.js');

const getAllMedicines = async (req, res) => {
  try {
    const { search, category, status, page = 1, limit = 20 } = req.query;
    
    // คำนวณ offset สำหรับ pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // สร้าง WHERE clause แบบ dynamic
    let whereConditions = [];
    let queryParams = [];
    
    // ค้นหาจากชื่อยาหรือชื่อสามัญ
    if (search) {
      whereConditions.push('(name LIKE ? OR generic_name LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }
    
    // กรองตามหมวดหมู่
    if (category) {
      whereConditions.push('category = ?');
      queryParams.push(category);
    }
    
    // กรองตาม status
    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // นับจำนวนยาทั้งหมดที่ตรงเงื่อนไข
    const countQuery = `
      SELECT COUNT(*) as total
      FROM Medications
      ${whereClause}
    `;
    
    const [countResult] = await db.query(countQuery, queryParams);
    const totalMedicines = countResult[0].total;
    const totalPages = Math.ceil(totalMedicines / parseInt(limit));
    
    // ดึงข้อมูลยาตาม pagination
    const dataQuery = `
      SELECT 
        medication_id,
        name,
        generic_name,
        category,
        form,
        strength,
        manufacturer,
        description,
        dosage_instructions,
        side_effects,
        contraindications,
        interactions,
        image_url,
        status,
        created_at,
        updated_at
      FROM Medications
      ${whereClause}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `;
    
    const [medicines] = await db.query(dataQuery, [
      ...queryParams,
      parseInt(limit),
      offset
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        medicines,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalMedicines,
          itemsPerPage: parseInt(limit)
        }
      },
      message: 'ดึงข้อมูลยาสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in getAllMedicines:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลยา',
      error: error.message
    });
  }
};

/**
 * ดึงข้อมูลยาตาม ID
 * GET /api/medicines/:id
 */
const getMedicineById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        medication_id,
        name,
        generic_name,
        category,
        form,
        strength,
        manufacturer,
        description,
        dosage_instructions,
        side_effects,
        contraindications,
        interactions,
        image_url,
        status,
        created_at,
        updated_at
      FROM Medications
      WHERE medication_id = ?
    `;
    
    const [medicines] = await db.query(query, [id]);
    
    if (medicines.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลยาที่ระบุ'
      });
    }
    
    res.status(200).json({
      success: true,
      data: medicines[0],
      message: 'ดึงข้อมูลยาสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in getMedicineById:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลยา',
      error: error.message
    });
  }
};

/**
 * เพิ่มยาใหม่
 * POST /api/medicines
 * Body: {
 *   medication_id: string (required, unique),
 *   name: string (required),
 *   generic_name: string,
 *   category: string,
 *   form: string,
 *   strength: string,
 *   manufacturer: string,
 *   description: text,
 *   dosage_instructions: text,
 *   side_effects: text,
 *   contraindications: text,
 *   interactions: text,
 *   image_url: string,
 *   status: enum('active','discontinued','unavailable')
 * }
 */
const createMedicine = async (req, res) => {
  try {
    const {
      medication_id,
      name,
      generic_name,
      category,
      form,
      strength,
      manufacturer,
      description,
      dosage_instructions,
      side_effects,
      contraindications,
      interactions,
      image_url,
      status = 'active'
    } = req.body;
    
    // Validation: ตรวจสอบ required fields
    if (!medication_id || !name) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ medication_id และ name'
      });
    }
    
    // ตรวจสอบความยาวของ medication_id (ต้องไม่เกิน 20 ตัวอักษร)
    if (medication_id.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'medication_id ต้องไม่เกิน 20 ตัวอักษร'
      });
    }
    
    // ตรวจสอบความยาวของ name (ต้องไม่เกิน 50 ตัวอักษร)
    if (name.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'ชื่อยาต้องไม่เกิน 50 ตัวอักษร'
      });
    }
    
    // ตรวจสอบ status ว่าเป็นค่าที่อนุญาตหรือไม่
    const validStatuses = ['active', 'discontinued', 'unavailable'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status ต้องเป็น active, discontinued หรือ unavailable เท่านั้น'
      });
    }
    
    // ตรวจสอบว่า medication_id ซ้ำหรือไม่
    const checkQuery = 'SELECT medication_id FROM Medications WHERE medication_id = ?';
    const [existing] = await db.query(checkQuery, [medication_id]);
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'medication_id นี้มีอยู่ในระบบแล้ว'
      });
    }
    
    // Insert ยาใหม่
    const insertQuery = `
      INSERT INTO Medications (
        medication_id,
        name,
        generic_name,
        category,
        form,
        strength,
        manufacturer,
        description,
        dosage_instructions,
        side_effects,
        contraindications,
        interactions,
        image_url,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await db.query(insertQuery, [
      medication_id,
      name,
      generic_name || null,
      category || null,
      form || null,
      strength || null,
      manufacturer || null,
      description || null,
      dosage_instructions || null,
      side_effects || null,
      contraindications || null,
      interactions || null,
      image_url || null,
      status
    ]);
    
    // ดึงข้อมูลยาที่เพิ่งสร้าง
    const [newMedicine] = await db.query(
      'SELECT * FROM Medications WHERE medication_id = ?',
      [medication_id]
    );
    
    res.status(201).json({
      success: true,
      data: newMedicine[0],
      message: 'เพิ่มยาสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in createMedicine:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการเพิ่มยา',
      error: error.message
    });
  }
};

/**
 * แก้ไขข้อมูลยา
 * PUT /api/medicines/:id
 * Body: ข้อมูลที่ต้องการแก้ไข (ส่งเฉพาะ fields ที่ต้องการเปลี่ยน)
 */
const updateMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // ตรวจสอบว่ายามีอยู่ในระบบหรือไม่
    const checkQuery = 'SELECT medication_id FROM Medications WHERE medication_id = ?';
    const [existing] = await db.query(checkQuery, [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบยาที่ต้องการแก้ไข'
      });
    }
    
    // ห้ามแก้ไข medication_id
    if (updateData.medication_id && updateData.medication_id !== id) {
      return res.status(400).json({
        success: false,
        message: 'ไม่สามารถแก้ไข medication_id ได้'
      });
    }
    
    // ตรวจสอบ status ถ้ามีการส่งมา
    if (updateData.status) {
      const validStatuses = ['active', 'discontinued', 'unavailable'];
      if (!validStatuses.includes(updateData.status)) {
        return res.status(400).json({
          success: false,
          message: 'status ต้องเป็น active, discontinued หรือ unavailable เท่านั้น'
        });
      }
    }
    
    // สร้าง dynamic UPDATE query
    const allowedFields = [
      'name',
      'generic_name',
      'category',
      'form',
      'strength',
      'manufacturer',
      'description',
      'dosage_instructions',
      'side_effects',
      'contraindications',
      'interactions',
      'image_url',
      'status'
    ];
    
    const updateFields = [];
    const updateValues = [];
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(updateData[field]);
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'ไม่มีข้อมูลที่ต้องการแก้ไข'
      });
    }
    
    // เพิ่ม medication_id สำหรับ WHERE clause
    updateValues.push(id);
    
    const updateQuery = `
      UPDATE Medications
      SET ${updateFields.join(', ')}
      WHERE medication_id = ?
    `;
    
    await db.query(updateQuery, updateValues);
    
    // ดึงข้อมูลยาที่แก้ไขแล้ว
    const [updatedMedicine] = await db.query(
      'SELECT * FROM Medications WHERE medication_id = ?',
      [id]
    );
    
    res.status(200).json({
      success: true,
      data: updatedMedicine[0],
      message: 'แก้ไขข้อมูลยาสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in updateMedicine:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลยา',
      error: error.message
    });
  }
};

/**
 * ลบยา (Soft delete - เปลี่ยน status เป็น discontinued)
 * DELETE /api/medicines/:id
 */
const deleteMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    
    // ตรวจสอบว่ายามีอยู่ในระบบหรือไม่
    const checkQuery = 'SELECT medication_id, status FROM Medications WHERE medication_id = ?';
    const [existing] = await db.query(checkQuery, [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบยาที่ต้องการลบ'
      });
    }
    
    // ตรวจสอบว่ายาถูกใช้งานอยู่หรือไม่
    const usageCheckQuery = `
      SELECT COUNT(*) as count
      FROM PatientMedications
      WHERE medication_id = ? AND status = 'active'
    `;
    const [usageResult] = await db.query(usageCheckQuery, [id]);
    
    if (usageResult[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'ไม่สามารถลบยาได้เนื่องจากมีผู้ป่วยกำลังใช้งานอยู่ (แนะนำให้เปลี่ยนสถานะเป็น discontinued แทน)'
      });
    }
    
    // Soft delete: เปลี่ยน status เป็น discontinued
    const updateQuery = `
      UPDATE Medications
      SET status = 'discontinued'
      WHERE medication_id = ?
    `;
    
    await db.query(updateQuery, [id]);
    
    res.status(200).json({
      success: true,
      message: 'ลบยาสำเร็จ (เปลี่ยนสถานะเป็น discontinued)',
      data: { medication_id: id }
    });
    
  } catch (error) {
    console.error('Error in deleteMedicine:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการลบยา',
      error: error.message
    });
  }
};

/**
 * ลบยาถาวร (Hard delete - ลบจริงออกจากฐานข้อมูล)
 * DELETE /api/medicines/:id/permanent
 * ⚠️ ใช้เฉพาะกรณีจำเป็น และควรมี confirmation
 */
const permanentDeleteMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    
    // ตรวจสอบว่ายามีอยู่ในระบบหรือไม่
    const checkQuery = 'SELECT medication_id FROM Medications WHERE medication_id = ?';
    const [existing] = await db.query(checkQuery, [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบยาที่ต้องการลบ'
      });
    }
    
    // ตรวจสอบว่ายามีการใช้งานในระบบหรือไม่ (ทุก status)
    const usageCheckQuery = `
      SELECT COUNT(*) as count
      FROM PatientMedications
      WHERE medication_id = ?
    `;
    const [usageResult] = await db.query(usageCheckQuery, [id]);
    
    if (usageResult[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'ไม่สามารถลบยาได้เนื่องจากมีประวัติการใช้งานในระบบ'
      });
    }
    
    // Hard delete: ลบจริงออกจากฐานข้อมูล
    const deleteQuery = 'DELETE FROM Medications WHERE medication_id = ?';
    await db.query(deleteQuery, [id]);
    
    res.status(200).json({
      success: true,
      message: 'ลบยาถาวรสำเร็จ',
      data: { medication_id: id }
    });
    
  } catch (error) {
    console.error('Error in permanentDeleteMedicine:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการลบยา',
      error: error.message
    });
  }
};

module.exports = {
  getAllMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  permanentDeleteMedicine
};