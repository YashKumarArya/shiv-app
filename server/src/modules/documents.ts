import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { id } from '../lib/fields.js';

const schema = z.object({
  employee_id: id,
  document_type: z.string().min(1),
  document_number: z.string().nullable().optional(),
  document_file: z.string().min(1),
});

export default crudRouter({
  table: 'employee_documents',
  createSchema: schema,
  updateSchema: schema.partial(),
  filterColumns: ['employee_id', 'document_type'],
  listQuery: `SELECT employee_documents.*, employees.first_name, employees.last_name
              FROM employee_documents JOIN employees ON employees.id = employee_documents.employee_id`,
});
