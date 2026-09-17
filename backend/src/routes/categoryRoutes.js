import { Router } from 'express';
import { listCategories } from '../controllers/ticketController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.get('/', authenticate, listCategories);

export default router;
