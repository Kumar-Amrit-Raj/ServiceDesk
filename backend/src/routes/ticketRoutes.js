import { Router } from 'express';
import { checkDuplicateTickets } from '../controllers/duplicateController.js';
import {
  createTicket,
  createTicketComment,
  getTicket,
  listSupportAgents,
  listTicketComments,
  listTicketHistory,
  listTickets,
  updateTicket,
} from '../controllers/ticketController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = Router();

router.use(authenticate);
router.route('/').get(listTickets).post(createTicket);
router.post('/duplicate-check', checkDuplicateTickets);
router.get('/support-agents', authorizeRoles('support', 'admin'), listSupportAgents);
router.get('/:id/comments', listTicketComments);
router.post('/:id/comments', createTicketComment);
router.get('/:id/history', listTicketHistory);
router.patch('/:id', authorizeRoles('support', 'admin'), updateTicket);
router.get('/:id', getTicket);

export default router;
