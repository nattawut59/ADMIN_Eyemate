// สร้าง ID สำหรับ Support Tickets
const generateTicketId = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TKT${timestamp}${random}`;
};

// สร้าง ID สำหรับ Messages
const generateMessageId = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MSG${timestamp}${random}`;
};

// สร้าง ID สำหรับ History
const generateHistoryId = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `HST${timestamp}${random}`;
};

// สร้าง ID สำหรับ FAQ
const generateFaqId = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `FAQ${timestamp}${random}`;
};

module.exports = {
  generateTicketId,
  generateMessageId,
  generateHistoryId,
  generateFaqId
};