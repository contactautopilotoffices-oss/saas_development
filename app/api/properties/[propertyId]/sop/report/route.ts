import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/properties/[propertyId]/sop/report?templateId=...&date=YYYY-MM-DD
 *
 * Generates a CSV report in the matrix format: Items × Time Slots.
 * Each cell shows ✓ (done by whom) or ✗ (missed).
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('templateId');
    const date = searchParams.get('date'); // YYYY-MM-DD

    if (!date) {
        return NextResponse.json({ error: 'date is required' }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    try {
        // ── 1. Determine which templates to include ─────────────────────────
        let targetTemplates: any[] = [];
        if (templateId) {
            const { data: tpl, error: tplErr } = await supabaseAdmin
                .from('sop_templates')
                .select('id, title, frequency, start_time, end_time, category')
                .eq('id', templateId)
                .eq('property_id', propertyId)
                .single();
            if (tplErr || !tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
            targetTemplates = [tpl];
        } else {
            const { data: tpls, error: tplsErr } = await supabaseAdmin
                .from('sop_templates')
                .select('id, title, frequency, start_time, end_time, category')
                .eq('property_id', propertyId)
                .eq('is_active', true);
            if (tplsErr) throw tplsErr;
            targetTemplates = tpls || [];
        }

        if (targetTemplates.length === 0) {
            return NextResponse.json({ error: 'No active templates found' }, { status: 404 });
        }

        // ── 2. Fetch shared data ────────────────────────────────────────────
        const { data: property } = await supabaseAdmin
            .from('properties')
            .select('name')
            .eq('id', propertyId)
            .single();

        const csvLines: string[] = [];
        const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
        });

        // Global Header
        csvLines.push(`CONSOLIDATED CHECKLIST REPORT - ${escCsv(property?.name || 'N/A')}`);
        csvLines.push(`Date:,${escCsv(dateFormatted)}`);
        csvLines.push('');

        // ── 3. Loop through templates and generate each section ──────────────
        for (const template of targetTemplates) {
            // Fetch items
            const { data: items } = await supabaseAdmin
                .from('sop_checklist_items')
                .select('id, title, order_index, section_title')
                .eq('template_id', template.id)
                .order('section_title', { ascending: true, nullsFirst: true })
                .order('order_index', { ascending: true });
            
            const checklistItems = items || [];

            // Compute slots
            const hourlyMatch = template.frequency?.match(/^every_(\d+)_hours?$/);
            const slots: { label: string; slotTime: string }[] = [];
            if (hourlyMatch && template.start_time && template.end_time) {
                const intervalH = parseInt(hourlyMatch[1], 10);
                const [sH, sM] = template.start_time.slice(0, 5).split(':').map(Number);
                const [eH, eM] = template.end_time.slice(0, 5).split(':').map(Number);
                const startMins = sH * 60 + sM;
                const endMins = eH * 60 + eM;
                for (let t = startMins; t + intervalH * 60 <= endMins; t += intervalH * 60) {
                    const h = Math.floor(t / 60), m = t % 60;
                    const slotEnd = t + intervalH * 60;
                    const eHr = Math.floor(slotEnd / 60), eMn = slotEnd % 60;
                    slots.push({ label: `${fmt12h(h, m)} - ${fmt12h(eHr, eMn)}`, slotTime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
                }
            } else {
                slots.push({ label: frequencyLabel(template.frequency), slotTime: '' });
            }

            // Fetch completions
            const { data: completions } = await supabaseAdmin
                .from('sop_completions')
                .select(`
                    id, slot_time, status, completed_by,
                    user:users!completed_by(full_name),
                    items:sop_completion_items(checklist_item_id, is_checked, value)
                `)
                .eq('template_id', template.id)
                .eq('completion_date', date);
            
            const allCompletions = completions || [];

            // Add Template Sub-header
            csvLines.push('================================================================================');
            csvLines.push(`${escCsv(template.title.toUpperCase())} (${escCsv(template.category || 'General')})`);
            if (template.start_time && template.end_time) {
                csvLines.push(`Window:,${fmt12hStr(template.start_time)} - ${fmt12hStr(template.end_time)}`);
            }
            csvLines.push('');

            // Table headers
            const headerCols = ['Sl No', 'Checklist Item', ...slots.map(s => s.label)];
            csvLines.push(headerCols.map(escCsv).join(','));

            // Build Matrix & Fill Rows
            let currentSection: string | null = null;
            for (let i = 0; i < checklistItems.length; i++) {
                const item = checklistItems[i];
                if (item.section_title !== currentSection) {
                    currentSection = item.section_title;
                    csvLines.push([ '', escCsv(`>> ${(currentSection || 'General').toUpperCase()} <<`), ...slots.map(() => '') ].join(','));
                }

                const cols: string[] = [ String(i + 1), escCsv(item.title) ];
                for (let s = 0; s < slots.length; s++) {
                    const slot = slots[s];
                    const completion = allCompletions.find((c: any) => slot.slotTime ? c.slot_time?.startsWith(slot.slotTime) : true);
                    if (completion && completion.status === 'completed') {
                        const ci = (completion as any).items?.find((xi: any) => xi.checklist_item_id === item.id);
                        const mark = ci?.value ? `✓ ${ci.value}` : (ci?.is_checked ? '✓' : '✗');
                        const userObj = (completion as any).user;
                        const fullName = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;
                        cols.push(escCsv(fullName ? `${mark} (${fullName})` : mark));
                    } else {
                        cols.push('✗');
                    }
                }
                csvLines.push(cols.join(','));
            }

            // Footer row for each template
            const byRow = ['', 'Completed By'];
            for (const slot of slots) {
                const completion = allCompletions.find((c: any) => slot.slotTime ? c.slot_time?.startsWith(slot.slotTime) : true);
                const userName = (completion as any)?.user 
                    ? (Array.isArray((completion as any).user) ? (completion as any).user[0]?.full_name : (completion as any).user.full_name)
                    : '-';
                byRow.push(escCsv(userName || '-'));
            }
            csvLines.push(byRow.join(','));
            csvLines.push('');
            csvLines.push(''); // double space between templates
        }

        const csv = '\uFEFF' + csvLines.join('\r\n');
        const filename = templateId ? `Checklist_${targetTemplates[0].title.replace(/[^a-zA-Z0-9]/g, '')}_${date}.csv` : `Consolidated_Checklists_${date}.csv`;

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        console.error('[SOP Report] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function frequencyLabel(f: string): string {
    if (f === 'daily') return 'Daily';
    if (f === 'weekly') return 'Weekly';
    if (f === 'monthly') return 'Monthly';
    if (f === 'on_demand') return 'On Demand';
    if (f.startsWith('every_')) return 'Hourly';
    return f;
}

function fmt12h(h: number, m: number): string {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmt12hStr(timeStr: string): string {
    const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
    return fmt12h(h, m);
}

function escCsv(val: string): string {
    if (!val) return '';
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}

