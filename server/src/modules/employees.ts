import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, money } from '../lib/fields.js';

const schema = z.object({
  employee_code: z.string().min(1),
  designation_id: id,
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  alternate_phone: z.string().optional(),
  email: z.string().email().optional(),
  date_of_birth: dateString.optional(),
  joining_date: dateString,
  salary: money.optional(),
  aadhaar_number: z.string().optional(),
  address: z.string().optional(),
  photo: z.string().optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
});

export default crudRouter({
  table: 'employees',
  createSchema: schema,
  updateSchema: schema.partial(),
  searchColumns: ['employees.first_name', 'employees.last_name', 'employees.employee_code', 'employees.phone'],
  filterColumns: ['status', 'designation_id'],
  listQuery: `SELECT employees.*, designations.designation_name
              FROM employees JOIN designations ON designations.id = employees.designation_id`,
});
