const pool = require('../config/database');
const { 
  generateTicketId, 
  generateMessageId, 
  generateHistoryId 
} = require('../utils/idGenerator');

/**
 * ============================================
 * ADMIN: ดูรายการ Tickets ทั้งหมด
 * ============================================
 */
const getAllTickets = async (req, res) => {
  try {
    const { 
      status, 
      priority, 
      category, 
      assigned_to,
      search,
      page = 1, 
      limit = 20 
    } = req.query;

    const offset = (page - 1) * limit;
    
    // สร้าง WHERE clause แบบ dynamic
    let whereConditions = [];
    let queryParams = [];

    if (status) {
      whereConditions.push('st.status = ?');
      queryParams.push(status);
    }

    if (priority) {
      whereConditions.push('st.priority = ?');
      queryParams.push(priority);
    }

    if (category) {
      whereConditions.push('st.category = ?');
      queryParams.push(category);
    }

    if (assigned_to) {
      if (assigned_to === 'unassigned') {
        whereConditions.push('st.assigned_to IS NULL');
      } else {
        whereConditions.push('st.assigned_to = ?');
        queryParams.push(assigned_to);
      }
    }

    if (search) {
      whereConditions.push('(st.subject LIKE ? OR st.description LIKE ? OR st.ticket_id LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Query ข้อมูล tickets พร้อมข้อมูลผู้ใช้
    const ticketsQuery = `
      SELECT 
        st.*,
        u.username as user_username,
        u.phone as user_phone,
        u.role as user_role,
        CONCAT(
          CASE 
            WHEN pp.first_name IS NOT NULL THEN pp.first_name
            WHEN dp.first_name IS NOT NULL THEN dp.first_name
            ELSE ''
          END,
          ' ',
          CASE 
            WHEN pp.last_name IS NOT NULL THEN pp.last_name
            WHEN dp.last_name IS NOT NULL THEN dp.last_name
            ELSE ''
          END
        ) as user_fullname,
        admin.username as assigned_admin_username,
        TIMESTAMPDIFF(HOUR, st.created_at, NOW()) as hours_open,
        (
          SELECT COUNT(*) 
          FROM TicketMessages tm 
          WHERE tm.ticket_id = st.ticket_id
        ) as message_count,
        (
          SELECT COUNT(*) 
          FROM TicketMessages tm 
          WHERE tm.ticket_id = st.ticket_id 
          AND tm.sender_id != st.user_id
        ) as admin_response_count
      FROM SupportTickets st
      LEFT JOIN users u ON st.user_id = u.user_id
      LEFT JOIN PatientProfiles pp ON u.user_id = pp.patient_id
      LEFT JOIN DoctorProfiles dp ON u.user_id = dp.doctor_id
      LEFT JOIN users admin ON st.assigned_to = admin.user_id
      ${whereClause}
      ORDER BY 
        CASE st.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        st.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);

    const [tickets] = await pool.query(ticketsQuery, queryParams);

    // นับจำนวนทั้งหมด
    const countQuery = `
      SELECT COUNT(*) as total
      FROM SupportTickets st
      ${whereClause}
    `;

    const [countResult] = await pool.query(
      countQuery, 
      queryParams.slice(0, -2) // เอา limit และ offset ออก
    );

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error getting tickets:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล tickets',
      error: error.message
    });
  }
};

/**
 * ============================================
 * ADMIN: ดูรายละเอียด Ticket
 * ============================================
 */
const getTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;

    // ดึงข้อมูล ticket
    const ticketQuery = `
      SELECT 
        st.*,
        u.username as user_username,
        u.phone as user_phone,
        u.role as user_role,
        CONCAT(
          CASE 
            WHEN pp.first_name IS NOT NULL THEN pp.first_name
            WHEN dp.first_name IS NOT NULL THEN dp.first_name
            ELSE ''
          END,
          ' ',
          CASE 
            WHEN pp.last_name IS NOT NULL THEN pp.last_name
            WHEN dp.last_name IS NOT NULL THEN dp.last_name
            ELSE ''
          END
        ) as user_fullname,
        admin.username as assigned_admin_username,
        TIMESTAMPDIFF(HOUR, st.created_at, NOW()) as hours_open
      FROM SupportTickets st
      LEFT JOIN users u ON st.user_id = u.user_id
      LEFT JOIN PatientProfiles pp ON u.user_id = pp.patient_id
      LEFT JOIN DoctorProfiles dp ON u.user_id = dp.doctor_id
      LEFT JOIN users admin ON st.assigned_to = admin.user_id
      WHERE st.ticket_id = ?
    `;

    const [tickets] = await pool.query(ticketQuery, [ticketId]);

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ ticket นี้'
      });
    }

    const ticket = tickets[0];

    // ดึงข้อมูล messages
    const messagesQuery = `
      SELECT 
        tm.*,
        u.username as sender_username,
        u.role as sender_role,
        CONCAT(
          CASE 
            WHEN pp.first_name IS NOT NULL THEN pp.first_name
            WHEN dp.first_name IS NOT NULL THEN dp.first_name
            ELSE ''
          END,
          ' ',
          CASE 
            WHEN pp.last_name IS NOT NULL THEN pp.last_name
            WHEN dp.last_name IS NOT NULL THEN dp.last_name
            ELSE ''
          END
        ) as sender_fullname
      FROM TicketMessages tm
      LEFT JOIN users u ON tm.sender_id = u.user_id
      LEFT JOIN PatientProfiles pp ON u.user_id = pp.patient_id
      LEFT JOIN DoctorProfiles dp ON u.user_id = dp.doctor_id
      WHERE tm.ticket_id = ?
      ORDER BY tm.created_at ASC
    `;

    const [messages] = await pool.query(messagesQuery, [ticketId]);

    // ดึงประวัติการเปลี่ยนสถานะ
    const historyQuery = `
      SELECT 
        tsh.*,
        u.username as changed_by_username
      FROM TicketStatusHistory tsh
      LEFT JOIN users u ON tsh.changed_by = u.user_id
      WHERE tsh.ticket_id = ?
      ORDER BY tsh.created_at DESC
    `;

    const [history] = await pool.query(historyQuery, [ticketId]);

    res.json({
      success: true,
      data: {
        ticket,
        messages,
        history
      }
    });

  } catch (error) {
    console.error('Error getting ticket details:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล ticket',
      error: error.message
    });
  }
};

/**
 * ============================================
 * ADMIN: รับเคส (Assign ticket ให้ตัวเอง)
 * ============================================
 */
const assignTicketToSelf = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { ticketId } = req.params;
    const adminId = req.user.userId; // จาก JWT token

    // ตรวจสอบว่า ticket มีอยู่จริง
    const [tickets] = await connection.query(
      'SELECT * FROM SupportTickets WHERE ticket_id = ?',
      [ticketId]
    );

    if (tickets.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ ticket นี้'
      });
    }

    const ticket = tickets[0];
    const oldStatus = ticket.status;

    // อัปเดต assigned_to และเปลี่ยนสถานะเป็น in_progress
    await connection.query(
      `UPDATE SupportTickets 
       SET assigned_to = ?, 
           status = 'in_progress',
           updated_at = NOW()
       WHERE ticket_id = ?`,
      [adminId, ticketId]
    );

    // บันทึกประวัติการเปลี่ยนสถานะ
    if (oldStatus !== 'in_progress') {
      const historyId = generateHistoryId();
      await connection.query(
        `INSERT INTO TicketStatusHistory 
         (history_id, ticket_id, old_status, new_status, changed_by, comment)
         VALUES (?, ?, ?, 'in_progress', ?, 'รับเคสโดยแอดมิน')`,
        [historyId, ticketId, oldStatus, adminId]
      );
    }

    // สร้างข้อความอัตโนมัติ (Internal Note)
    const messageId = generateMessageId();
    await connection.query(
      `INSERT INTO TicketMessages 
       (message_id, ticket_id, sender_id, message, is_internal_note)
       VALUES (?, ?, ?, 'แอดมินได้รับเคสนี้แล้ว', 1)`,
      [messageId, ticketId, adminId]
    );

    // สร้างการแจ้งเตือนให้ผู้ใช้
    const notificationId = `NTF${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    await connection.query(
      `INSERT INTO Notifications 
       (notification_id, user_id, notification_type, title, body, related_entity_type, related_entity_id, priority, channels)
       VALUES (?, ?, 'support_update', 'แอดมินได้รับเคสของคุณแล้ว', 
               'เคสของคุณกำลังถูกดำเนินการ', 'support_ticket', ?, 'medium', 'app')`,
      [notificationId, ticket.user_id, ticketId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'รับเคสสำเร็จ',
      data: {
        ticket_id: ticketId,
        assigned_to: adminId
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error assigning ticket:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการรับเคส',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * ============================================
 * ADMIN: ตอบกลับ Ticket
 * ============================================
 */
const replyToTicket = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { ticketId } = req.params;
    const { message, is_internal_note = false, attachments } = req.body;
    const adminId = req.user.userId;

    // Validation
    if (!message || message.trim() === '') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุข้อความ'
      });
    }

    // ตรวจสอบว่า ticket มีอยู่จริง
    const [tickets] = await connection.query(
      'SELECT * FROM SupportTickets WHERE ticket_id = ?',
      [ticketId]
    );

    if (tickets.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ ticket นี้'
      });
    }

    const ticket = tickets[0];

    // สร้างข้อความตอบกลับ
    const messageId = generateMessageId();
    const attachmentsJson = attachments ? JSON.stringify(attachments) : null;

    await connection.query(
      `INSERT INTO TicketMessages 
       (message_id, ticket_id, sender_id, message, is_internal_note, attachments)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [messageId, ticketId, adminId, message.trim(), is_internal_note, attachmentsJson]
    );

    // อัปเดต first_response_at ถ้ายังไม่เคยตอบ
    if (!ticket.first_response_at) {
      await connection.query(
        `UPDATE SupportTickets 
         SET first_response_at = NOW(), updated_at = NOW()
         WHERE ticket_id = ?`,
        [ticketId]
      );
    } else {
      await connection.query(
        `UPDATE SupportTickets 
         SET updated_at = NOW()
         WHERE ticket_id = ?`,
        [ticketId]
      );
    }

    // ส่งการแจ้งเตือนให้ผู้ใช้ (ถ้าไม่ใช่ internal note)
    if (!is_internal_note) {
      const notificationId = `NTF${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await connection.query(
        `INSERT INTO Notifications 
         (notification_id, user_id, notification_type, title, body, related_entity_type, related_entity_id, priority, channels)
         VALUES (?, ?, 'support_reply', 'แอดมินได้ตอบกลับเคสของคุณ', 
                 ?, 'support_ticket', ?, 'high', 'app')`,
        [notificationId, ticket.user_id, message.substring(0, 100), ticketId]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'ส่งข้อความสำเร็จ',
      data: {
        message_id: messageId,
        ticket_id: ticketId
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error replying to ticket:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการส่งข้อความ',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * ============================================
 * ADMIN: เปลี่ยนสถานะ Ticket
 * ============================================
 */
const updateTicketStatus = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { ticketId } = req.params;
    const { status, comment, resolution_notes } = req.body;
    const adminId = req.user.userId;

    // Validation
    const validStatuses = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'สถานะไม่ถูกต้อง'
      });
    }

    // ตรวจสอบว่า ticket มีอยู่จริง
    const [tickets] = await connection.query(
      'SELECT * FROM SupportTickets WHERE ticket_id = ?',
      [ticketId]
    );

    if (tickets.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ ticket นี้'
      });
    }

    const ticket = tickets[0];
    const oldStatus = ticket.status;

    // ถ้าสถานะไม่เปลี่ยน ไม่ต้องทำอะไร
    if (oldStatus === status) {
      await connection.rollback();
      return res.json({
        success: true,
        message: 'สถานะเหมือนเดิม',
        data: { ticket_id: ticketId, status }
      });
    }

    // อัปเดตสถานะ
    let updateQuery = `UPDATE SupportTickets SET status = ?, updated_at = NOW()`;
    let updateParams = [status];

    // ถ้าเป็น resolved ให้บันทึก resolved_at
    if (status === 'resolved') {
      updateQuery += `, resolved_at = NOW()`;
    }

    // ถ้าเป็น closed ให้บันทึก closed_at
    if (status === 'closed') {
      updateQuery += `, closed_at = NOW()`;
    }

    updateQuery += ` WHERE ticket_id = ?`;
    updateParams.push(ticketId);

    await connection.query(updateQuery, updateParams);

    // บันทึกประวัติการเปลี่ยนสถานะ
    const historyId = generateHistoryId();
    await connection.query(
      `INSERT INTO TicketStatusHistory 
       (history_id, ticket_id, old_status, new_status, changed_by, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [historyId, ticketId, oldStatus, status, adminId, comment || null]
    );

    // ส่งการแจ้งเตือนให้ผู้ใช้
    const statusMessages = {
      'open': 'เคสของคุณถูกเปิดใหม่',
      'in_progress': 'เคสของคุณกำลังถูกดำเนินการ',
      'waiting_user': 'รอการตอบกลับจากคุณ',
      'resolved': 'เคสของคุณได้รับการแก้ไขแล้ว',
      'closed': 'เคสของคุณถูกปิดแล้ว'
    };

    const notificationId = `NTF${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    await connection.query(
      `INSERT INTO Notifications 
       (notification_id, user_id, notification_type, title, body, related_entity_type, related_entity_id, priority, channels)
       VALUES (?, ?, 'support_status', 'สถานะเคสของคุณเปลี่ยนแปลง', 
               ?, 'support_ticket', ?, 'medium', 'app')`,
      [notificationId, ticket.user_id, statusMessages[status], ticketId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'อัปเดตสถานะสำเร็จ',
      data: {
        ticket_id: ticketId,
        old_status: oldStatus,
        new_status: status
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating ticket status:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * ============================================
 * ADMIN: เปลี่ยน Priority
 * ============================================
 */
const updateTicketPriority = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { priority } = req.body;

    // Validation
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'ระดับความสำคัญไม่ถูกต้อง'
      });
    }

    // ตรวจสอบว่า ticket มีอยู่จริง
    const [tickets] = await pool.query(
      'SELECT * FROM SupportTickets WHERE ticket_id = ?',
      [ticketId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ ticket นี้'
      });
    }

    // อัปเดต priority
    await pool.query(
      `UPDATE SupportTickets 
       SET priority = ?, updated_at = NOW()
       WHERE ticket_id = ?`,
      [priority, ticketId]
    );

    res.json({
      success: true,
      message: 'อัปเดตระดับความสำคัญสำเร็จ',
      data: {
        ticket_id: ticketId,
        priority
      }
    });

  } catch (error) {
    console.error('Error updating ticket priority:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปเดตระดับความสำคัญ',
      error: error.message
    });
  }
};

/**
 * ============================================
 * ADMIN: โอนเคสให้แอดมินคนอื่น
 * ============================================
 */
const reassignTicket = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { ticketId } = req.params;
    const { assigned_to } = req.body;
    const currentAdminId = req.user.user_id;

    // Validation
    if (!assigned_to) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุแอดมินที่จะโอนเคสให้'
      });
    }

    // ตรวจสอบว่า admin ที่จะโอนให้มีอยู่จริง
    const [admins] = await connection.query(
      'SELECT * FROM users WHERE user_id = ? AND role = "admin"',
      [assigned_to]
    );

    if (admins.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบแอดมินที่ระบุ'
      });
    }

    // ตรวจสอบว่า ticket มีอยู่จริง
    const [tickets] = await connection.query(
      'SELECT * FROM SupportTickets WHERE ticket_id = ?',
      [ticketId]
    );

    if (tickets.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'ไม่พบ ticket นี้'
      });
    }

    // อัปเดต assigned_to
    await connection.query(
      `UPDATE SupportTickets 
       SET assigned_to = ?, updated_at = NOW()
       WHERE ticket_id = ?`,
      [assigned_to, ticketId]
    );

    // สร้างข้อความอัตโนมัติ (Internal Note)
    const messageId = generateMessageId();
    await connection.query(
      `INSERT INTO TicketMessages 
       (message_id, ticket_id, sender_id, message, is_internal_note)
       VALUES (?, ?, ?, 'เคสถูกโอนให้แอดมินคนอื่น', 1)`,
      [messageId, ticketId, currentAdminId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'โอนเคสสำเร็จ',
      data: {
        ticket_id: ticketId,
        assigned_to
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error reassigning ticket:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการโอนเคส',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * ============================================
 * ADMIN: Dashboard Statistics
 * ============================================
 */
const getTicketStatistics = async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    // สถิติรวม
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_tickets,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_tickets,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tickets,
        SUM(CASE WHEN status = 'waiting_user' THEN 1 ELSE 0 END) as waiting_user_tickets,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_tickets,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_tickets,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent_tickets,
        SUM(CASE WHEN assigned_to IS NULL THEN 1 ELSE 0 END) as unassigned_tickets,
        AVG(CASE 
          WHEN first_response_at IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, created_at, first_response_at) 
        END) as avg_first_response_hours,
        AVG(CASE 
          WHEN resolved_at IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) 
        END) as avg_resolution_hours
      FROM SupportTickets
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;

    const [summary] = await pool.query(summaryQuery, [parseInt(period)]);

    // สถิติตาม Category
    const categoryQuery = `
      SELECT 
        category,
        COUNT(*) as count,
        AVG(CASE 
          WHEN resolved_at IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) 
        END) as avg_resolution_hours
      FROM SupportTickets
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY category
      ORDER BY count DESC
    `;

    const [categoryStats] = await pool.query(categoryQuery, [parseInt(period)]);

    // สถิติตาม Admin
    const adminQuery = `
      SELECT 
        u.user_id,
        u.username,
        COUNT(st.ticket_id) as assigned_count,
        SUM(CASE WHEN st.status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
        AVG(CASE 
          WHEN st.resolved_at IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, st.created_at, st.resolved_at) 
        END) as avg_resolution_hours,
        AVG(CASE WHEN st.satisfaction_rating IS NOT NULL THEN st.satisfaction_rating END) as avg_rating
      FROM users u
      LEFT JOIN SupportTickets st ON u.user_id = st.assigned_to 
        AND st.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      WHERE u.role = 'admin'
      GROUP BY u.user_id, u.username
      HAVING assigned_count > 0
      ORDER BY resolved_count DESC
    `;

    const [adminStats] = await pool.query(adminQuery, [parseInt(period)]);

    // Tickets ต่อวัน (สำหรับ chart)
    const dailyQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM SupportTickets
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const [dailyStats] = await pool.query(dailyQuery, [parseInt(period)]);

    res.json({
      success: true,
      data: {
        summary: summary[0],
        by_category: categoryStats,
        by_admin: adminStats,
        daily_tickets: dailyStats
      }
    });

  } catch (error) {
    console.error('Error getting ticket statistics:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงสถิติ',
      error: error.message
    });
  }
};

module.exports = {
  getAllTickets,
  getTicketById,
  assignTicketToSelf,
  replyToTicket,
  updateTicketStatus,
  updateTicketPriority,
  reassignTicket,
  getTicketStatistics
};