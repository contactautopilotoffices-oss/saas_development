-- test_schema.db.sql
-- Hybrid schema: organizations + projects (org-owned) + user_profiles + user_documents (user-owned)
-- Includes RLS policies, helper functions, indexes, audit logs, and realtime trigger examples.
-- Run as a role that can create objects (typically the DB owner / service_role).

-- 1. Create supporting extension (if available)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping pgcrypto creation: %', SQLERRM;
    END;
  END IF;
END$$;

-- 2. Core tables

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL,
  username text UNIQUE,
  full_name text,
  avatar_url text,
  user_photo_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text,
  is_private boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  event_by uuid,
  event_at timestamptz NOT NULL DEFAULT now(),
  object_type text NOT NULL,
  object_id text,
  action text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb
);


-- 3. Helper functions (SECURITY DEFINER)

CREATE OR REPLACE FUNCTION get_user_organization_ids()
RETURNS TABLE (org_id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION get_user_organization_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_organization_ids() TO authenticated;


CREATE OR REPLACE FUNCTION current_user_is_org_admin(org_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_uuid
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE EXECUTE ON FUNCTION current_user_is_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_user_is_org_admin(uuid) TO authenticated;


-- 4. Enable RLS and policies

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select_policy ON organizations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = organizations.id AND om.user_id = (SELECT auth.uid()))
  );

CREATE POLICY organizations_insert_policy ON organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY organizations_update_policy ON organizations
  FOR UPDATE
  TO authenticated
  USING (current_user_is_org_admin(organizations.id))
  WITH CHECK (current_user_is_org_admin(organizations.id));

CREATE POLICY organizations_delete_policy ON organizations
  FOR DELETE
  TO authenticated
  USING (false);


ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_policy ON projects
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT org_id FROM get_user_organization_ids())
    OR is_public = true
  );

CREATE POLICY projects_insert_policy ON projects
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT org_id FROM get_user_organization_ids()));

CREATE POLICY projects_update_policy ON projects
  FOR UPDATE
  TO authenticated
  USING (organization_id IN (SELECT org_id FROM get_user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT org_id FROM get_user_organization_ids()));

CREATE POLICY projects_delete_policy ON projects
  FOR DELETE
  TO authenticated
  USING (current_user_is_org_admin(projects.organization_id));


ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_members_select_policy ON organization_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR organization_id IN (SELECT org_id FROM get_user_organization_ids())
  );

CREATE POLICY organization_members_insert_policy ON organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR current_user_is_org_admin(organization_id)
  );

CREATE POLICY organization_members_update_policy ON organization_members
  FOR UPDATE
  TO authenticated
  USING (current_user_is_org_admin(organization_members.organization_id))
  WITH CHECK (current_user_is_org_admin(organization_members.organization_id));

CREATE POLICY organization_members_delete_policy ON organization_members
  FOR DELETE
  TO authenticated
  USING (current_user_is_org_admin(organization_members.organization_id));


ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select_policy ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

CREATE POLICY user_profiles_insert_policy ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY user_profiles_update_policy ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY user_profiles_delete_policy ON user_profiles
  FOR DELETE
  TO authenticated
  USING (false);


ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_documents_select_policy ON user_documents
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR is_private = false
  );

CREATE POLICY user_documents_insert_policy ON user_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_documents_update_policy ON user_documents
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_documents_delete_policy ON user_documents
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


ALTER TABLE project_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_resources_select_policy ON project_resources
  FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT org_id FROM get_user_organization_ids())));

CREATE POLICY project_resources_insert_policy ON project_resources
  FOR INSERT
  TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT org_id FROM get_user_organization_ids())));

CREATE POLICY project_resources_update_policy ON project_resources
  FOR UPDATE
  TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT org_id FROM get_user_organization_ids())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT org_id FROM get_user_organization_ids())));

CREATE POLICY project_resources_delete_policy ON project_resources
  FOR DELETE
  TO authenticated
  USING (current_user_is_org_admin((SELECT organization_id FROM projects WHERE projects.id = project_resources.project_id)));


ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_policy ON audit_logs
  FOR SELECT
  TO authenticated
  USING (false);

CREATE POLICY audit_logs_insert_policy ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);


-- 5. Indexes recommended for RLS performance

CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_resources_project_id ON project_resources(project_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id ON user_profiles(auth_user_id);


-- 6. Audit trigger helper

CREATE OR REPLACE FUNCTION audit_log_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_logs(event_by, object_type, object_id, action, payload)
  VALUES (
    COALESCE(NULLIF(current_setting('jwt.claims.sub', true), '' )::uuid, auth.uid()),
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    TG_OP,
    to_jsonb(COALESCE(NEW, OLD))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION audit_log_trigger_fn() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_log_trigger_fn() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'projects_audit_trigger') THEN
    CREATE TRIGGER projects_audit_trigger
      AFTER INSERT OR UPDATE OR DELETE ON projects
      FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_documents_audit_trigger') THEN
    CREATE TRIGGER user_documents_audit_trigger
      AFTER INSERT OR UPDATE OR DELETE ON user_documents
      FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'project_resources_audit_trigger') THEN
    CREATE TRIGGER project_resources_audit_trigger
      AFTER INSERT OR UPDATE OR DELETE ON project_resources
      FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();
  END IF;
END$$;


-- 7. Realtime broadcast trigger example

CREATE OR REPLACE FUNCTION broadcast_project_resources_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'project:' || NEW.project_id::text || ':resources',
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION broadcast_project_resources_changes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION broadcast_project_resources_changes() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'project_resources_broadcast_trigger') THEN
    CREATE TRIGGER project_resources_broadcast_trigger
      AFTER INSERT OR UPDATE OR DELETE ON project_resources
      FOR EACH ROW EXECUTE FUNCTION broadcast_project_resources_changes();
  END IF;
END$$;


-- 8. Optional seed (commented out)
-- INSERT INTO organizations (id, slug, name) VALUES ('11111111-1111-1111-1111-111111111111','example-org','Example Organization');
-- INSERT INTO organization_members (organization_id, user_id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner');


-- Final notes:
-- - service_role bypasses RLS. Use it for migrations and imports.
-- - auth.uid() requires a valid JWT; requests without a JWT see auth.uid() as NULL.
-- - Test policies with different users to confirm intended access.