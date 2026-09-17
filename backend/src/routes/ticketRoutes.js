import { Router } from 'express';
import { getTicketAnalytics } from '../controllers/analyticsController.js';
import { checkDuplicateTickets } from '../controllers/duplicateController.js';
import { suggestResolvedTickets } from '../controllers/solutionController.js';
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
router.post('/solution-suggestions', suggestResolvedTickets);
router.get('/support-agents', authorizeRoles('support', 'admin'), listSupportAgents);
router.get('/analytics', authorizeRoles('support', 'admin'), getTicketAnalytics);
router.get('/:id/comments', listTicketComments);
router.post('/:id/comments', createTicketComment);
router.get('/:id/history', listTicketHistory);
router.patch('/:id', authorizeRoles('support', 'admin'), updateTicket);
router.get('/:id', getTicket);

export default router;
