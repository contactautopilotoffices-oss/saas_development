const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Refactor isDue to accept baseDate ────────────────────────────────────
const isDueSearch = `export function isDue(
    frequency: string,
    lastCompletionDate: string | null,
    startTime?: string | null,
    endTime?: string | null,
    lastCompletedAt?: string | null,   // actual TIMESTAMPTZ of last completed run
    startedAt?: string | null,         // when is_running was turned ON (for first-day slot offset)
): { due: boolean; label: string; status: 'due' | 'missed' | 'completed' | 'upcoming' | '' } {`;

const isDueReplacement = `export function isDue(
    frequency: string,
    lastCompletionDate: string | null,
    startTime?: string | null,
    endTime?: string | null,
    lastCompletedAt?: string | null,
    startedAt?: string | null,
    baseDate?: Date
): { due: boolean; label: string; status: 'due' | 'missed' | 'completed' | 'upcoming' | '' } {`;

if (content.includes(isDueSearch)) {
    content = content.replace(isDueSearch, isDueReplacement);
    // Replace const now = new Date(); with now = baseDate || new Date();
    content = content.replace(/const now = new Date\(\);/g, 'const now = baseDate || new Date();');
}

// ── 2. Add selectedDate state ───────────────────────────────────────────────
const stateSearch = `const [activeFilter, setActiveFilter] = useState<'all' | 'due' | 'missed' | 'completed'>('all');`;
const stateReplacement = `const [activeFilter, setActiveFilter] = useState<'all' | 'due' | 'missed' | 'completed'>('all');
    const [selectedDate, setSelectedDate] = useState(liveNow.toLocaleDateString('en-CA'));
    const isToday = selectedDate === liveNow.toLocaleDateString('en-CA');`;

if (content.includes(stateSearch)) {
    content = content.replace(stateSearch, stateReplacement);
}

// ── 3. Update useMemo to use selectedDate ──────────────────────────────────
const useMemoRegex = /const filterToday = useMemo\(\(\) => \{[\s\S]*?rawTemplateData[\s\S]*?\}\, \[rawTemplateData, completions, liveNow\]\)\;/;
const useMemoReplacement = `const filterToday = useMemo(() => {
        const due: any[] = [];
        const completed: any[] = [];
        const missed: any[] = [];
        const upcoming: any[] = [];

        // Effective date for calculations
        const [y, m, d] = selectedDate.split('-').map(Number);
        const refDate = isToday ? liveNow : new Date(y, m - 1, d, 23, 59, 59);

        for (const { template, latestCompletion, lastDate } of rawTemplateData) {
            const dueStatus = isDue(
                template.frequency, lastDate,
                template.start_time, template.end_time,
                latestCompletion?.completed_at,
                template.started_at,
                refDate
            );

            // Accurate Logical Date Logic (based on refDate)
            const nowMins = refDate.getHours() * 60 + refDate.getMinutes();
            const [sh, sm] = (template.start_time || '00:00').slice(0, 5).split(':').map(Number);
            const [eh, em] = (template.end_time || '23:59').slice(0, 5).split(':').map(Number);
            const isOvernight = (eh * 60 + em) <= (sh * 60 + sm);

            let currentShiftStart = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), sh, sm, 0, 0);
            if (isOvernight && nowMins < (eh * 60 + em)) {
                currentShiftStart = new Date(currentShiftStart.getTime() - 24 * 3600000);
            }
            const actualLogicalDate = currentShiftStart.toLocaleDateString('en-CA');

            const isHourly = /^every_\\d+_hours?$/.test(template.frequency);
            const currentSlot = computeCurrentSlotStart(template.frequency, template.start_time, refDate, template.end_time);
            
            const slotMatch = (c: any) => {
                if (c.template_id !== template.id) return false;
                if (!isHourly) {
                    if (template.frequency === 'daily' && template.start_time && template.end_time) {
                        return c.completion_date === actualLogicalDate;
                    }
                    return c.completion_date === actualLogicalDate;
                }
                return c.completion_date === actualLogicalDate && (c.slot_time || '').startsWith(currentSlot || '00:00');
            };

            const slotCompleted = completions.find((c: any) => c.status === 'completed' && slotMatch(c));
            const inProgress = isToday ? completions.find((c: any) => c.status === 'in_progress' && slotMatch(c)) : null;

            const templateWithMeta = { 
                ...template, 
                dueLabel: dueStatus.label, 
                inProgressId: inProgress?.id || null, 
                slotCompletedId: slotCompleted?.id || null 
            };

            // HISTORICAL MISSED CHECK: For current day, we look back to yesterday.
            // For past day, "Missed" is simply anything that belongs to that day but isn't done.
            if (slotCompleted) {
                completed.push({ ...templateWithMeta, completedAt: slotCompleted.completed_at });
            } else if (isToday && (inProgress || dueStatus.status === 'due')) {
                due.push(templateWithMeta);
            } else if (actualLogicalDate === selectedDate) {
                // If we are looking at a specific day and it's not done -> it's missed for that day
                missed.push({ ...templateWithMeta, historicalDate: actualLogicalDate });
            } else if (isToday && dueStatus.status === 'upcoming') {
                upcoming.push(templateWithMeta);
            }

            // ADD MISSED YESTERDAY logic only when on "Today" view
            if (isToday && template.frequency === 'daily' && template.start_time && template.end_time) {
                const yShiftStart = new Date(currentShiftStart.getTime() - 24 * 3600000);
                const yLogicalDate = yShiftStart.toLocaleDateString('en-CA');
                const yDone = completions.find(c => c.template_id === template.id && c.completion_date === yLogicalDate && c.status === 'completed');
                if (!yDone) {
                    missed.push({ ...template, dueLabel: 'Missed Yesterday', historicalDate: yLogicalDate, isHistorical: true });
                }
            }
        }

        return {
            dueTemplates: due,
            upcomingTemplates: upcoming,
            missedTemplates: missed,
            completedToday: completed,
            stats: {
                total: completions.length,
                completed: completed.length,
                pending: due.length,
                due: due.length,
                overdue: 0
            }
        };
    }, [rawTemplateData, completions, liveNow, selectedDate]);`;

if (useMemoRegex.test(content)) {
    content = content.replace(useMemoRegex, useMemoReplacement);
    console.log('Successfully refactored useMemo for date filter');
}

// ── 4. Add Date Picker UI ───────────────────────────────────────────────────
const uiSearch = `<div className="flex items-center justify-center py-2">`;
const uiReplacement = `<div className="flex items-center gap-3 px-1 mb-2">
                <div className="flex-1 bg-slate-50 p-1 rounded-2xl border border-slate-200 flex items-center gap-2 px-3">
                    <Calendar size={14} className="text-slate-400" />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-slate-600 focus:outline-none w-full"
                    />
                </div>
                {selectedDate !== liveNow.toLocaleDateString('en-CA') && (
                    <button
                        onClick={() => setSelectedDate(liveNow.toLocaleDateString('en-CA'))}
                        className="p-2 bg-slate-900 text-white rounded-xl shadow-sm hover:bg-primary transition-all"
                    >
                        <History size={14} />
                    </button>
                )}
            </div>
            <div className="flex items-center justify-center py-2">`;

if (content.includes(uiSearch)) {
    content = content.replace(uiSearch, uiReplacement);
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated');
