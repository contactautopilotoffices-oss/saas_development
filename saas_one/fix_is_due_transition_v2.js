const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /\/\/\s*If\s*we\s*are\s*past\s*the\s*window\s*and\s*not\s*done[\s\S]*?const\s*isPastWindow\s*=\s*isOvernight\s*\?\s*\(nowMins\s*>=\s*emins\s*&&\s*nowMins\s*<\s*smins\)\s*:\s*\(nowMins\s*>=\s*emins\)\;\s*if\s*\(isPastWindow\)\s*return\s*\{\s*due\s*:\s*true,\s*label\s*:\s*['"]Missed['"],\s*status\s*:\s*['"]missed['"]\s*\};/;

const replacement = `            // If we haven't reached the start of the current logical window yet (e.g. 8 AM vs 10 PM)
            if (nowMins < smins) return { due: false, label: \`Starts at \${fmt12h(startTime)}\`, status: 'upcoming' };

            // If we are past the window and not done
            const isPastWindow = isOvernight ? (nowMins >= emins && nowMins < smins) : (nowMins >= emins);
            if (isPastWindow) return { due: true, label: 'Missed', status: 'missed' };`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    console.log('Successfully refined isDue shift transition logic via regex');
} else {
    console.error('Regex match failed.');
    process.exit(1);
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated successfully');
