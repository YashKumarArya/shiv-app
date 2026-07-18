import { z } from 'zod';

export const userSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'staff']),
});

export type User = z.infer<typeof userSchema>;

export interface Designation {
  id: number;
  designation_name: string;
  description?: string;
  default_salary?: string;
  uniform_required: boolean;
  is_active: boolean;
}

export interface Employee {
  id: number;
  employee_code: string;
  designation_id: number;
  designation_name?: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  alternate_phone?: string;
  email?: string;
  date_of_birth?: string;
  joining_date: string;
  salary?: string;
  aadhaar_number?: string;
  blood_group?: string;
  address?: string;
  photo?: string;
  status: 'Active' | 'Inactive';
}

export interface Location {
  id: number;
  site_name: string;
  client_name?: string;
  address?: string;
  city?: string;
  state?: string;
  contact_person?: string;
  contact_number?: string;
  status: boolean;
}

/** Employee name columns returned by both employee and joined-resource endpoints. */
interface NamedEmployee {
  first_name?: string | null;
  last_name?: string | null;
}

/** Joined employee/location display columns returned by list endpoints. */
interface Joined extends NamedEmployee {
  site_name?: string;
}

export interface Assignment extends Joined {
  id: number;
  employee_id: number;
  location_id: number;
  shift?: string;
  start_date: string;
  end_date?: string;
  status: string;
  display_status?: 'Planned' | 'Active' | 'Ended';
}

export interface Attendance extends Joined {
  id: number;
  employee_id: number;
  location_id?: number;
  attendance_date: string;
  check_in?: string;
  check_out?: string;
  status: string;
  remarks?: string;
}

export interface Payment extends Joined {
  id: number;
  employee_id: number;
  payment_month: number;
  payment_year: number;
  /** Signed by the API: reversal ledger entries are negative. */
  amount: string | number;
  original_amount?: string | number;
  payment_date?: string;
  payment_mode?: string;
  transaction_reference?: string;
  payment_proof?: string;
  remarks?: string;
  entry_type: 'payment' | 'reversal';
  reverses_payment_id?: number | null;
  reversal_reason?: string | null;
  is_reversed?: boolean;
  idempotency_key?: string | null;
}

export interface EmployeeDocument extends Joined {
  id: number;
  employee_id: number;
  document_type: string;
  document_number?: string;
  document_file: string;
}

export interface UniformIssue extends Joined {
  id: number;
  employee_id: number;
  issued_date: string;
  uniform_size?: string;
  remarks?: string;
  returned: boolean;
  returned_date?: string;
}

export interface DashboardStats {
  total_employees: number;
  active_employees: number;
  present_today: number;
  active_locations: number;
  pending_payments: number;
  missing_salaries: number;
  uniform_pending: number;
}

export interface SalaryTrackingEmployee extends NamedEmployee {
  employee_id: number;
  employee_code: string;
  photo?: string | null;
  designation_name?: string | null;
  effective_salary: number;
  worked_days: number;
  payable_days: number;
  per_day_rate: number;
  due_amount: number;
  paid_amount: number;
  remaining_amount: number;
  advance_amount: number;
  /** Legacy-compatible wire status; use has_earnings to distinguish an empty period. */
  status: 'Paid' | 'Partial' | 'Due' | 'Advance' | 'Not Set';
  has_earnings: boolean;
  payment_count: number;
  payroll_finalized: boolean;
  payroll_finalized_at?: string | null;
  payroll_finalization_reason?: 'period_closed' | 'payment_recorded' | 'manual' | 'migration' | null;
  payroll_snapshot_estimated: boolean;
  payroll_approved: boolean;
  payroll_approved_at?: string | null;
  payroll_approval_source?: 'manual' | 'migration' | null;
  payment?: {
    id: number;
    payment_date?: string | null;
    payment_mode?: string | null;
  } | null;
}

export interface SalaryTrackingResponse {
  month: number;
  year: number;
  period_state: 'past' | 'current';
  payroll_finalized: boolean;
  payroll_approved: boolean;
  finalized_employee_count: number;
  approved_employee_count: number;
  estimated_snapshot_count: number;
  open_employee_count: number;
  summary: {
    total_payroll: number;
    total_paid: number;
    total_remaining: number;
    total_advance: number;
    paid_count: number;
    partial_count: number;
    due_count: number;
    advance_count: number;
    no_earnings_count: number;
    not_set_count: number;
  };
  employees: SalaryTrackingEmployee[];
}

export const employeeName = (row: NamedEmployee) =>
  [row.first_name, row.last_name].filter(Boolean).join(' ');

export const employeeInitials = (row: NamedEmployee) =>
  [row.first_name, row.last_name]
    .filter(Boolean)
    .map((part) => part!.trim().charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
