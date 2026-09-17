import { Router } from 'express';
import {
  createAdminCategory,
  listAdminCategories,
  listUsers,
  updateAdminCategory,
  updateUserRole,
} from '../controllers/adminController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = Router();

router.use(authenticate, authorizeRoles('admin'));
router.get('/users', listUsers);
router.patch('/users/:id/role', updateUserRole);
router.get('/categories', listAdminCategories);
router.post('/categories', createAdminCategory);
router.patch('/categories/:id', updateAdminCategory);

export default router;
