'use client';
import { useState } from 'react';
import { CalendarDays, BarChart2, FileText, Shield, Wrench } from 'lucide-react';
import PPMCalendar from './PPMCalendar';
import PPMReports from './PPMReports';
import AMCContracts from './AMCContracts';
import PPMCompliance from './PPMCompliance';
import VendorManagement from '@/frontend/components/vendors/VendorManagement';

interface Props {
    organizationId: string;
    propertyId?: string;
    properties?: { id: string; name: string }[];
}

type TabId = 'calendar' | 'reports' | 'amc' | 'compliance' | 'vendors';

export default function PPMModule({ organizationId, propertyId, properties = [] }: Props) {
    const [tab, setTab] = useState<TabId>('calendar');

    const tabs = [
        { id: 'calendar', label: 'Calendar', icon: CalendarDays },
        { id: 'reports', label: 'Reports', icon: BarChart2 },
        { id: 'amc', label: 'AMC Contracts', icon: FileText },
        { id: 'compliance', label: 'Compliance', icon: Shield },
        { id: 'vendors', label: 'Vendors', icon: Wrench },
    ];

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100 bg-white overflow-x-auto">
                {tabs.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id as TabId)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap
                                ${active ? 'text-primary border-primary bg-primary/5' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
                        >
                            <Icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {tab === 'calendar' && <PPMCalendar organizationId={organizationId} propertyId={propertyId} properties={properties} />}
                {tab === 'reports' && <PPMReports organizationId={organizationId} propertyId={propertyId} properties={properties} />}
                {tab === 'amc' && <AMCContracts organizationId={organizationId} propertyId={propertyId} properties={properties} />}
                {tab === 'compliance' && <PPMCompliance organizationId={organizationId} propertyId={propertyId} />}
                {tab === 'vendors' && <VendorManagement organizationId={organizationId} propertyId={propertyId} properties={properties} />}
            </div>
        </div>
    );
}
