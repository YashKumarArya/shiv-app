-- Security Agency Management System — PostgreSQL schema
-- Based on the root schema.sql, with additions:
--   * app_users.role ('admin' | 'staff')
--   * updated_at on every table (the generic CRUD layer sets it on update)
--   * UNIQUE constraints: one attendance row per employee per day,
--     one salary payment per employee per month
-- Idempotent: safe to run repeatedly.

CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(15),
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'staff',
    status BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS designations (
    id SERIAL PRIMARY KEY,
    designation_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    default_salary DECIMAL(10,2),
    uniform_required BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(30) UNIQUE NOT NULL,
    designation_id INT NOT NULL REFERENCES designations(id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    phone VARCHAR(15),
    alternate_phone VARCHAR(15),
    email VARCHAR(150),
    date_of_birth DATE,
    joining_date DATE NOT NULL,
    salary DECIMAL(10,2),
    aadhaar_number VARCHAR(20),
    address TEXT,
    photo TEXT,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    site_name VARCHAR(150) NOT NULL,
    client_name VARCHAR(150),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    contact_person VARCHAR(100),
    contact_number VARCHAR(15),
    status BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_assignments (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    location_id INT NOT NULL REFERENCES locations(id),
    shift VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    location_id INT REFERENCES locations(id),
    attendance_date DATE NOT NULL,
    check_in TIME,
    check_out TIME,
    status VARCHAR(20) NOT NULL,
    remarks TEXT,
    marked_by INT REFERENCES app_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    payment_month INT NOT NULL,
    payment_year INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE,
    payment_mode VARCHAR(50),
    transaction_reference VARCHAR(200),
    payment_proof TEXT,
    remarks TEXT,
    created_by INT REFERENCES app_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (employee_id, payment_month, payment_year)
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    document_type VARCHAR(100),
    document_number VARCHAR(100),
    document_file TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uniform_issues (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    issued_date DATE NOT NULL,
    issued_by INT REFERENCES app_users(id),
    uniform_size VARCHAR(20),
    remarks TEXT,
    returned BOOLEAN DEFAULT FALSE,
    returned_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assignments_employee ON employee_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_documents_employee ON employee_documents(employee_id);

INSERT INTO designations (designation_name, default_salary, uniform_required) VALUES
    ('Security Guard', 18000, TRUE),
    ('Gunman', 25000, TRUE),
    ('Supervisor', 30000, TRUE),
    ('Housekeeping', 16000, FALSE)
ON CONFLICT (designation_name) DO NOTHING;
