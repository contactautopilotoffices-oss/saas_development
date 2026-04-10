const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target the completed array push logic in the useMemo loop
const targetStart = '} else if (dueStatus.status === \'completed\' || (slotCompleted && !inProgress)) {';
const targetEnd = '} else if (dueStatus.status === \'upcoming\') {';

const searchPart = `            } else if (dueStatus.status === 'completed' || (slotCompleted && !inProgress)) {
                completed.push({ 
                    ...templateWithMeta, 
                    dueLabel: slotCompleted ? 'Done' : dueStatus.label,
                    completedAt: slotCompleted?.completed_at || latestCompletion?.completed_at || lastDate 
                });
            } else if (dueStatus.status === 'upcoming') {`;

const replacementPart = `            } else if (dueStatus.status === 'completed' || (slotCompleted && !inProgress)) {
                completed.push({ 
                    ...templateWithMeta, 
                    dueStatus: 'on-time',
                    dueLabel: slotCompleted ? 'Done' : dueStatus.label,
                    completedAt: slotCompleted?.completed_at || latestCompletion?.completed_at || lastDate 
                });
            } else {
                // LATE COMPLETION CHECK: Did we finish a past checklist TODAY?
                const todayCal = liveNow.toLocaleDateString('en-CA');
                const lateDone = completions.find(c => 
                    c.template_id === template.id && 
                    c.status === 'completed' &&
                    c.completion_date !== actualLogicalDate && // Past shift
                    new Date(c.completed_at).toLocaleDateString('en-CA') === todayCal // Finished today
                );
                if (lateDone) {
                    completed.push({
                        ...templateWithMeta,
                        dueStatus: 'late',
                        historicalDate: lateDone.completion_date,
                        completedAt: lateDone.completed_at
                    });
                }
            }
            if (dueStatus.status === 'upcoming') {`;

if (content.includes(searchPart)) {
    content = content.replace(searchPart, replacementPart);
    console.log('Successfully refactored SOPCompletionHistory completedToday logic');
} else {
    // Try regex if whitespace mismatch
    const regex = /\}\s*else\s*if\s*\(dueStatus\.status\s*===\s*['"]completed['"]\s*\|\|\s*\(slotCompleted\s*&&\s*!inProgress\)\)\s*\{[\s\S]*?completed\.push\(\{[\s\S]*?\}\)\;\s*\}\s*else\s*if\s*\(dueStatus\.status\s*===\s*['"]upcoming['"]\)\s*\{/;
    if (regex.test(content)) {
        content = content.replace(regex, replacementPart);
        console.log('Successfully refactored via regex');
    } else {
        console.error('Target logic structure not found');
        process.exit(1);
    }
}

// Also update the rendering section for Completed Today
const renderMatch = `                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {template.historicalDate || (template.completion_date && template.completion_date !== new Date(liveNow).toLocaleDateString('en-CA')) ? (
                                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Completed Late</span>
                                        ) : (
                                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Completed</span>
                                        )}`;

const renderReplacement = `                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {template.dueStatus === 'late' || template.historicalDate ? (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Completed Late</span>
                                                {template.historicalDate && (
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                                        ({new Date(template.historicalDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Completed</span>
                                        )}`;

if (content.includes(renderMatch)) {
    content = content.replace(renderMatch, renderReplacement);
    console.log('Successfully updated completed late rendering');
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated');
