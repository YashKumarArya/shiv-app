import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';

const schema = z.object({
  site_name: z.string().min(1),
  client_name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  contact_person: z.string().nullable().optional(),
  contact_number: z.string().nullable().optional(),
  status: z.boolean().optional(),
});

export default crudRouter({
  table: 'locations',
  createSchema: schema,
  updateSchema: schema.partial(),
  searchColumns: ['site_name', 'client_name', 'city'],
  filterColumns: ['status'],
});
