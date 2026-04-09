const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// We'll replace the loop inside rawTemplateData
const targetStart = 'for (const { template, latestCompletion, lastDate } of rawTemplateData) {';
const targetEnd = 'if (inProgress || dueStatus.status === \'due\') {';

// We want to find the block between these two and replace the logicalDate and historicalMissed logic
const startIndex = content.indexOf(targetStart);
const endIndex = content.indexOf(targetEnd);

if (startIndex !== -1 && endIndex !== -1) {
    const loopPrefix = content.slice(0, startIndex + targetStart.length);
    const loopSuffix = content.slice(endIndex);
    
    const newLoopContent = `
            const dueStatus = isDue(
                template.frequency, lastDate,
                template.start_time, template.end_time,
                latestCompletion?.completed_at,
                template.started_at
            );

            // ── Accurate Logical Date Logic ───────────────────────────────────
            const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
            const [sh, sm] = (template.start_time || '00:00').slice(0, 5).split(':').map(Number);
            const [eh, em] = (template.end_time || '23:59').slice(0, 5).split(':').map(Number);
            const isOvernight = (eh * 60 + em) <= (sh * 60 + sm);

            let currentShiftStart = new Date(liveNow.getFullYear(), liveNow.getMonth(), liveNow.getDate(), sh, sm, 0, 0);
            if (isOvernight && nowMins < (eh * 60 + em)) {
                currentShiftStart = new Date(currentShiftStart.getTime() - 24 * 3600000);
            }
            const actualLogicalDate = currentShiftStart.toLocaleDateString('en-CA');

            // ── Slot Matching Logic ───────────────────────────────────────────
            const isHourly = /^every_\\d+_hours?$/.test(template.frequency);
            const currentSlot = computeCurrentSlotStart(template.frequency, template.start_time, liveNow, template.end_time);
            const slotMatch = (c: any) => {
                if (c.template_id !== template.id) return false;
                if (!isHourly) {
                    if (template.frequency === 'daily' && template.start_time && template.end_time) {
                        return c.completion_date === actualLogicalDate && new Date(c.completed_at || c.created_at).getTime() >= currentShiftStart.getTime();
                    }
                    return c.completion_date === liveNow.toISOString().slice(0, 10);
                }
                if (!currentSlot) return false;
                if (c.slot_time) return c.slot_time.slice(0, 5) === currentSlot;
                return getCompletionSlot(c.created_at, template.frequency, template.start_time)?.startsWith(currentSlot) ?? false;
            };

            const inProgress = completions.find((c: any) => c.status === 'in_progress' && slotMatch(c));
            const slotCompleted = completions.find((c: any) => c.status === 'completed' && slotMatch(c));

            const templateWithMeta = { 
                ...template, 
                dueLabel: dueStatus.label, 
                inProgressId: inProgress?.id || null, 
                slotCompletedId: slotCompleted?.id || null 
            };

            // HISTORICAL MISSED CHECK: "Yesterday" is ActualLogicalDate - 1 day
            if (template.frequency === 'daily' && template.start_time && template.end_time) {
                const yShiftStart = new Date(currentShiftStart.getTime() - 24 * 3600000);
                const yLogicalDate = yShiftStart.toLocaleDateString('en-CA');
                
                const yDone = completions.find(c => c.template_id === template.id && c.completion_date === yLogicalDate && c.status === 'completed');
                const yInProgress = completions.find(c => c.template_id === template.id && c.completion_date === yLogicalDate && c.status === 'in_progress');
                
                if (!yDone) {
                    const yMissedMeta = {
                        ...template,
                        dueLabel: 'Missed Yesterday',
                        inProgressId: yInProgress?.id || null,
                        historicalDate: yLogicalDate,
                        isHistorical: true
                    };
                    missed.push(yMissedMeta);
                }
            }
`;
    content = loopPrefix + newLoopContent + loopSuffix;
    console.log('Successfully refactored SOPCompletionHistory useMemo loop');
} else {
    console.error('Target loop structure not found');
    process.exit(1);
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated successfully');
