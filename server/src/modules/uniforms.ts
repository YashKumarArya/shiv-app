import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { dateString, id } from '../lib/fields.js';

const schema = z.object({
  employee_id: id,
  issued_date: dateString,
  uniform_size: z.string().optional(),
  remarks: z.string().optional(),
  returned: z.boolean().optional(),
  returned_date: dateString.optional(),
});

export default crudRouter({
  table: 'uniform_issues',
  createSchema: schema,
  updateSchema: schema.partial(),
  filterColumns: ['employee_id', 'returned'],
  listQuery: `SELECT uniform_issues.*, employees.first_name, employees.last_name
              FROM uniform_issues JOIN employees ON employees.id = uniform_issues.employee_id`,
  beforeCreate: (body, req) => ({ ...body, issued_by: req.user!.id }),
});
