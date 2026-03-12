const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faqController');
const { verifyToken } = require('../middleware/authMiddleware');
const  verifyAdmin  = require('../middleware/verifyAdmin');

router.use(verifyToken);
router.use(verifyAdmin);

router.get('/', faqController.getAllFAQs);

router.post('/', faqController.createFAQ);

router.put('/:faqId', faqController.updateFAQ);

router.delete('/:faqId', faqController.deleteFAQ);

router.post('/reorder', faqController.reorderFAQs);

module.exports = router;