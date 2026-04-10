const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target UI block
const targetUI = `<div className="flex-1 min-w-0">
                                    <h4 className="font-black text-sm text-slate-900 tracking-tight truncate">{template.title}</h4>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Completed</span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-inter font-bold">{frequencyLabel(template.frequency)}</span>
                                    </div>
                                </div>`;

// Note: I'll use a simpler match for the UI part to be safe
const uiStart = '<h4 className="font-black text-sm text-slate-900 tracking-tight truncate">{template.title}</h4>';
const uiEnd = '{frequencyLabel(template.frequency)}</span>';

const templateTitleIndex = content.indexOf(uiStart);
const frequencyLabelIndex = content.indexOf(uiEnd, templateTitleIndex);

if (templateTitleIndex !== -1 && frequencyLabelIndex !== -1) {
    const sectionEnd = content.indexOf('</div>', frequencyLabelIndex);
    const before = content.slice(0, frequencyLabelIndex + uiEnd.length);
    const after = content.slice(sectionEnd);
    
    const timeDisplay = `
                                        {template.completedAt && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-emerald-200" />
                                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">
                                                    {new Date(template.completedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                </span>
                                            </>
                                        )}`;
                                        
    const newContent = before + timeDisplay + after;
    fs.writeFileSync(filePath, newContent);
    console.log('Successfully updated UI for Completed Today');
} else {
    console.error('Could not find UI markers');
    process.exit(1);
}
