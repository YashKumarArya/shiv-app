import { z } from 'zod';
import { queryOne } from '../config/db.js';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, money } from '../lib/fields.js';

const schema = z.object({
  employee_code: z.string().min(1).optional(),
  designation_id: id,
  first_name: z.string().min(1),
  last_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  alternate_phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  date_of_birth: dateString.nullable().optional(),
  joining_date: dateString,
  salary: money.nullable().optional(),
  aadhaar_number: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  photo: z.string().nullable().optional(),
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
  beforeCreate: async (body) => {
    if (body.employee_code) return body;
    const { n } = (await queryOne<{ n: string }>(`SELECT nextval('employee_code_seq') AS n`))!;
    return { ...body, employee_code: `EMP${n.padStart(4, '0')}` };
  },
});
