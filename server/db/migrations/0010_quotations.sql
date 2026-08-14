-- Quotations are versioned document snapshots. Company branding, calculation
-- inputs and canonical calculated values are stored with the document so a
-- quotation does not silently change when settings or rates change later.

CREATE SEQUENCE IF NOT EXISTS quotation_number_seq START WITH 1;

CREATE TABLE quotations (
    id SERIAL PRIMARY KEY,
    quotation_number VARCHAR(30) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft'
        CHECK (status IN ('Draft', 'Issued')),
    quotation_date DATE NOT NULL,
    valid_until DATE,
    title VARCHAR(120) NOT NULL,
    client_name VARCHAR(150) NOT NULL,
    client_address TEXT,
    client_gst_number VARCHAR(30),
    client_contact_name VARCHAR(120),
    client_phone VARCHAR(30),
    client_email VARCHAR(200),
    services JSONB NOT NULL CHECK (jsonb_typeof(services) = 'array'),
    cost_heads JSONB NOT NULL CHECK (jsonb_typeof(cost_heads) = 'array'),
    calculation JSONB NOT NULL CHECK (jsonb_typeof(calculation) = 'object'),
    company_snapshot JSONB NOT NULL CHECK (jsonb_typeof(company_snapshot) = 'object'),
    terms TEXT,
    created_by INT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (valid_until IS NULL OR valid_until >= quotation_date),
    CHECK ((status = 'Issued') = (issued_at IS NOT NULL))
);

CREATE INDEX idx_quotations_date ON quotations(quotation_date DESC, id DESC);
CREATE INDEX idx_quotations_client ON quotations(client_name);

CREATE OR REPLACE FUNCTION reject_issued_quotation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'Issued' THEN
        RAISE EXCEPTION 'Issued quotations are immutable; create a revision instead'
            USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER quotations_reject_issued_mutation
BEFORE UPDATE OR DELETE ON quotations
FOR EACH ROW EXECUTE FUNCTION reject_issued_quotation_change();

INSERT INTO app_settings (key, value) VALUES
    ('company_email', ''),
    ('company_gst_number', ''),
    ('company_tagline', '')
ON CONFLICT (key) DO NOTHING;
