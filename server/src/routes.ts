import { Router } from 'express';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import assignments from './modules/assignments.js';
import attendance from './modules/attendance.js';
import auth from './modules/auth.js';
import dashboard from './modules/dashboard.js';
import designations from './modules/designations.js';
import documents from './modules/documents.js';
import employees from './modules/employees.js';
import locations from './modules/locations.js';
import payments from './modules/payments.js';
import settings from './modules/settings.js';
import uniforms from './modules/uniforms.js';
import uploads from './modules/uploads.js';
import users from './modules/users.js';

export const routes = Router();

routes.use('/auth', auth);

routes.use(requireAuth);
routes.use('/dashboard', dashboard);
routes.use('/settings', settings);
routes.use('/uploads', uploads);
routes.use('/designations', designations);
routes.use('/employees', employees);
routes.use('/locations', locations);
routes.use('/assignments', assignments);
routes.use('/attendance', attendance);
routes.use('/payments', payments);
routes.use('/documents', documents);
routes.use('/uniforms', uniforms);
routes.use('/users', requireAdmin, users);
