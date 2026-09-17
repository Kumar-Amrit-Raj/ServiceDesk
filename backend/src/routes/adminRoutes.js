import { Router } from 'express';
import { listUsers, updateUserRole } from '../controllers/adminController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = Router();

router.use(authenticate, authorizeRoles('admin'));
router.get('/users', listUsers);
router.patch('/users/:id/role', updateUserRole);

export default router;
