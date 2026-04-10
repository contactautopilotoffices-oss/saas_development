-- ================================================
-- Organization Creation Triggers
-- ================================================
-- This migration adds triggers for organization lifecycle events
-- Run this SQL in Supabase SQL Editor
-- ================================================

-- 1. Function to log organization creation to audit_logs
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log the creation event
  INSERT INTO public.audit_logs (event_by, object_type, object_id, action, payload)
  VALUES (
    auth.uid(),
    'organization',
    NEW.id::text,
    'INSERT',
    jsonb_build_object(
      'name', NEW.name,
      'code', COALESCE(NEW.code, NEW.slug),
      'created_at', NEW.created_at
    )
  );
  
  RETURN NEW;
END;
$$;

-- 2. Create trigger for new organizations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_organization_created') THEN
    CREATE TRIGGER on_organization_created
      AFTER INSERT ON public.organizations
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_organization();
    RAISE NOTICE 'Trigger on_organization_created created successfully';
  ELSE
    RAISE NOTICE 'Trigger on_organization_created already exists';
  END IF;
END$$;

-- 3. Function to handle organization updates (track changes)
CREATE OR REPLACE FUNCTION public.handle_organization_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log the update event
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
  
  -- Update the updated_at timestamp
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$;
-- 4. Create trigger for organization updates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_organization_updated') THEN
    CREATE TRIGGER on_organization_updated
      BEFORE UPDATE ON public.organizations
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_organization_update();
    RAISE NOTICE 'Trigger on_organization_updated created successfully';
  ELSE
    RAISE NOTICE 'Trigger on_organization_updated already exists';
  END IF;
END$$;

-- 5. Function to handle soft delete (cooling period)
CREATE OR REPLACE FUNCTION public.handle_organization_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when is_deleted changes from false to true
  IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
    -- Log the soft delete event
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
    
    -- Set deleted_at timestamp
    NEW.deleted_at = now();
  END IF;
  
  -- Handle restore (is_deleted changes from true to false)
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
    
    -- Clear deleted_at
    NEW.deleted_at = null;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 6. Create trigger for soft delete handling
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_organization_soft_delete') THEN
    CREATE TRIGGER on_organization_soft_delete
      BEFORE UPDATE OF is_deleted ON public.organizations
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_organization_soft_delete();
    RAISE NOTICE 'Trigger on_organization_soft_delete created successfully';
  ELSE
    RAISE NOTICE 'Trigger on_organization_soft_delete already exists';
  END IF;
END$$;

-- ================================================
-- Verification Queries
-- ================================================
-- Check triggers exist:
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'on_organization%';
--
-- Check audit logs:
-- SELECT * FROM audit_logs WHERE object_type = 'organization' ORDER BY event_at DESC LIMIT 10;
