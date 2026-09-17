import { Router } from 'express';
import { createTicket, getTicket, listTickets } from '../controllers/ticketController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.route('/').get(listTickets).post(createTicket);
router.get('/:id', getTicket);

export default router;
