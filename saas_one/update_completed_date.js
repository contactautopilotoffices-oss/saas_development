const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target line: completed.push({ ...templateWithMeta, dueLabel: slotCompleted ? 'Done' : dueStatus.label });
const targetLine = "completed.push({ ...templateWithMeta, dueLabel: slotCompleted ? 'Done' : dueStatus.label });";
const replacement = `completed.push({ 
                    ...templateWithMeta, 
                    dueLabel: slotCompleted ? 'Done' : dueStatus.label,
                    completedAt: slotCompleted?.completed_at || latestCompletion?.completed_at || lastDate 
                });`;

if (content.includes(targetLine)) {
    const newContent = content.replace(targetLine, replacement);
    fs.writeFileSync(filePath, newContent);
    console.log('Successfully updated line 523');
} else {
    console.error('Could not find the target line. Checking for alternative spelling...');
    // Try without leading spaces
    const targetTrimmed = targetLine.trim();
    const lines = content.split('\n');
    let found = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(targetTrimmed)) {
            const indent = lines[i].match(/^\s*/)[0];
            lines[i] = indent + replacement.replace(/\n\s*/g, '\n' + indent);
            fs.writeFileSync(filePath, lines.join('\n'));
            console.log('Successfully updated line with manual indentation');
            found = true;
            break;
        }
    }
    if (!found) {
        console.error('Final fallback failed.');
        process.exit(1);
    }
}
