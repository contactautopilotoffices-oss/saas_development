-- =========================================================
-- AUTOPILOT | SCHEMA EVOLUTION (MODE B)
-- SAFE • ADDITIVE • SUPABASE-READY
-- Designed for safe re-runs without breaking data.
-- =========================================================


-- ---------------------------------------------------------
-- 2. ENUMS (Guarded DO blocks)
-- ---------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('master_admin', 'org_super_admin', 'property_admin', 'staff', 'mst', 'tenant', 'vendor');
  ELSE
    -- Safe add for existing type
    BEGIN
      ALTER TYPE app_role ADD VALUE 'mst';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END;
    BEGIN
      ALTER TYPE app_role ADD VALUE 'vendor';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------
-- 3. COLUMN ADDITIONS (ADD COLUMN IF NOT EXISTS)
-- ---------------------------------------------------------

-- Organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_secret text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS available_modules text[] DEFAULT ARRAY['ticketing','viewer','analytics'];
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Memberships
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS role app_role;
ALTER TABLE organization_memberships ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE property_memberships ADD COLUMN IF NOT EXISTS role app_role;
ALTER TABLE property_memberships ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Activities
ALTER TABLE property_activities ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
ALTER TABLE property_activities ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE property_activities ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';

-- ---------------------------------------------------------
-- 4. SECURITY (RLS & Policies)
-- ---------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_activities ENABLE ROW LEVEL SECURITY;

-- Organization Policies
DROP POLICY IF EXISTS org_read_policy ON organizations;
CREATE POLICY org_read_policy ON organizations FOR SELECT USING (
  EXISTS(SELECT 1 FROM organization_memberships om WHERE om.user_id = auth.uid() AND om.organization_id = organizations.id)
  OR EXISTS(SELECT 1 FROM organization_memberships om WHERE om.user_id = auth.uid() AND om.role = 'master_admin')
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS master_admin_org_all ON organizations;
CREATE POLICY master_admin_org_all ON organizations FOR ALL USING (
  EXISTS(SELECT 1 FROM organization_memberships om WHERE om.user_id = auth.uid() AND om.role = 'master_admin')
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- Property Policies
DROP POLICY IF EXISTS prop_read_policy ON properties;
CREATE POLICY prop_read_policy ON properties FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = properties.id)
  OR EXISTS(SELECT 1 FROM organization_memberships om WHERE om.user_id = auth.uid() AND om.organization_id = properties.organization_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS master_admin_prop_all ON properties;
CREATE POLICY master_admin_prop_all ON properties FOR ALL USING (
  EXISTS(SELECT 1 FROM organization_memberships om WHERE om.user_id = auth.uid() AND om.role = 'master_admin')
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- Activity Policies
DROP POLICY IF EXISTS strict_property_policy ON property_activities;
CREATE POLICY strict_property_policy ON property_activities FOR ALL USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = property_activities.property_id AND pm.is_active)
);

DROP POLICY IF EXISTS org_super_policy ON property_activities;
CREATE POLICY org_super_policy ON property_activities FOR ALL USING (
  EXISTS(SELECT 1 FROM organization_memberships om WHERE om.user_id = auth.uid() AND om.organization_id = property_activities.organization_id AND om.role = 'org_super_admin')
);

DROP POLICY IF EXISTS master_admin_policy ON property_activities;
CREATE POLICY master_admin_policy ON property_activities FOR ALL USING (
  EXISTS(SELECT 1 FROM organization_memberships om WHERE om.user_id = auth.uid() AND om.role = 'master_admin')
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- Users Table Policies (CRITICAL - was missing!)
DROP POLICY IF EXISTS users_read_own ON users;
CREATE POLICY users_read_own ON users FOR SELECT USING (
  -- Users can read their own profile
  auth.uid() = id
  -- Users in same property can see each other
  OR EXISTS(
    SELECT 1 FROM property_memberships pm1, property_memberships pm2 
    WHERE pm1.user_id = auth.uid() 
    AND pm2.user_id = users.id 
    AND pm1.property_id = pm2.property_id 
    AND pm1.is_active AND pm2.is_active
  )
  -- Users in same org can see each other
  OR EXISTS(
    SELECT 1 FROM organization_memberships om1, organization_memberships om2 
    WHERE om1.user_id = auth.uid() 
    AND om2.user_id = users.id 
    AND om1.organization_id = om2.organization_id
  )
  -- Super admin bypass
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users FOR UPDATE USING (
  auth.uid() = id
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (
  auth.uid() = id
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- ---------------------------------------------------------
-- 5. PERFORMANCE (Indexes)
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_prop_members_user_prop ON property_memberships(user_id, property_id);
CREATE INDEX IF NOT EXISTS idx_prop_activity_scope ON property_activities(organization_id, property_id);
CREATE INDEX IF NOT EXISTS idx_org_code_evolve ON organizations(code);

-- ---------------------------------------------------------
-- 6. DIESEL GENERATOR MANAGEMENT (Property-Scoped)
-- ---------------------------------------------------------

-- Generators Table
CREATE TABLE IF NOT EXISTS generators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,                      -- e.g., "DG-1", "DG-2"
  make text,                               -- e.g., "Cummins", "CAT", "Kirloskar"
  capacity_kva integer,                    -- e.g., 500, 750, 125
  tank_capacity_litres integer DEFAULT 1000,
  fuel_efficiency_lphr numeric DEFAULT 15, -- Litres per hour (for alerts)
  status text DEFAULT 'active',            -- 'active' | 'standby' | 'maintenance'
  last_maintenance_date date,              -- Last service date
  next_maintenance_date date,              -- Scheduled next service
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Diesel Readings Table (Daily Logs)
CREATE TABLE IF NOT EXISTS diesel_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  generator_id uuid NOT NULL REFERENCES generators(id) ON DELETE CASCADE,
  reading_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_hours numeric NOT NULL,          -- Hour meter opening reading
  diesel_added_litres numeric DEFAULT 0,   -- Litres added during the day
  closing_hours numeric NOT NULL,          -- Hour meter closing reading
  computed_run_hours numeric GENERATED ALWAYS AS (closing_hours - opening_hours) STORED,
  computed_consumed_litres numeric,        -- Staff-provided or auto-calculated
  notes text,
  alert_status text DEFAULT 'normal',      -- 'normal' | 'warning' | 'critical'
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(generator_id, reading_date)       -- One entry per generator per day
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_generators_property ON generators(property_id);
CREATE INDEX IF NOT EXISTS idx_diesel_readings_property ON diesel_readings(property_id);
CREATE INDEX IF NOT EXISTS idx_diesel_readings_date ON diesel_readings(reading_date);
CREATE INDEX IF NOT EXISTS idx_diesel_readings_generator ON diesel_readings(generator_id);

-- RLS for Generators
ALTER TABLE generators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generators_property_read ON generators;
CREATE POLICY generators_property_read ON generators FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = generators.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = generators.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS generators_admin_write ON generators;
CREATE POLICY generators_admin_write ON generators FOR ALL USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = generators.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = generators.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- RLS for Diesel Readings
ALTER TABLE diesel_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diesel_readings_property_read ON diesel_readings;
CREATE POLICY diesel_readings_property_read ON diesel_readings FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = diesel_readings.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = diesel_readings.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS diesel_readings_staff_insert ON diesel_readings;
CREATE POLICY diesel_readings_staff_insert ON diesel_readings FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = diesel_readings.property_id AND pm.is_active)
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS diesel_readings_admin_update ON diesel_readings;
CREATE POLICY diesel_readings_admin_update ON diesel_readings FOR UPDATE USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = diesel_readings.property_id AND pm.role IN ('property_admin', 'staff'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = diesel_readings.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- ---------------------------------------------------------
-- 7. FOOD VENDOR PAYMENT MODULE (Property-Scoped)
-- ---------------------------------------------------------

-- Vendors Table
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  shop_name text NOT NULL,
  owner_name text,
  commission_rate numeric DEFAULT 10,           -- Percentage
  payment_gateway_enabled boolean DEFAULT false,
  status text DEFAULT 'active',                 -- 'active' | 'inactive' | 'suspended'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id)                  -- One vendor per user per property
);

-- Vendor Daily Revenue
CREATE TABLE IF NOT EXISTS vendor_daily_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  revenue_amount numeric NOT NULL DEFAULT 0,
  revenue_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(vendor_id, revenue_date)                 -- One entry per vendor per day
);

-- Commission Cycles (15-day periods)
CREATE TABLE IF NOT EXISTS commission_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL,                -- 1, 2, 3, etc.
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  total_revenue numeric DEFAULT 0,
  commission_rate numeric NOT NULL,             -- Locked at cycle creation
  commission_due numeric DEFAULT 0,
  status text DEFAULT 'in_progress',            -- 'in_progress' | 'payable' | 'paid' | 'overdue'
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(vendor_id, cycle_start)
);

-- Vendor Payments
CREATE TABLE IF NOT EXISTS vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES commission_cycles(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  gateway_txn_id text,
  gateway_name text,                            -- 'razorpay' | 'stripe' | 'manual'
  status text DEFAULT 'pending',                -- 'pending' | 'success' | 'failed'
  receipt_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Export Logs (Audit Trail)
CREATE TABLE IF NOT EXISTS export_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  user_role text,
  export_type text,                             -- 'vendor_revenue' | 'diesel' | 'commission'
  date_range_start date,
  date_range_end date,
  property_scope uuid[],                        -- Array of property IDs exported
  file_format text DEFAULT 'csv',               -- 'csv' | 'xlsx'
  created_at timestamptz DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_vendors_property ON vendors(property_id);
CREATE INDEX IF NOT EXISTS idx_vendors_user ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_revenue_vendor ON vendor_daily_revenue(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_revenue_date ON vendor_daily_revenue(revenue_date);
CREATE INDEX IF NOT EXISTS idx_commission_cycles_vendor ON commission_cycles(vendor_id);
CREATE INDEX IF NOT EXISTS idx_commission_cycles_status ON commission_cycles(status);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_cycle ON vendor_payments(cycle_id);

-- RLS for Vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendors_property_read ON vendors;
CREATE POLICY vendors_property_read ON vendors FOR SELECT USING (
  user_id = auth.uid()  -- Vendor can see themselves
  OR EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = vendors.property_id AND pm.role IN ('property_admin'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = vendors.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS vendors_admin_write ON vendors;
CREATE POLICY vendors_admin_write ON vendors FOR ALL USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = vendors.property_id AND pm.role IN ('property_admin'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = vendors.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- RLS for Vendor Daily Revenue
ALTER TABLE vendor_daily_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_revenue_read ON vendor_daily_revenue;
CREATE POLICY vendor_revenue_read ON vendor_daily_revenue FOR SELECT USING (
  EXISTS(SELECT 1 FROM vendors v WHERE v.id = vendor_daily_revenue.vendor_id AND v.user_id = auth.uid())
  OR EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = vendor_daily_revenue.property_id AND pm.role IN ('property_admin'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = vendor_daily_revenue.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS vendor_revenue_insert ON vendor_daily_revenue;
CREATE POLICY vendor_revenue_insert ON vendor_daily_revenue FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM vendors v WHERE v.id = vendor_daily_revenue.vendor_id AND v.user_id = auth.uid())
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- RLS for Commission Cycles
ALTER TABLE commission_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_cycles_read ON commission_cycles;
CREATE POLICY commission_cycles_read ON commission_cycles FOR SELECT USING (
  EXISTS(SELECT 1 FROM vendors v WHERE v.id = commission_cycles.vendor_id AND v.user_id = auth.uid())
  OR EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = commission_cycles.property_id AND pm.role IN ('property_admin'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = commission_cycles.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- RLS for Vendor Payments
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_payments_read ON vendor_payments;
CREATE POLICY vendor_payments_read ON vendor_payments FOR SELECT USING (
  EXISTS(SELECT 1 FROM vendors v WHERE v.id = vendor_payments.vendor_id AND v.user_id = auth.uid())
  OR EXISTS(SELECT 1 FROM commission_cycles cc 
            JOIN properties p ON p.id = cc.property_id
            JOIN property_memberships pm ON pm.property_id = p.id
            WHERE cc.id = vendor_payments.cycle_id AND pm.user_id = auth.uid() AND pm.role IN ('property_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- ---------------------------------------------------------
-- 9. VISITOR MANAGEMENT SYSTEM (VMS)
-- ---------------------------------------------------------

-- Visitor Logs Table
CREATE TABLE IF NOT EXISTS visitor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visitor_id text UNIQUE NOT NULL,              -- Format: PROP-VIS-00123
  category varchar(20) NOT NULL,                -- 'visitor' | 'vendor' | 'other'
  name text NOT NULL,
  mobile text,
  coming_from text,
  whom_to_meet text NOT NULL,
  photo_url text,                               -- Supabase Storage URL
  checkin_time timestamptz DEFAULT now(),
  checkout_time timestamptz,
  status varchar(20) DEFAULT 'checked_in',      -- 'checked_in' | 'checked_out'
  created_at timestamptz DEFAULT now()
);

-- VMS Tickets Table (for reporting issues)
CREATE TABLE IF NOT EXISTS vms_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status varchar(20) DEFAULT 'open',            -- 'open' | 'in_progress' | 'resolved'
  reported_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Visitor ID Sequence (property-scoped counter)
CREATE TABLE IF NOT EXISTS visitor_id_counters (
  property_id uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  last_number integer DEFAULT 0
);

-- Function to generate unique visitor ID
CREATE OR REPLACE FUNCTION generate_visitor_id(p_property_id uuid)
RETURNS text AS $$
DECLARE
  v_counter integer;
  v_property_code text;
BEGIN
  -- Get property code
  SELECT code INTO v_property_code FROM properties WHERE id = p_property_id;
  
  -- Increment counter
  INSERT INTO visitor_id_counters (property_id, last_number)
  VALUES (p_property_id, 1)
  ON CONFLICT (property_id) 
  DO UPDATE SET last_number = visitor_id_counters.last_number + 1
  RETURNING last_number INTO v_counter;
  
  -- Return formatted ID
  RETURN UPPER(COALESCE(v_property_code, 'VIS')) || '-' || LPAD(v_counter::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_visitor_logs_property ON visitor_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_org ON visitor_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_status ON visitor_logs(status);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_checkin ON visitor_logs(checkin_time);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_visitor_id ON visitor_logs(visitor_id);
CREATE INDEX IF NOT EXISTS idx_vms_tickets_property ON vms_tickets(property_id);
CREATE INDEX IF NOT EXISTS idx_vms_tickets_status ON vms_tickets(status);

-- RLS for Visitor Logs
ALTER TABLE visitor_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visitor_logs_read ON visitor_logs;
CREATE POLICY visitor_logs_read ON visitor_logs FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = visitor_logs.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = visitor_logs.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS visitor_logs_insert ON visitor_logs;
CREATE POLICY visitor_logs_insert ON visitor_logs FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = visitor_logs.property_id)
  OR true  -- Allow anonymous kiosk access (public insert)
);

DROP POLICY IF EXISTS visitor_logs_update ON visitor_logs;
CREATE POLICY visitor_logs_update ON visitor_logs FOR UPDATE USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = visitor_logs.property_id)
  OR true  -- Allow anonymous kiosk checkout
);

-- RLS for VMS Tickets
ALTER TABLE vms_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vms_tickets_read ON vms_tickets;
CREATE POLICY vms_tickets_read ON vms_tickets FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = vms_tickets.property_id AND pm.role IN ('property_admin'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = vms_tickets.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS vms_tickets_insert ON vms_tickets;
CREATE POLICY vms_tickets_insert ON vms_tickets FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = vms_tickets.property_id)
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- ---------------------------------------------------------
-- 11. REQUEST TICKETING MODULE (Skill-Grouped Auto-Assignment)
-- ---------------------------------------------------------

-- Skill Groups Table (MST Technical, MST Plumbing, Vendor)
CREATE TABLE IF NOT EXISTS skill_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  code text NOT NULL,                           -- 'mst_technical', 'mst_plumbing', 'vendor'
  name text NOT NULL,                           -- 'MST (Technical)', 'MST (Plumbing)', 'Vendor'
  description text,
  is_manual_assign boolean DEFAULT false,       -- Vendor = true (manual escalation)
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, code)
);

-- Issue Categories Table (Maps to Skill Groups)
CREATE TABLE IF NOT EXISTS issue_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  code text NOT NULL,                           -- 'ac_breakdown', 'water_leakage'
  name text NOT NULL,                           -- 'AC Breakdown', 'Water Leakage'
  skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL,
  sla_hours integer DEFAULT 24,                 -- SLA deadline in hours
  priority text DEFAULT 'medium',               -- 'low', 'medium', 'high', 'urgent'
  icon text,                                    -- Optional icon name
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, code)
);

-- Tickets Table (Main Request Table)
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,           -- Auto-generated: TKT-PROP-00001
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES issue_categories(id) ON DELETE SET NULL,
  skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  location text,                                -- Unit/floor/area
  priority text DEFAULT 'medium',               -- 'low', 'medium', 'high', 'urgent'
  status text DEFAULT 'open',                   -- 'open', 'assigned', 'in_progress', 'resolved', 'closed', 'waitlist'
  raised_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  sla_hours integer,                            -- Copied from category at creation
  sla_deadline timestamptz,                     -- Calculated: assigned_at + sla_hours
  sla_started boolean DEFAULT false,            -- SLA only starts on assignment
  sla_breached boolean DEFAULT false,           -- Set true if deadline passed
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Safe column additions for tickets table (if table exists from previous schema)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES issue_categories(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_hours integer;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_deadline timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_started boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_breached boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_notes text;

-- Ticketic v2.0: Enhanced fields for load balancer, SLA management, classification, photos
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS response_sla_hours integer;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_sla_hours integer;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_paused boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_paused_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_pause_reason text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS total_paused_minutes integer DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS confidence_score integer DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS classification_source text DEFAULT 'manual';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_vague boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS photo_before_url text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS photo_after_url text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS work_started_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS floor_number integer;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rating integer;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS secondary_category_code text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS risk_flag text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS llm_reasoning text;

-- Resolver Stats Table (for load balancer scoring)
CREATE TABLE IF NOT EXISTS resolver_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL,
  current_floor integer DEFAULT 1,
  avg_resolution_minutes integer DEFAULT 60,
  total_resolved integer DEFAULT 0,
  is_available boolean DEFAULT true,
  last_ticket_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id, skill_group_id)
);

-- SLA Templates Table (Super Admin customizable)
CREATE TABLE IF NOT EXISTS sla_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  category_code text NOT NULL,
  response_sla_hours integer DEFAULT 1,
  resolution_sla_hours integer DEFAULT 24,
  priority text DEFAULT 'medium',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, category_code)
);

-- Indexes for resolver stats and SLA templates
CREATE INDEX IF NOT EXISTS idx_resolver_stats_user ON resolver_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_resolver_stats_property ON resolver_stats(property_id);
CREATE INDEX IF NOT EXISTS idx_resolver_stats_available ON resolver_stats(is_available);
CREATE INDEX IF NOT EXISTS idx_sla_templates_property ON sla_templates(property_id);
CREATE INDEX IF NOT EXISTS idx_tickets_is_internal ON tickets(is_internal);
CREATE INDEX IF NOT EXISTS idx_tickets_confidence ON tickets(confidence_score);

-- Ticket Comments Table
CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  is_internal boolean DEFAULT false,            -- Internal notes vs public comments
  created_at timestamptz DEFAULT now()
);

-- Ticket Activity Log (Audit Trail)
CREATE TABLE IF NOT EXISTS ticket_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,                         -- 'created', 'assigned', 'status_change', 'comment', etc.
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

-- Ticket Number Counter (per property)
CREATE TABLE IF NOT EXISTS ticket_counters (
  property_id uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  last_number integer DEFAULT 0
);

-- Function to generate unique ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number(p_property_id uuid)
RETURNS text AS $$
DECLARE
  v_counter integer;
  v_property_code text;
BEGIN
  SELECT code INTO v_property_code FROM properties WHERE id = p_property_id;
  
  INSERT INTO ticket_counters (property_id, last_number)
  VALUES (p_property_id, 1)
  ON CONFLICT (property_id) 
  DO UPDATE SET last_number = ticket_counters.last_number + 1
  RETURNING last_number INTO v_counter;
  
  RETURN 'TKT-' || UPPER(COALESCE(v_property_code, 'REQ')) || '-' || LPAD(v_counter::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to find least-loaded resolver using scoring formula
-- Score = (CurrentTasks × 0.6) + (ProximityToIssue × 0.2) + (HistoricalSpeed × 0.2)
-- Ticket is assigned to resolver with LOWEST score
CREATE OR REPLACE FUNCTION find_best_resolver(
  p_property_id uuid,
  p_skill_group_id uuid,
  p_floor_number integer DEFAULT 1
) RETURNS uuid AS $$
DECLARE
  v_resolver_id uuid;
BEGIN
  SELECT rs.user_id INTO v_resolver_id
  FROM resolver_stats rs
  JOIN property_memberships pm ON pm.user_id = rs.user_id AND pm.property_id = rs.property_id
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) as active_count
    FROM tickets
    WHERE property_id = p_property_id 
      AND skill_group_id = p_skill_group_id
      AND status IN ('assigned', 'in_progress')
    GROUP BY assigned_to
  ) t ON t.assigned_to = rs.user_id
  WHERE rs.property_id = p_property_id
    AND (rs.skill_group_id = p_skill_group_id OR rs.skill_group_id IS NULL)
    AND rs.is_available = true
    AND pm.is_active = true
    AND pm.role IN ('staff')
  ORDER BY (
    -- Score = (CurrentTasks × 0.6) + (ProximityToIssue × 0.2) + (HistoricalSpeed × 0.2)
    (COALESCE(t.active_count, 0) * 0.6) +
    (ABS(COALESCE(rs.current_floor, 1) - COALESCE(p_floor_number, 1)) * 0.2) +
    (LEAST(COALESCE(rs.avg_resolution_minutes, 60) / 60.0, 10) * 0.2)
  ) ASC,
  RANDOM()
  LIMIT 1;
  
  RETURN v_resolver_id;
END;
$$ LANGUAGE plpgsql;

-- Legacy function for backward compatibility
CREATE OR REPLACE FUNCTION find_least_loaded_resolver(
  p_property_id uuid,
  p_skill_group_id uuid
) RETURNS uuid AS $$
BEGIN
  RETURN find_best_resolver(p_property_id, p_skill_group_id, 1);
END;
$$ LANGUAGE plpgsql;

-- Function to auto-assign ticket on creation
CREATE OR REPLACE FUNCTION auto_assign_ticket()
RETURNS TRIGGER AS $$
DECLARE
  v_skill_group skill_groups%ROWTYPE;
  v_resolver_id uuid;
BEGIN
  -- Get skill group details
  SELECT * INTO v_skill_group FROM skill_groups WHERE id = NEW.skill_group_id;
  
  -- If manual assignment required (Vendor), put in waitlist
  IF v_skill_group.is_manual_assign THEN
    NEW.status := 'waitlist';
    NEW.sla_started := false;
    RETURN NEW;
  END IF;
  
  -- Find least-loaded resolver
  v_resolver_id := find_least_loaded_resolver(NEW.property_id, NEW.skill_group_id);
  
  IF v_resolver_id IS NOT NULL THEN
    NEW.assigned_to := v_resolver_id;
    NEW.assigned_at := now();
    NEW.status := 'assigned';
    NEW.sla_started := true;
    NEW.sla_deadline := now() + (NEW.sla_hours || ' hours')::interval;
  ELSE
    -- No available resolver, put in waitlist
    NEW.status := 'waitlist';
    NEW.sla_started := false;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-assignment (wrapped in DO block for safe execution)
DO $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_auto_assign_ticket ON tickets;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'skill_group_id') THEN
    CREATE TRIGGER trigger_auto_assign_ticket
      BEFORE INSERT ON tickets
      FOR EACH ROW
      EXECUTE FUNCTION auto_assign_ticket();
  END IF;
END $$;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_property ON tickets(property_id);
CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_skill_group ON tickets(skill_group_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline ON tickets(sla_deadline);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_skill_groups_property ON skill_groups(property_id);
CREATE INDEX IF NOT EXISTS idx_issue_categories_property ON issue_categories(property_id);
CREATE INDEX IF NOT EXISTS idx_issue_categories_skill_group ON issue_categories(skill_group_id);

-- ---------------------------------------------------------
-- 12. CACHE REFRESH
-- ---------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- 13. TICKET RLS POLICIES (Fix for MST/Staff Access)
-- ---------------------------------------------------------
-- Ensure RLS is disabled for debugging/access guarantees as per user request
ALTER TABLE tickets DISABLE ROW LEVEL SECURITY;

-- Note: Policies below are kept for reference but won't trigger if RLS is disabled
-- READ: Allow Property Staff, Admins, and Creators to view tickets
DROP POLICY IF EXISTS tickets_read_all ON tickets;
CREATE POLICY tickets_read_all ON tickets FOR SELECT USING (
  -- 1. Property Admins & Staff (MST)
  EXISTS (
    SELECT 1 FROM property_memberships pm 
    WHERE pm.user_id = auth.uid() 
      AND pm.property_id = tickets.property_id 
      AND pm.role IN ('property_admin', 'staff', 'mst')
      AND pm.is_active = true
  )
  -- 2. Ticket Creator (Tenant)
  OR (tickets.created_by = auth.uid())
  -- 3. Ticket Assignee (MST)
  OR (tickets.assigned_to = auth.uid())
  -- 4. Organization Super Admins
  OR EXISTS (
    SELECT 1 FROM organization_memberships om
    JOIN properties p ON p.organization_id = om.organization_id
    WHERE om.user_id = auth.uid() 
      AND p.id = tickets.property_id 
      AND om.role IN ('master_admin', 'org_super_admin')
  )
);

-- INSERT: Allow authenticated users to create tickets
DROP POLICY IF EXISTS tickets_insert_auth ON tickets;
CREATE POLICY tickets_insert_auth ON tickets FOR INSERT WITH CHECK (
  auth.uid() = created_by
);

-- UPDATE: Allow Staff/Admins to update status/assign, Creators to update details
DROP POLICY IF EXISTS tickets_update_role ON tickets;
CREATE POLICY tickets_update_role ON tickets FOR UPDATE USING (
  -- Staff/Admins
  EXISTS (
    SELECT 1 FROM property_memberships pm 
    WHERE pm.user_id = auth.uid() 
      AND pm.property_id = tickets.property_id 
      AND pm.role IN ('property_admin', 'staff', 'mst')
  )
  -- Or Creator
  OR (tickets.created_by = auth.uid())
);

-- =========================================================
-- END OF FILE — SAFE TO RE-RUN
-- =========================================================
