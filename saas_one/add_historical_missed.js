const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// We need to update the useMemo logic to look back at past days for missed templates
// Currently it only iterates over applicableTemplates and calls isDue for "now"

// I'll insert a block before line 518 to handle "Historical Missed" for Daily checklists
const pivot = 'const templateWithMeta = {';
if (!content.includes(pivot)) {
    console.error('Pivot not found');
    process.exit(1);
}

// Optimization: We'll modify the loop to also check the previous day's shift
const newLoopLogic = `
            const templateWithMeta = { 
                ...template, 
                dueLabel: dueStatus.label, 
                inProgressId: inProgress?.id || null, 
                slotCompletedId: slotCompleted?.id || null 
            };

            // HISTORICAL MISSED CHECK: Check if yesterday's shift was missed
            if (template.frequency === 'daily' && template.start_time && template.end_time) {
                const yesterday = new Date(liveNow.getTime() - 24 * 3600000);
                const [sh, sm] = template.start_time.slice(0, 5).split(':').map(Number);
                const yWindowStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), sh, sm, 0, 0);
                const yLogicalDate = yWindowStart.toLocaleDateString('en-CA');
                
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

// I'll use a more targeted replacement
const targetPart = `            const templateWithMeta = { 
                ...template, 
                dueLabel: dueStatus.label, 
                inProgressId: inProgress?.id || null, 
                slotCompletedId: slotCompleted?.id || null 
            };`;

if (content.includes(targetPart)) {
    content = content.replace(targetPart, newLoopLogic.trim());
    console.log('Successfully added historical missed logic');
} else {
    console.error('Target part not found for replacement');
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated successfully');
