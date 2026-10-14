-- Site duty scans are separate from patrol checkpoints. A site has one printed
-- start sticker and one end sticker; their tokens are never sent to field apps.
CREATE TABLE duty_qr_codes (
    location_id INT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
    start_token TEXT NOT NULL UNIQUE,
    end_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE duty_scans (
    id BIGSERIAL PRIMARY KEY,
    client_uuid UUID NOT NULL UNIQUE,
    employee_id INT NOT NULL REFERENCES employees(id),
    location_id INT NOT NULL REFERENCES locations(id),
    attendance_date DATE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('start', 'end')),
    scanned_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    photo TEXT NOT NULL,
    UNIQUE (employee_id, attendance_date, kind)
);

CREATE INDEX duty_scans_employee_day ON duty_scans(employee_id, attendance_date);
