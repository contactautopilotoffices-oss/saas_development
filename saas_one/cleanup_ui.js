const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Use regex to find the action buttons block
// This matches from "{/* Action buttons */}" until the div closure before the next section
const regex = /\{\/\* Action buttons \*\/\}[\s\S]+?<\/div>[\s\S]+?(?=\{\/\* 2\. Missed)/;

const newActionRow = `
                                 {/* Simplified Action Row */}
                                 <div className="flex items-center justify-between mt-3 px-1">
                                     <div className="flex items-center gap-2">
                                         {!isCompleted && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onSelectTemplate(completion.template_id, completion.property_id, completion.id); }}
                                                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all shadow-sm"
                                            >
                                                <Play size={10} />
                                                {isExpired ? 'Resume Late' : isInProgress ? 'Resume' : 'Start'}
                                            </button>
                                         )}
                                         {isCompleted && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const dateStr = new Date(completion.completion_date).toISOString().split('T')[0];
                                                    window.open(\`/api/properties/\${propertyId}/sop/report?templateId=\${completion.template_id}&date=\${dateStr}\`, '_blank');
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-white hover:text-primary border border-slate-100 transition-all font-inter"
                                            >
                                                <Download size={10} />
                                                Report
                                            </button>
                                         )}
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <span className={\`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm \${isExpired ? 'bg-rose-500 text-white' : completion.is_late ? 'bg-amber-100 text-amber-700' : isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}\`}>
                                            {isExpired ? 'Missed' : completion.is_late ? 'Completed Late' : isCompleted ? 'Done' : 'In Progress'}
                                         </span>
                                     </div>
                                 </div>
`;

if (regex.test(content)) {
    const newContent = content.replace(regex, newActionRow.trim() + '\n                                 ');
    fs.writeFileSync(filePath, newContent);
    console.log('Successfully updated SOPCompletionHistory.tsx');
} else {
    // Try a simpler regex if the first one fails
    console.log('Main regex failed, trying fallback...');
    const fallbackRegex = /\{\/\* Action buttons \*\/\}[\s\S]+?<\/div>[\s\S]+?(?=<\/motion\.div>)/;
    if (fallbackRegex.test(content)) {
        const newContent = content.replace(fallbackRegex, newActionRow.trim() + '\n                                 ');
        fs.writeFileSync(filePath, newContent);
        console.log('Successfully updated SOPCompletionHistory.tsx with fallback regex');
    } else {
        console.error('Could not find the action buttons block with any regex');
        process.exit(1);
    }
}
