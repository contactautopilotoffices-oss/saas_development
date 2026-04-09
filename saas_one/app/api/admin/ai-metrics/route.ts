/**
 * GET /api/admin/ai-metrics
 * AI classification metrics for the Master Admin dashboard.
 * Returns confidence scores, zone distributions, and classification accuracy stats.
 * Auth: Master Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/admin/ai-metrics
 *
 * Aggregates LLM usage, cost, and performance metrics over a configurable period.
 *
 * Queries ticket_classification_logs and llm_health_metrics for the last N days
 * (default 7, configurable via ?days= query param). Computes total invocations,
 * rule-only vs LLM call breakdown, average latency, token counts, and estimated
 * cost using Groq llama-3.3-70b-versatile pricing ($0.59/M input, $0.79/M output).
 * Returns per-day usage breakdown and raw health history.
 *
 * Auth: Supabase session + is_master_admin flag must be true.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user is master admin using admin client to bypass RLS
        const { createAdminClient } = await import('@/frontend/utils/supabase/admin');
        const adminClient = createAdminClient();
        const { data: profile } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .single();

        if (!profile?.is_master_admin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const days = parseInt(searchParams.get('days') || '7');

        // 1. Fetch classification logs for the period
        const { data: logs, error: logsError } = await supabase
            .from('ticket_classification_logs')
            .select('*')
            .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: true });

        if (logsError) throw logsError;

        // 2. Fetch health metrics
        const { data: health, error: healthError } = await supabase
            .from('llm_health_metrics')
            .select('*')
            .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
            .order('timestamp', { ascending: true });

        if (healthError) throw healthError;

        // Aggregation Logic
        const stats = {
            total_invocations: logs?.length || 0,
            llm_invocations: logs?.filter(l => l.llm_used).length || 0,
            rule_only: logs?.filter(l => !l.llm_used).length || 0,
            avg_latency: logs?.filter(l => l.llm_latency_ms).reduce((acc, l) => acc + l.llm_latency_ms, 0) / (logs?.filter(l => l.llm_latency_ms).length || 1),
            total_tokens: logs?.reduce((acc, l) => acc + (l.total_tokens || 0), 0) || 0,
            prompt_tokens: logs?.reduce((acc, l) => acc + (l.prompt_tokens || 0), 0) || 0,
            completion_tokens: logs?.reduce((acc, l) => acc + (l.completion_tokens || 0), 0) || 0,
            estimated_cost_usd: 0,
        };

        // Groq Pricing for llama-3.3-70b-versatile:
        // Input: $0.59 / 1M tokens
        // Output: $0.79 / 1M tokens
        stats.estimated_cost_usd = (stats.prompt_tokens / 1_000_000) * 0.59 + (stats.completion_tokens / 1_000_000) * 0.79;

        // Daily usage breakdown
        const dailyUsage: Record<string, any> = {};
        logs?.forEach(log => {
            const date = new Date(log.created_at).toISOString().split('T')[0];
            if (!dailyUsage[date]) {
                dailyUsage[date] = { date, calls: 0, tokens: 0, cost: 0 };
            }
            dailyUsage[date].calls += 1;
            if (log.llm_used) {
                dailyUsage[date].tokens += (log.total_tokens || 0);
                dailyUsage[date].cost += ((log.prompt_tokens || 0) / 1_000_000 * 0.59) + ((log.completion_tokens || 0) / 1_000_000 * 0.79);
            }
        });

        return NextResponse.json({
            stats,
            daily_usage: Object.values(dailyUsage),
            health_history: health || []
        });

    } catch (error) {
        console.error('[AI Metrics API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
