import { Router } from 'express';
import { signUploadResponsePaths } from './lib/uploads.js';
import { requireAdmin, requireAuth, requireOffice } from './middleware/auth.js';
import assignments from './modules/assignments.js';
import attendance from './modules/attendance.js';
import auth from './modules/auth.js';
import dashboard from './modules/dashboard.js';
import designations from './modules/designations.js';
import documents from './modules/documents.js';
import employees from './modules/employees.js';
import locations from './modules/locations.js';
import me from './modules/me.js';
import patrols from './modules/patrols.js';
import payments from './modules/payments.js';
import quotations from './modules/quotations.js';
import settings from './modules/settings.js';
import uniforms from './modules/uniforms.js';
import uploads from './modules/uploads.js';
import users from './modules/users.js';

export const routes = Router();

routes.use('/auth', auth);

routes.use(requireAuth);
routes.use(signUploadResponsePaths);

// Available to every signed-in role. Guards upload a selfie at each checkpoint,
// and the module already validates and re-encodes whatever it is handed.
routes.use('/uploads', uploads);

// Self-scoped: these resolve the employee from the session, never from a
// client-supplied id, and are the only data endpoints a field login may reach.
routes.use('/me', me);

// Mixed: route/checkpoint administration is office-only, walking a patrol is
// field-only. The split is applied inside the module.
routes.use('/patrols', patrols);

// Agency-wide. Every one of these reads across all employees, so field logins
// are refused before the module runs.
routes.use('/dashboard', requireOffice, dashboard);
routes.use('/settings', requireOffice, settings);
routes.use('/designations', requireOffice, designations);
routes.use('/employees', requireOffice, employees);
routes.use('/locations', requireOffice, locations);
routes.use('/assignments', requireOffice, assignments);
routes.use('/attendance', requireOffice, attendance);
routes.use('/payments', requireOffice, payments);
routes.use('/documents', requireOffice, documents);
routes.use('/uniforms', requireOffice, uniforms);
routes.use('/quotations', requireAdmin, quotations);
routes.use('/users', requireAdmin, users);
