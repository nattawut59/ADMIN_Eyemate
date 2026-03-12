const pool = require('../config/database');
const { generateFaqId } = require('../utils/idGenerator');

/**
 * ============================================
 * ADMIN: ดูรายการ FAQs ทั้งหมด
 * ============================================
 */
const getAllFAQs = async (req, res) => {
  try {
    const { category, is_active, search } = req.query;

    let whereConditions = [];
    let queryParams = [];

    if (category) {
      whereConditions.push('category = ?');
      queryParams.push(category);
    }

    if (is_active !== undefined) {
      whereConditions.push('is_active = ?');
      queryParams.push(is_active === 'true' ? 1 : 0);
    }

    if (search) {
      whereConditions.push('(question LIKE ? OR answer LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const faqQuery = `
      SELECT 
        f.*,
        u.username as created_by_username
      FROM FAQs f
      LEFT JOIN users u ON f.created_by = u.user_id
      ${whereClause}
      ORDER BY f.order_position ASC, f.created_at DESC
    `;

    const [faqs] = await pool.query(faqQuery, queryParams);

    // นับจำนวนตาม category
    const categoryCountQuery = `
      SELECT category, COUNT(*) as count
      FROM FAQs
      WHERE is_active = 1
      GROUP BY category
    `;

    const [categoryCounts] = await pool.query(categoryCountQuery);

    res.json({
      success: true,
      data: {
        faqs,
        category_counts: categoryCounts
      }
    });

  } catch (error) {
    console.error('Error getting FAQs:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล FAQs',
      error: error.message
    });
  }
};

/**
 * ============================================
 * ADMIN: สร้าง FAQ ใหม่
 * ============================================
 */
const createFAQ = async (req, res) => {
  try {
    const { category, question, answer, order_position = 0 } = req.body;
    const adminId = req.user.userId;

    // Validation
    if (!category || !question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ category, คำถาม และคำตอบ'
      });
    }

    const faqId = generateFaqId();

    await pool.query(
      `INSERT INTO FAQs 
       (faq_id, category, question, answer, order_position, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [faqId, category, question.trim(), answer.trim(), order_position, adminId]
    );

    res.status(201).json({
      success: true,
      message: 'สร้าง FAQ สำเร็จ',
      data: {
        faq_id: faqId
      }
    });

  } catch (error) {
    console.error('Error creating FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการสร้าง FAQ',
      error: error.message
    });
  }
};

/**
 * ============================================
 * ADMIN: แก้ไข FAQ
 * ============================================
 */
const updateFAQ = async (req, res) => {
  try {
    const { faqId } = req.params;
    const { category, question, answer, order_position, is_active } = req.body;

    // ตรวจสอบว่า FAQ มีอยู่จริง
    const [faqs] = await pool.query(
      'SELECT * FROM FAQs WHERE faq_id = ?',
      [faqId]
    );

    if (faqs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ FAQ นี้'
      });
    }

    // สร้าง dynamic update query
    let updateFields = [];
    let updateParams = [];

    if (category !== undefined) {
      updateFields.push('category = ?');
      updateParams.push(category);
    }

    if (question !== undefined) {
      updateFields.push('question = ?');
      updateParams.push(question.trim());
    }

    if (answer !== undefined) {
      updateFields.push('answer = ?');
      updateParams.push(answer.trim());
    }

    if (order_position !== undefined) {
      updateFields.push('order_position = ?');
      updateParams.push(order_position);
    }

    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateParams.push(is_active ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'ไม่มีข้อมูลที่จะอัปเดต'
      });
    }

    updateParams.push(faqId);

    await pool.query(
      `UPDATE FAQs SET ${updateFields.join(', ')}, updated_at = NOW() WHERE faq_id = ?`,
      updateParams
    );

    res.json({
      success: true,
      message: 'อัปเดต FAQ สำเร็จ',
      data: {
        faq_id: faqId
      }
    });

  } catch (error) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปเดต FAQ',
      error: error.message
    });
  }
};

/**
 * ============================================
 * ADMIN: ลบ FAQ
 * ============================================
 */
const deleteFAQ = async (req, res) => {
  try {
    const { faqId } = req.params;

    // ตรวจสอบว่า FAQ มีอยู่จริง
    const [faqs] = await pool.query(
      'SELECT * FROM FAQs WHERE faq_id = ?',
      [faqId]
    );

    if (faqs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ FAQ นี้'
      });
    }

    await pool.query('DELETE FROM FAQs WHERE faq_id = ?', [faqId]);

    res.json({
      success: true,
      message: 'ลบ FAQ สำเร็จ'
    });

  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการลบ FAQ',
      error: error.message
    });
  }
};

/**
 * ============================================
 * ADMIN: จัดเรียง FAQs
 * ============================================
 */
const reorderFAQs = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { faq_orders } = req.body;

    // Validation
    if (!Array.isArray(faq_orders) || faq_orders.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุลำดับของ FAQs'
      });
    }

    // อัปเดตลำดับทีละรายการ
    for (const item of faq_orders) {
      await connection.query(
        'UPDATE FAQs SET order_position = ? WHERE faq_id = ?',
        [item.order_position, item.faq_id]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'จัดเรียง FAQs สำเร็จ'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error reordering FAQs:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการจัดเรียง FAQs',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  getAllFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  reorderFAQs
};