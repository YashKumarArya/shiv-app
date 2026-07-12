-- ============================================
-- SECURITY AGENCY MANAGEMENT SYSTEM DATABASE
-- PostgreSQL Schema
-- ============================================

-- ============================================
-- 1. APP USERS (Office Staff / Admins)
-- ============================================

CREATE TABLE app_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(15),
    password_hash TEXT NOT NULL,
    status BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. DESIGNATIONS
-- ============================================

CREATE TABLE designations (
    id SERIAL PRIMARY KEY,
    designation_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    default_salary DECIMAL(10,2),
    uniform_required BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. EMPLOYEES
-- ============================================

CREATE TABLE employees (
    id SERIAL PRIMARY KEY,

    employee_code VARCHAR(30) UNIQUE NOT NULL,

    designation_id INT NOT NULL,

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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_designation
        FOREIGN KEY(designation_id)
        REFERENCES designations(id)
);

-- ============================================
-- 4. LOCATIONS / SITES
-- ============================================

CREATE TABLE locations (
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

-- ============================================
-- 5. EMPLOYEE ASSIGNMENTS
-- ============================================

CREATE TABLE employee_assignments (

    id SERIAL PRIMARY KEY,

    employee_id INT NOT NULL,

    location_id INT NOT NULL,

    shift VARCHAR(50),

    start_date DATE NOT NULL,

    end_date DATE,

    status VARCHAR(20) DEFAULT 'Active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_assignment_employee
        FOREIGN KEY(employee_id)
        REFERENCES employees(id),

    CONSTRAINT fk_assignment_location
        FOREIGN KEY(location_id)
        REFERENCES locations(id)
);

-- ============================================
-- 6. ATTENDANCE
-- ============================================

CREATE TABLE attendance (

    id SERIAL PRIMARY KEY,

    employee_id INT NOT NULL,

    location_id INT,

    attendance_date DATE NOT NULL,

    check_in TIME,

    check_out TIME,

    status VARCHAR(20) NOT NULL,

    remarks TEXT,

    marked_by INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_attendance_employee
        FOREIGN KEY(employee_id)
        REFERENCES employees(id),

    CONSTRAINT fk_attendance_location
        FOREIGN KEY(location_id)
        REFERENCES locations(id),

    CONSTRAINT fk_marked_by
        FOREIGN KEY(marked_by)
        REFERENCES app_users(id)
);

-- ============================================
-- 7. PAYMENTS
-- ============================================

CREATE TABLE payments (

    id SERIAL PRIMARY KEY,

    employee_id INT NOT NULL,

    payment_month INT NOT NULL,

    payment_year INT NOT NULL,

    amount DECIMAL(10,2) NOT NULL,

    payment_date DATE,

    payment_mode VARCHAR(50),

    transaction_reference VARCHAR(200),

    payment_proof TEXT,

    remarks TEXT,

    created_by INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_payment_employee
        FOREIGN KEY(employee_id)
        REFERENCES employees(id),

    CONSTRAINT fk_payment_created_by
        FOREIGN KEY(created_by)
        REFERENCES app_users(id)
);

-- ============================================
-- 8. EMPLOYEE DOCUMENTS
-- ============================================

CREATE TABLE employee_documents (

    id SERIAL PRIMARY KEY,

    employee_id INT NOT NULL,

    document_type VARCHAR(100),

    document_number VARCHAR(100),

    document_file TEXT,

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_document_employee
        FOREIGN KEY(employee_id)
        REFERENCES employees(id)
);

-- ============================================
-- 9. UNIFORM ISSUES
-- ============================================

CREATE TABLE uniform_issues (

    id SERIAL PRIMARY KEY,

    employee_id INT NOT NULL,

    issued_date DATE NOT NULL,

    issued_by INT,

    uniform_size VARCHAR(20),

    remarks TEXT,

    returned BOOLEAN DEFAULT FALSE,

    returned_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_uniform_employee
        FOREIGN KEY(employee_id)
        REFERENCES employees(id),

    CONSTRAINT fk_uniform_issued_by
        FOREIGN KEY(issued_by)
        REFERENCES app_users(id)
);

-- ============================================
-- SAMPLE DESIGNATIONS
-- ============================================

INSERT INTO designations
(designation_name, default_salary, uniform_required)
VALUES
('Security Guard',18000,TRUE),
('Gunman',25000,TRUE),
('Supervisor',30000,TRUE),
('Housekeeping',16000,FALSE);
