const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Use regex to find the useMemo block
const regex = /const \{ dueTemplates, upcomingTemplates, missedTemplates, completedToday, stats \} = useMemo\(\(\) => \{[\s\S]*?rawTemplateData, completions, liveNow\]\)\;/;

const replacement = `const { dueTemplates, upcomingTemplates, missedTemplates, completedToday, stats } = useMemo(() => {
        const due: any[] = [];
        const upcoming: any[] = [];
        const missed: any[] = [];
        const completed: any[] = [];

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

            if (slotCompleted) {
                completed.push({ 
                    ...templateWithMeta, 
                    dueStatus: (slotCompleted.completion_date !== actualLogicalDate) ? 'late' : 'on-time',
                    completedAt: slotCompleted.completed_at 
                });
            } else if (isToday && (inProgress || dueStatus.status === 'due')) {
                due.push(templateWithMeta);
            } else if (actualLogicalDate === selectedDate) {
                missed.push({ ...templateWithMeta, historicalDate: actualLogicalDate });
            } else if (isToday && dueStatus.status === 'upcoming') {
                upcoming.push({ ...templateWithMeta, upcomingLabel: dueStatus.label, progressPct: 0 });
            }

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

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    console.log('Successfully updated useMemo filter logic');
} else {
    // If exact match fails, try a slightly broader search for the useMemo deps
    console.error('Target useMemo block not found');
    process.exit(1);
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated');
