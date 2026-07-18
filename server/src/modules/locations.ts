import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { HttpError } from '../lib/http.js';

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
  beforeUpdate: async (body, _req, locationId, tx) => {
    if (body.status !== false) return body;
    const location = await tx.queryOne(`SELECT id FROM locations WHERE id = $1 FOR UPDATE`, [locationId]);
    if (!location) throw new HttpError(404, 'Location not found');
    const assignment = await tx.queryOne(
      `SELECT id
       FROM employee_assignments
       WHERE location_id = $1 AND (end_date IS NULL OR end_date >= CURRENT_DATE)
       LIMIT 1`,
      [locationId],
    );
    if (assignment) {
      throw new HttpError(409, 'Reassign active employees before disabling this location');
    }
    return body;
  },
});
