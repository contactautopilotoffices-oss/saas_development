/**
 * MST shift management API.
 * Handles check-in/check-out for MST staff, tracking shift logs and resolver stats.
 * POST: Check in or check out | GET: Get current shift status.
 * Auth: MST/Staff role.
 */
import { createClient } from '@/frontend/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { action, propertyId } = await req.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'check-in') {
      // 1. Create shift log
      const { error: logError } = await supabase
        .from('shift_logs')
        .insert({
          user_id: user.id,
          property_id: propertyId,
          status: 'active',
          check_in_at: new Date().toISOString()
        });

      if (logError) throw logError;

      // 2. Update resolver_stats status
      const { error: statsError } = await supabase
        .from('resolver_stats')
        .update({ is_checked_in: true })
        .eq('user_id', user.id)
        .eq('property_id', propertyId);

      if (statsError) throw statsError;

      return NextResponse.json({ isCheckedIn: true, message: 'Shift started successfully' });
    }

    if (action === 'check-out') {
      // 1. Close active shift logs
      const { error: logError } = await supabase
        .from('shift_logs')
        .update({
          status: 'completed',
          check_out_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('property_id', propertyId)
        .eq('status', 'active');

      if (logError) throw logError;

      // 2. Update resolver_stats status
      const { error: statsError } = await supabase
        .from('resolver_stats')
        .update({ is_checked_in: false })
        .eq('user_id', user.id)
        .eq('property_id', propertyId);

      if (statsError) throw statsError;

      return NextResponse.json({ isCheckedIn: false, message: 'Shift ended successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('Shift Management Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');

    console.log(`[Shift API] GET status check for property: ${propertyId}`);

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[Shift API] Auth Error:', authError.message);
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    if (!user || !propertyId) {
      console.warn('[Shift API] Missing user or propertyId');
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    console.log(`[Shift API] Fetching stats for user: ${user.id}`);

    const { data: statsList, error } = await supabase
      .from('resolver_stats')
      .select('is_checked_in')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .limit(1);

    if (error) {
      console.error('[Shift API] Database error:', error.message);
      throw error;
    }

    const data = statsList && statsList.length > 0 ? statsList[0] : null;
    console.log(`[Shift API] Found data:`, data);

    return NextResponse.json({ isCheckedIn: data?.is_checked_in || false });

  } catch (error: any) {
    console.error('[Shift API] GET Exception:', error);
    return NextResponse.json({
      isCheckedIn: false,
      error: error.message || 'Internal Server Error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
