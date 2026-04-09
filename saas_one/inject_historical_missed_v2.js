const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /const templateWithMeta = \{[\s\S]*?\};/;
const extension = `const templateWithMeta = { 
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
            }`;

if (regex.test(content)) {
    content = content.replace(regex, extension);
    console.log('Successfully injected historical missed via regex');
} else {
    console.error('Regex match failed.');
    process.exit(1);
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated successfully');
