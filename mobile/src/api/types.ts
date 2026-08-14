import { z } from 'zod';

export const ROLES = ['admin', 'staff', 'supervisor', 'guard'] as const;

export const userSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  // Guards and supervisors sign in by phone and usually have no email address.
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(ROLES),
  /** Set for field roles only; the employee whose own record this login sees. */
  employee_id: z.number().int().positive().nullable().optional(),
});

export type User = z.infer<typeof userSchema>;
export type Role = (typeof ROLES)[number];

/** Field roles get the self-scoped app; office roles get the management app. */
export const isFieldRole = (role: Role) => role === 'guard' || role === 'supervisor';

export interface PatrolRoute {
  id: number;
  location_id: number;
  site_name?: string;
  route_name: string;
  description?: string | null;
  geofence_metres: number;
  grace_minutes: number;
  is_active: boolean;
  checkpoint_count?: number;
  schedule_count?: number;
}

export interface PatrolCheckpoint {
  id: number;
  route_id: number;
  route_name?: string;
  checkpoint_name: string;
  sequence: number;
  /** Present only in office responses — never sent to the guard app. */
  qr_token?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  is_active: boolean;
}

export interface PatrolSchedule {
  id: number;
  route_id: number;
  route_name?: string;
  start_time: string;
  days_of_week: number[];
  is_active: boolean;
}

export type PatrolStatus = 'Completed' | 'Partial' | 'Missed' | 'Due' | 'Upcoming';

export interface PatrolComplianceRow extends NamedEmployee {
  route_id: number;
  route_name: string;
  location_id: number;
  site_name: string;
  schedule_id: number;
  start_time: string;
  patrol_date: string;
  checkpoint_count: number;
  session_id: number | null;
  employee_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  scan_count: number;
  status: PatrolStatus;
}

export interface PatrolSessionSummary {
  id: number;
  client_uuid: string;
  route_id: number;
  schedule_id: number | null;
  started_at: string;
  completed_at: string | null;
  scans: { checkpoint_id: number; scanned_at: string }[];
}

export interface PatrolRound {
  schedule_id: number;
  start_time: string;
  session: PatrolSessionSummary | null;
}

/**
 * A checkpoint as the guard app sees it: identified by a hash of its QR token,
 * never the token itself, so the app can recognise a scan offline without being
 * able to fabricate one.
 */
export interface GuardCheckpoint {
  id: number;
  route_id: number;
  checkpoint_name: string;
  sequence: number;
  latitude?: string | number | null;
  longitude?: string | number | null;
  qr_token_hash: string;
}

export interface GuardRoute {
  id: number;
  route_name: string;
  description?: string | null;
  geofence_metres: number;
  grace_minutes: number;
  checkpoints: GuardCheckpoint[];
  rounds: PatrolRound[];
  unscheduled_sessions: PatrolSessionSummary[];
}

/** Every active round with the days it runs, used only to set device alarms. */
export interface PatrolReminder {
  schedule_id: number;
  route_id: number;
  route_name: string;
  start_time: string;
  /** ISO weekday numbers: 1 = Monday .. 7 = Sunday. */
  days_of_week: number[];
}

/** The guard app's whole patrol screen, from GET /patrols/my/today. */
export interface PatrolToday {
  location: { location_id: number; site_name: string } | null;
  reminders: PatrolReminder[];
  routes: GuardRoute[];
}

export interface MyProfile {
  employee: Employee & { designation_name?: string };
  posting: {
    location_id: number;
    site_name: string;
    address?: string | null;
    city?: string | null;
    shift?: string | null;
    start_date: string;
    contact_person?: string | null;
    contact_number?: string | null;
  } | null;
}

export interface MySalary {
  month: number;
  year: number;
  designation_name?: string | null;
  salary_set: boolean;
  monthly_salary: number | null;
  payable_days: number;
  worked_days: number;
  per_day_rate: number | null;
  due_amount: number | null;
  paid_amount: number;
  remaining_amount: number | null;
  payroll_finalized: boolean;
  payments: Payment[];
}

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

export interface QuotationService {
  id: string;
  label: string;
  /** Integer paise; quotation calculations never use floating-point rupees. */
  baseAmountMinor: number;
}

export type QuotationCostHead =
  | {
      id: string;
      label: string;
      kind: 'percentage';
      /** 100 basis points = 1%. */
      rateBps: number;
      basis: 'base' | 'running_subtotal';
    }
  | {
      id: string;
      label: string;
      kind: 'fixed';
      amountsMinor: Record<string, number>;
    }
  | {
      id: string;
      label: string;
      kind: 'text';
      values: Record<string, string>;
    };

export interface QuotationCalculation {
  version: 1;
  rows: { costHeadId: string; amountsMinor: Record<string, number | null> }[];
  totalsMinor: Record<string, number>;
}

export interface QuotationCompanySnapshot {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
  tagline?: string;
  logo?: string;
  signature?: string;
}

export interface QuotationInput {
  quotationDate: string;
  validUntil?: string | null;
  title: string;
  clientName: string;
  clientAddress?: string | null;
  clientGstNumber?: string | null;
  clientContactName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  services: QuotationService[];
  costHeads: QuotationCostHead[];
  terms?: string | null;
}

export interface Quotation {
  id: number;
  quotation_number: string;
  status: 'Draft' | 'Issued';
  quotation_date: string;
  valid_until?: string | null;
  title: string;
  client_name: string;
  client_address?: string | null;
  client_gst_number?: string | null;
  client_contact_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  services: QuotationService[];
  cost_heads: QuotationCostHead[];
  calculation: QuotationCalculation;
  company_snapshot: QuotationCompanySnapshot;
  terms?: string | null;
  issued_at?: string | null;
  created_at: string;
  updated_at: string;
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
