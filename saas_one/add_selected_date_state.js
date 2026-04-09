const fs = require('fs');

const filePath = 'c:\\dev\\autopilotapp\\frontend\\components\\sop\\SOPCompletionHistory.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const stateSearch = `const [activeFilter, setActiveFilter] = useState<'due' | 'missed' | 'completed' | 'all'>('all');`;
const stateReplacement = `const [activeFilter, setActiveFilter] = useState<'due' | 'missed' | 'completed' | 'all'>('all');
    const [selectedDate, setSelectedDate] = useState(liveNow.toLocaleDateString('en-CA'));
    const isToday = selectedDate === liveNow.toLocaleDateString('en-CA');`;

if (content.includes(stateSearch)) {
    content = content.replace(stateSearch, stateReplacement);
    console.log('Successfully added selectedDate state');
} else {
    console.error('Target state definition not found');
    process.exit(1);
}

fs.writeFileSync(filePath, content);
console.log('SOPCompletionHistory.tsx updated');
