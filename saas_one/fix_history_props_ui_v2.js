const fs = require('fs');

const hPath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
const tPath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPTemplateManager.tsx';

const regex = /onSelectTemplate:\s*\((.*?)\)\s*=>\s*void;/;

// Update History Component
if (fs.existsSync(hPath)) {
    let content = fs.readFileSync(hPath, 'utf8');
    if (regex.test(content)) {
        content = content.replace(regex, 'onSelectTemplate: (id: string, propertyId: string, completionId?: string, completionDate?: string) => void;');
        fs.writeFileSync(hPath, content);
        console.log('Updated SOPCompletionHistory.tsx interface');
    }
}

// Update TemplateManager Component
if (fs.existsSync(tPath)) {
    let content = fs.readFileSync(tPath, 'utf8');
    if (regex.test(content)) {
        content = content.replace(regex, 'onSelectTemplate: (id: string, propertyId: string, completionId?: string, completionDate?: string) => void;');
        fs.writeFileSync(tPath, content);
        console.log('Updated SOPTemplateManager.tsx interface');
    }
}
