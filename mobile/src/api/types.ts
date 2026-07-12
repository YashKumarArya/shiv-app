export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'staff';
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

/** Joined employee/location display columns returned by list endpoints. */
interface Joined {
  first_name?: string;
  last_name?: string;
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
  amount: string;
  payment_date?: string;
  payment_mode?: string;
  transaction_reference?: string;
  payment_proof?: string;
  remarks?: string;
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
  uniform_pending: number;
}

export const employeeName = (row: { first_name?: string; last_name?: string }) =>
  [row.first_name, row.last_name].filter(Boolean).join(' ');
