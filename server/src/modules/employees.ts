import { z } from 'zod';
import { crudRouter } from '../lib/crud.js';
import { dateString, id, money } from '../lib/fields.js';
import { HttpError } from '../lib/http.js';
import { assertCompletedPayrollFinalized } from '../lib/payroll.js';
import { uploadReference } from '../lib/uploads.js';

const schema = z.object({
  employee_code: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()).optional(),
  designation_id: id,
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(15).nullable().optional(),
  alternate_phone: z.string().trim().max(15).nullable().optional(),
  email: z.string().trim().toLowerCase().email().max(150).nullable().optional(),
  date_of_birth: dateString.nullable().optional(),
  joining_date: dateString,
  salary: money.nullable().optional(),
  aadhaar_number: z.string().nullable().optional(),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().optional(),
  address: z.string().nullable().optional(),
  photo: uploadReference.nullable().optional(),
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
  beforeCreate: async (body, _req, tx) => {
    const designation = await tx.queryOne<{ is_active: boolean }>(
      `SELECT is_active FROM designations WHERE id = $1 FOR SHARE`,
      [body.designation_id],
    );
    if (!designation) throw new HttpError(404, 'Designation not found');
    if (!designation.is_active) throw new HttpError(409, 'An inactive designation cannot be assigned');
    if (body.employee_code) return body;

    // The sequence may lag behind manually imported EMP codes. Skip collisions
    // instead of making an otherwise valid employee creation fail at random.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { n } = (await tx.queryOne<{ n: string }>(`SELECT nextval('employee_code_seq') AS n`))!;
      const employeeCode = `EMP${n.padStart(4, '0')}`;
      const collision = await tx.queryOne(`SELECT id FROM employees WHERE employee_code = $1`, [employeeCode]);
      if (!collision) return { ...body, employee_code: employeeCode };
    }
    throw new HttpError(409, 'Could not generate a unique employee code');
  },
  beforeUpdate: async (body, _req, employeeId, tx) => {
    let targetDesignation: { is_active: boolean; default_salary: number | null } | undefined;
    if (body.designation_id !== undefined) {
      targetDesignation = await tx.queryOne<{ is_active: boolean; default_salary: number | null }>(
        `SELECT is_active, default_salary::float AS default_salary
         FROM designations WHERE id = $1 FOR SHARE`,
        [body.designation_id],
      );
      if (!targetDesignation) throw new HttpError(404, 'Designation not found');
    }

    const employee = await tx.queryOne<{
      id: number;
      salary: number | null;
      designation_id: number;
      default_salary: number | null;
      joining_date: string;
      current_payroll_finalized: boolean;
      current_paid: number;
    }>(
      `SELECT e.id, e.salary::float AS salary, e.designation_id,
              d.default_salary::float AS default_salary,
              to_char(e.joining_date, 'YYYY-MM-DD') AS joining_date,
              EXISTS (
                SELECT 1 FROM payroll_snapshots ps
                WHERE ps.employee_id = e.id
                  AND ps.payment_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
                  AND ps.payment_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
              ) AS current_payroll_finalized,
              COALESCE((
                SELECT SUM(CASE WHEN p.entry_type = 'reversal' THEN -p.amount ELSE p.amount END)
                FROM payments p
                WHERE p.employee_id = e.id
                  AND p.payment_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
                  AND p.payment_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
              ), 0)::float AS current_paid
       FROM employees e
       JOIN designations d ON d.id = e.designation_id
       WHERE e.id = $1
       FOR UPDATE OF e`,
      [employeeId],
    );
    if (!employee) throw new HttpError(404, 'Employee not found');

    const cents = (value: number | null) => Math.round((value ?? 0) * 100);
    const salaryValue = body.salary as number | null | undefined;
    const salaryChanged = salaryValue !== undefined && (
      (salaryValue === null) !== (employee.salary === null)
      || (salaryValue !== null && employee.salary !== null
        && cents(salaryValue) !== cents(employee.salary))
    );
    const designationChanged = body.designation_id !== undefined
      && Number(body.designation_id) !== employee.designation_id;
    const joiningDateChanged = body.joining_date !== undefined
      && body.joining_date !== employee.joining_date;

    if (designationChanged && !targetDesignation?.is_active) {
      throw new HttpError(409, 'An inactive designation cannot be assigned');
    }

    if (joiningDateChanged) {
      const conflict = await tx.queryOne<{ evidence_type: string; evidence_date: string }>(
        `SELECT evidence_type, to_char(evidence_date, 'YYYY-MM-DD') AS evidence_date
         FROM (
           SELECT 'attendance' AS evidence_type, MIN(a.attendance_date) AS evidence_date
           FROM attendance a
           WHERE a.employee_id = $1 AND a.attendance_date < $2::date

           UNION ALL

           SELECT 'payment date', MIN(p.payment_date)
           FROM payments p
           WHERE p.employee_id = $1 AND p.entry_type = 'payment'
             AND p.payment_date IS NOT NULL
             AND p.payment_date < $2::date

           UNION ALL

           SELECT 'payment period', MIN(make_date(p.payment_year, p.payment_month, 1))
           FROM payments p
           WHERE p.employee_id = $1 AND p.entry_type = 'payment'
             AND make_date(p.payment_year, p.payment_month, 1)
                   < date_trunc('month', $2::date)::date

           UNION ALL

           SELECT 'finalized payroll', MIN(make_date(ps.payment_year, ps.payment_month, 1))
           FROM payroll_snapshots ps
           WHERE ps.employee_id = $1
             AND make_date(ps.payment_year, ps.payment_month, 1)
                   < date_trunc('month', $2::date)::date

           UNION ALL

           SELECT 'assignment', MIN(ea.start_date)
           FROM employee_assignments ea
           WHERE ea.employee_id = $1 AND ea.start_date < $2::date
         ) evidence
         WHERE evidence_date IS NOT NULL
         ORDER BY evidence_date
         LIMIT 1`,
        [employeeId, body.joining_date],
      );
      if (conflict) {
        throw new HttpError(
          409,
          `Joining date cannot be after existing ${conflict.evidence_type} history (${conflict.evidence_date})`,
        );
      }
    }

    if (salaryChanged || designationChanged || joiningDateChanged) {
      await assertCompletedPayrollFinalized(tx, { employeeId });
    }

    if ((salaryChanged || designationChanged) && !employee.current_payroll_finalized) {
      const currentEffective = employee.salary ?? employee.default_salary;
      const nextEmployeeSalary = body.salary !== undefined ? body.salary as number | null : employee.salary;
      const nextDesignationSalary = targetDesignation
        ? targetDesignation.default_salary
        : employee.default_salary;
      const nextEffective = nextEmployeeSalary ?? nextDesignationSalary;
      if (cents(nextEffective) < cents(currentEffective) && cents(employee.current_paid) > cents(nextEffective)) {
        throw new HttpError(
          409,
          `Salary cannot be reduced below the ${employee.current_paid.toFixed(2)} already paid for the open current payroll`,
        );
      }
    }
    return body;
  },
});
