-- Add missing updated_at column to vendor_daily_revenue
ALTER TABLE public.vendor_daily_revenue ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure proper permissions
GRANT ALL ON public.vendor_daily_revenue TO authenticated;
GRANT ALL ON public.vendor_daily_revenue TO service_role;
