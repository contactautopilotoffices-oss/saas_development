const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const targetRegex = /<h4 className="font-black text-sm text-slate-900 tracking-tight truncate">\{template\.title\}<\/h4>\s*<span className="px-1\.5 py-0\.5 bg-rose-500 text-white text-\[7px\] font-black uppercase tracking-widest rounded-md mt-0\.5">Missed<\/span>/g;
const replacement = `<h4 className="font-black text-sm text-slate-900 tracking-tight truncate">{template.title}</h4>
                                        <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[7px] font-black uppercase tracking-widest rounded-md mt-0.5">Missed</span>
                                        {template.historicalDate && (
                                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[7px] font-black uppercase tracking-widest rounded-md mt-0.5">
                                                {new Date(template.historicalDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </span>
                                        )}`;

if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    console.log('Successfully added date badges to missed shifts');
} else {
    console.error('Target UI structure not found');
    process.exit(1);
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated');
