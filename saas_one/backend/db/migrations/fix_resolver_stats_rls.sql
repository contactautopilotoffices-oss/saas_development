-- =========================================================
-- FIX: RESOLVER STATS POLICIES
-- =========================================================

-- 1. Enable RLS
ALTER TABLE public.resolver_stats ENABLE ROW LEVEL SECURITY;

-- 2. Select Policy: Users can see their own stats
DROP POLICY IF EXISTS "resolver_stats_select_own" ON public.resolver_stats;
CREATE POLICY "resolver_stats_select_own" ON public.resolver_stats 
FOR SELECT USING (auth.uid() = user_id);

-- 3. Select Policy: Property Admins can see all stats in their property
DROP POLICY IF EXISTS "resolver_stats_select_admin" ON public.resolver_stats;
CREATE POLICY "resolver_stats_select_admin" ON public.resolver_stats 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.property_memberships pm 
    WHERE pm.user_id = auth.uid() 
    AND pm.property_id = resolver_stats.property_id
    AND pm.role IN ('property_admin', 'manager')
  )
);

-- 4. Update Policy: Users can update their own status (for check-in)
DROP POLICY IF EXISTS "resolver_stats_update_own" ON public.resolver_stats;
CREATE POLICY "resolver_stats_update_own" ON public.resolver_stats 
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Master Admin bypass
DROP POLICY IF EXISTS "resolver_stats_master_admin" ON public.resolver_stats;
CREATE POLICY "resolver_stats_master_admin" ON public.resolver_stats 
FOR ALL USING (public.is_master_admin_v2());

NOTIFY pgrst, 'reload schema';
