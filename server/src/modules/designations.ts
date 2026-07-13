import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { money } from '../lib/fields.js';

const schema = z.object({
  designation_name: z.string().min(1),
  description: z.string().nullable().optional(),
  default_salary: money.nullable().optional(),
  uniform_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export default crudRouter({
  table: 'designations',
  createSchema: schema,
  updateSchema: schema.partial(),
  searchColumns: ['designation_name'],
  filterColumns: ['is_active'],
});
