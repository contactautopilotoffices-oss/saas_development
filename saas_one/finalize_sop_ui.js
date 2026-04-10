const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix the button in Missed section to use historicalDate and consistent label
const missedButtonOld = /<button\s*onClick=\{\(\) => onSelectTemplate\(template\.id, template\.property_id\)\}\s*className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-\[9px\] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm"\s*>\s*Audit Late\s*<\/button>/g;

const missedButtonNew = `<button
                                        onClick={() => onSelectTemplate(template.id, template.property_id, template.inProgressId || undefined, template.historicalDate)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                    >
                                        <Play size={9} />
                                        {template.inProgressId ? 'Resume' : 'Resume Late'}
                                    </button>`;

if (missedButtonOld.test(content)) {
    content = content.replace(missedButtonOld, missedButtonNew);
    console.log('Fixed Missed button');
} else {
    console.log('Missed button pattern not found - might already be updated');
}

// 2. Add "Completed Late" indicator in the Completed Today section if the date is in the past
const completedTodayStart = 'completedToday.map((template, index) => (';
const completedTodayIndex = content.indexOf(completedTodayStart);

if (completedTodayIndex !== -1) {
    const infoPart = '<span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Completed</span>';
    const infoReplacement = `{template.historicalDate || (template.completion_date && template.completion_date !== new Date(liveNow).toLocaleDateString('en-CA')) ? (
                                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Completed Late</span>
                                        ) : (
                                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Completed</span>
                                        )}`;
    
    // We need to be careful to only replace this inside the completedToday section
    const sectionPart = content.slice(completedTodayIndex, content.indexOf('))}</div>', completedTodayIndex) + 10);
    if (sectionPart.includes(infoPart)) {
        const newSectionPart = sectionPart.replace(infoPart, infoReplacement);
        content = content.replace(sectionPart, newSectionPart);
        console.log('Updated Completed Today labels');
    }
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx finalized successfully');
