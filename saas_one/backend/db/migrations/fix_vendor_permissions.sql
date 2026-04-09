-- Fix permissions for Vendor access and User table
BEGIN;

-- 1. Ensure 'authenticated' role has permissions on public tables (Validation for 500 Error)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_daily_revenue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_payments TO authenticated;

-- 2. Add Vendor policies for self-management (Onboarding & Dashboard)

-- Allow users to create their own vendor record (Onboarding)
DROP POLICY IF EXISTS "vendors_insert_own" ON public.vendors;
CREATE POLICY "vendors_insert_own" ON public.vendors FOR INSERT WITH CHECK (
    user_id = auth.uid()
);

-- Allow vendors to update their own record
DROP POLICY IF EXISTS "vendors_update_own" ON public.vendors;
CREATE POLICY "vendors_update_own" ON public.vendors FOR UPDATE USING (
    user_id = auth.uid()
);

-- 3. Fix Vendor Daily Revenue policies (Dashboard)

-- Allow insertion if you own the vendor record
DROP POLICY IF EXISTS "vendor_revenue_insert_own" ON public.vendor_daily_revenue;
CREATE POLICY "vendor_revenue_insert_own" ON public.vendor_daily_revenue FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.vendors v 
        WHERE v.id = vendor_id 
        AND v.user_id = auth.uid()
    )
);

-- Allow viewing if you own the vendor record
DROP POLICY IF EXISTS "vendor_revenue_select_own" ON public.vendor_daily_revenue;
CREATE POLICY "vendor_revenue_select_own" ON public.vendor_daily_revenue FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.vendors v 
        WHERE v.id = vendor_id 
        AND v.user_id = auth.uid()
    )
);

-- Allow vendors to update their own daily revenue
DROP POLICY IF EXISTS "vendor_revenue_update_own" ON public.vendor_daily_revenue;
CREATE POLICY "vendor_revenue_update_own" ON public.vendor_daily_revenue FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.vendors v 
        WHERE v.id = vendor_id 
        AND v.user_id = auth.uid()
    )
);

-- 4. Fix Commission Cycles policies (Dashboard)

DROP POLICY IF EXISTS "commission_cycles_select_own" ON public.commission_cycles;
CREATE POLICY "commission_cycles_select_own" ON public.commission_cycles FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.vendors v 
        WHERE v.id = vendor_id 
        AND v.user_id = auth.uid()
    )
);

-- 5. Safe add of 'vendor' enum if missing (Redundant but safe)
DO $$
BEGIN
  ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'vendor';
EXCEPTION
  WHEN duplicate_object THEN null; -- Postgres < 12 fallback
  WHEN OTHERS THEN null;
END $$;

COMMIT;
