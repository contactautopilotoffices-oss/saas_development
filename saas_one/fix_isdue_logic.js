const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target isDue logic for daily
const target1 = 'const isDoneInCurrentWindow = last.getTime() >= currentWindowStart.getTime();';
const lastDateCheck = "const logicalDate = currentWindowStart.toLocaleDateString('en-CA');";
const replacement1 = `const logicalDate = currentWindowStart.toLocaleDateString('en-CA');\n            const isDoneInCurrentWindow = lastCompletionDate === logicalDate && last.getTime() >= currentWindowStart.getTime();`;

// Also fix the generic daily logic (without time window)
const target2 = 'const isSameDay = today.getTime() === lastDate.getTime();';
const replacement2 = 'const isSameDay = lastCompletionDate === today.toLocaleDateString(\'en-CA\');';

if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    console.log('Successfully updated target1');
}

if (content.includes(target2)) {
    content = content.replace(target2, replacement2);
    console.log('Successfully updated target2');
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated successfully');
