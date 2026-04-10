const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target the isDue function block for Daily shifts
const targetStart = 'if (isWithinTimeWindow(nowMins, startTime, endTime)) return { due: true, label: \'Due now\', status: \'due\' };';
const targetEnd = 'return { due: false, label: `Starts at ${fmt12h(startTime)}`, status: \'upcoming\' };';

// We want to find the middle part where isPastWindow is calculated
const searchPart = `            // If we are past the window and not done
            const isPastWindow = isOvernight ? (nowMins >= emins && nowMins < smins) : (nowMins >= emins);
            if (isPastWindow) return { due: true, label: 'Missed', status: 'missed' };`;

const replacementPart = `            // If we haven't reached the start of the current logical window yet (e.g. 8 AM vs 10 PM)
            if (nowMins < smins) return { due: false, label: \`Starts at \${fmt12h(startTime)}\`, status: 'upcoming' };

            // If we are past the window and not done
            const isPastWindow = isOvernight ? (nowMins >= emins && nowMins < smins) : (nowMins >= emins);
            if (isPastWindow) return { due: true, label: 'Missed', status: 'missed' };`;

if (content.includes(searchPart)) {
    content = content.replace(searchPart, replacementPart);
    console.log('Successfully refined isDue shift transition logic');
} else {
    // Try a slightly different target if whitespace changed
    console.error('Target logic not found');
    process.exit(1);
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated successfully');
