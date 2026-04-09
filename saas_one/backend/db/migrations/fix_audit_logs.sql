-- ================================================
-- FIX: Create audit_logs table and re-apply triggers
-- ================================================
-- This ensures the audit_logs table exists and re-creates
-- organization triggers that depend on it.
--
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Create audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigserial PRIMARY KEY,
  event_by uuid,
  event_at timestamptz NOT NULL DEFAULT now(),
  object_type text NOT NULL,
  object_id text,
  action text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb
);

-- 2. Ensure RLS is enabled on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Policy for audit_logs (Only master admins can read all, 
-- or users can see their own actions if we add user_id)
-- For now, simple master admin read policy
CREATE POLICY audit_logs_read_policy ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) 
    = 'ranganathanlohitaksha@gmail.com'
  );

-- 4. Re-create the organization triggers as they might have failed
-- (Copying relevant parts from organization_triggers.sql)

CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (event_by, object_type, object_id, action, payload)
  VALUES (
    auth.uid(),
    'organization',
    NEW.id::text,
    'INSERT',
    jsonb_build_object(
      'name', NEW.name,
      'slug', NEW.slug,
      'created_at', NEW.created_at
    )
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organization();

CREATE OR REPLACE FUNCTION public.handle_organization_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (event_by, object_type, object_id, action, payload)
  VALUES (
    auth.uid(),
    'organization',
    NEW.id::text,
    'UPDATE',
    jsonb_build_object(
      'old_name', OLD.name,
      'new_name', NEW.name,
      'is_deleted', NEW.is_deleted,
      'updated_at', now()
    )
  );
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_updated ON public.organizations;
CREATE TRIGGER on_organization_updated
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_organization_update();

CREATE OR REPLACE FUNCTION public.handle_organization_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
    INSERT INTO public.audit_logs (event_by, object_type, object_id, action, payload)
    VALUES (
      auth.uid(),
      'organization',
      NEW.id::text,
      'SOFT_DELETE',
      jsonb_build_object(
        'name', NEW.name,
        'deleted_at', now(),
        'can_restore_until', now() + interval '24 hours'
      )
    );
    NEW.deleted_at = now();
  END IF;
  
  IF NEW.is_deleted = false AND OLD.is_deleted = true THEN
    INSERT INTO public.audit_logs (event_by, object_type, object_id, action, payload)
    VALUES (
      auth.uid(),
      'organization',
      NEW.id::text,
      'RESTORE',
      jsonb_build_object(
        'name', NEW.name,
        'restored_at', now()
      )
    );
    NEW.deleted_at = null;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_soft_delete ON public.organizations;
CREATE TRIGGER on_organization_soft_delete
  BEFORE UPDATE OF is_deleted ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_organization_soft_delete();

-- RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
