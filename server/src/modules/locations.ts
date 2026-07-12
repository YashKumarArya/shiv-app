import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';

const schema = z.object({
  site_name: z.string().min(1),
  client_name: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  contact_person: z.string().optional(),
  contact_number: z.string().optional(),
  status: z.boolean().optional(),
});

export default crudRouter({
  table: 'locations',
  createSchema: schema,
  updateSchema: schema.partial(),
  searchColumns: ['site_name', 'client_name', 'city'],
  filterColumns: ['status'],
});
