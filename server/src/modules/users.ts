import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(['admin', 'staff']).default('staff'),
  status: z.boolean().optional(),
});

export default crudRouter({
  table: 'app_users',
  createSchema,
  updateSchema: createSchema.omit({ password: true }).partial(),
  searchColumns: ['name', 'email'],
  listQuery: 'SELECT id, name, email, phone, role, status, created_at FROM app_users',
  returning: 'id, name, email, phone, role, status',
  beforeCreate: async ({ password, ...rest }) => ({
    ...rest,
    password_hash: await bcrypt.hash(password as string, 10),
  }),
});
