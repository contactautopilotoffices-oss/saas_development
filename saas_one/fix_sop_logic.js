const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target the slotMatch daily logic
const targetOld = `if (template.frequency === 'daily' && template.start_time && template.end_time) {
                        const [sh] = template.start_time.slice(0, 5).split(':').map(Number);
                        const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
                        const [eh] = template.end_time.slice(0, 5).split(':').map(Number);
                        const isOvernight = eh <= sh;
                        
                        let currentShiftStart = new Date(liveNow.getFullYear(), liveNow.getMonth(), liveNow.getDate(), sh, 0, 0, 0);
                        if (isOvernight && nowMins < eh * 60) {
                            currentShiftStart = new Date(currentShiftStart.getTime() - 24 * 3600000);
                        }
                        return new Date(c.completed_at || c.created_at).getTime() >= currentShiftStart.getTime();
                    }`;

const replacement = `if (template.frequency === 'daily' && template.start_time && template.end_time) {
                        const [sh] = template.start_time.slice(0, 5).split(':').map(Number);
                        const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
                        const [eh] = template.end_time.slice(0, 5).split(':').map(Number);
                        const isOvernight = eh <= sh;
                        
                        let currentShiftStart = new Date(liveNow.getFullYear(), liveNow.getMonth(), liveNow.getDate(), sh, 0, 0, 0);
                        if (isOvernight && nowMins < eh * 60) {
                            currentShiftStart = new Date(currentShiftStart.getTime() - 24 * 3600000);
                        }
                        
                        // FIX: A completion only matches the "Current Shift" if its 'completion_date'
                        // matches the logical date of currentShiftStart.
                        const logicalDate = currentShiftStart.toLocaleDateString('en-CA'); // YYYY-MM-DD
                        return c.completion_date === logicalDate && new Date(c.completed_at || c.created_at).getTime() >= currentShiftStart.getTime();
                    }`;

if (content.includes(targetOld)) {
    const newContent = content.replace(targetOld, replacement);
    // Also update the isDue helper to be smarter about 'last' vs 'intended' date
    // (Search for the isDoneInCurrentWindow logic)
    const isDueTarget = `const isDoneInCurrentWindow = last.getTime() >= currentWindowStart.getTime();`;
    const isDueReplacement = `// FIX: Only counts as done in current window if it matches the logical date
            const logicalDate = currentWindowStart.toLocaleDateString('en-CA');
            const isDoneInCurrentWindow = lastCompletionDate === logicalDate && last.getTime() >= currentWindowStart.getTime();`;
            
    const finalContent = newContent.replace(isDueTarget, isDueReplacement);
    
    fs.writeFileSync(filePath, finalContent);
    console.log('Successfully updated SOPCompletionHistory.tsx logic');
} else {
    console.error('Could not find target logic. Indentation might be different.');
    // Fallback: simple replace on the core check line
    const coreLine = 'return new Date(c.completed_at || c.created_at).getTime() >= currentShiftStart.getTime();';
    if (content.includes(coreLine)) {
         const newContent = content.replace(coreLine, `const logicalDate = currentShiftStart.toLocaleDateString('en-CA');\n                        return c.completion_date === logicalDate && new Date(c.completed_at || c.created_at).getTime() >= currentShiftStart.getTime();`);
         fs.writeFileSync(filePath, newContent);
         console.log('Successfully updated via coreLine fallback');
    } else {
        process.exit(1);
    }
}
