-- ============================================================
-- PPM + AMC Migration
-- Run this in the Supabase SQL editor
-- ============================================================

-- Add completion proof columns to ppm_schedules
ALTER TABLE ppm_schedules
    ADD COLUMN IF NOT EXISTS completion_photos text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS completion_doc_url text,
    ADD COLUMN IF NOT EXISTS invoice_url text;

-- Create AMC contracts table
CREATE TABLE IF NOT EXISTS amc_contracts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL,
    property_id uuid,
    system_name text NOT NULL,
    vendor_name text NOT NULL,
    vendor_contact text,
    contract_start_date date NOT NULL,
    contract_end_date date NOT NULL,
    contract_value numeric,
    payment_terms text CHECK (payment_terms IN ('monthly', 'quarterly', 'annual', 'one_time')),
    scope_of_work text,
    notes text,
    status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'expiring_soon', 'renewed')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create AMC documents table
CREATE TABLE IF NOT EXISTS amc_documents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id uuid NOT NULL REFERENCES amc_contracts(id) ON DELETE CASCADE,
    doc_type text NOT NULL CHECK (doc_type IN ('contract', 'invoice', 'renewal', 'certificate')),
    file_url text NOT NULL,
    file_name text NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE amc_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role bypasses these)
CREATE POLICY "org_members_can_view_amc" ON amc_contracts
    FOR SELECT USING (true);

CREATE POLICY "org_members_can_view_amc_docs" ON amc_documents
    FOR SELECT USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_amc_contracts_org_id ON amc_contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_property_id ON amc_contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_end_date ON amc_contracts(contract_end_date);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_status ON amc_contracts(status);
CREATE INDEX IF NOT EXISTS idx_amc_documents_contract_id ON amc_documents(contract_id);
