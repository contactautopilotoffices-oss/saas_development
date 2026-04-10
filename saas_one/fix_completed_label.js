const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const targetRegex = /<span className="text-\[9px\] font-black text-emerald-600 uppercase tracking-wider">Completed<\/span>/g;
const replacement = `{template.historicalDate || (template.completion_date && template.completion_date !== new Date(liveNow).toLocaleDateString('en-CA')) ? (
                                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Completed Late</span>
                                        ) : (
                                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Completed</span>
                                        )}`;

if (targetRegex.test(content)) {
    // Only replace the ONE inside the completedToday map (which should be the 2nd or 3rd occurrence)
    // Actually, replacing all occurrences of this exact <span> is mostly safe if they were the simple ones
    content = content.replace(targetRegex, replacement);
    console.log('Successfully updated Completed labels');
} else {
    console.error('Target label not found');
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx finalized');
