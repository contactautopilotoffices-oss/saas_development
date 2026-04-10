-- =========================================================
-- AUTOPILOT | BASE SCHEMA (MODE A)
-- SAFE • IDEMPOTENT • SUPABASE-READY
-- This file defines the core structural integrity.
-- =========================================================

-- ---------------------------------------------------------
-- 0. REQUIRED EXTENSIONS
-- ---------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------
-- 1. BASE TABLES (Minimal Definitions)
-- ---------------------------------------------------------

-- Organizations: Core Identity
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  code text UNIQUE NOT NULL, -- Unified identifier (was 'slug')
  created_at timestamptz DEFAULT now()
);

-- Properties: Core Identity
CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Users: Core Profile
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Organization Memberships: Join Table
CREATE TABLE IF NOT EXISTS organization_memberships (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

-- Property Memberships: Join Table
CREATE TABLE IF NOT EXISTS property_memberships (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

-- Property Activities: Event Ledger
CREATE TABLE IF NOT EXISTS property_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------
-- 2. CORE INDEXES
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_org_code ON organizations(code);
CREATE INDEX IF NOT EXISTS idx_prop_code ON properties(code);
CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
