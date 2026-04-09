const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace isDue signature
const regex = /export function isDue\([\s\S]*?\)\: \{[\s\S]*?\} \{/;
const replacement = `export function isDue(
    frequency: string,
    lastCompletionDate: string | null,
    startTime?: string | null,
    endTime?: string | null,
    lastCompletedAt?: string | null,
    startedAt?: string | null,
    baseDate?: Date
): { due: boolean; label: string; status: 'due' | 'missed' | 'completed' | 'upcoming' | '' } {`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    console.log('Successfully refactored isDue signature');
} else {
    console.error('Target isDue signature not found');
    process.exit(1);
}

// Ensure const now = new Date(); in isDue is also updated
content = content.replace(/const now = new Date\(\);/g, 'const now = baseDate || new Date();');

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated');
