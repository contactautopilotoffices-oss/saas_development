const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update Prop Interface
const propOld = 'onSelectTemplate: (id: string, propertyId: string, completionId?: string) => void;';
const propNew = 'onSelectTemplate: (id: string, propertyId: string, completionId?: string, completionDate?: string) => void;';
if (content.includes(propOld)) {
    content = content.replace(propOld, propNew);
    console.log('Updated Prop Interface');
}

// 2. Update Component Args
const compOld = 'onSelectTemplate, onViewDetail,';
const compNew = 'onSelectTemplate, onViewDetail,'; // Usually stays same if just destructuring
// (No change needed for destructuring)

// 3. Update Missed Shifts UI mapping
// We need to find the map within missedTemplates.map((template, index) => (...))
const missedStart = 'missedTemplates.map((template, index) => (';
const missedIndex = content.indexOf(missedStart);

if (missedIndex !== -1) {
    // We'll replace the block between missedTemplates.map and the next </div>
    // Actually, I'll use a regex to find the button onClick inside the missed map
    const buttonRegex = /onClick=\{\(\) => onSelectTemplate\(template\.id, template\.property_id, template\.inProgressId \|\| undefined\)\}/;
    const buttonNew = 'onClick={() => onSelectTemplate(template.id, template.property_id, template.inProgressId || undefined, template.historicalDate)}';
    
    if (buttonRegex.test(content)) {
        content = content.replace(buttonRegex, buttonNew);
        console.log('Updated button onClick in Missed section');
    }

    // Also update the "Start" vs "Resume Late" label
    const labelOld = "{template.inProgressId ? 'Resume' : 'Start'}";
    const labelNew = "{template.inProgressId ? 'Resume' : template.isHistorical ? 'Resume Late' : 'Start'}";
    if (content.includes(labelOld)) {
        content = content.replace(labelOld, labelNew);
        console.log('Updated Start/Resume Late label');
    }
    
    // Also inject the date display in the missed item rendering
    const infoEnd = '<span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{frequencyLabel(template.frequency)}</span>';
    const dateInjected = infoEnd + `
                                         {template.isHistorical && template.historicalDate && (
                                             <>
                                                 <span className="w-1 h-1 rounded-full bg-slate-200" />
                                                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                                     {new Date(template.historicalDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                 </span>
                                             </>
                                         )}`;
    if (content.includes(infoEnd)) {
        // Only replace inside the missed section or replace all occurrences (should be safe here)
        content = content.replace(infoEnd, dateInjected);
        console.log('Injected date display in missed item info');
    }
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated successfully');
