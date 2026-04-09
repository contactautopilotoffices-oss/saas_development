'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import AdminRoomManager from '@/frontend/components/meeting-rooms/AdminRoomManager';
import { Building2, Loader2 } from 'lucide-react';

export default function MeetingRoomsPage() {
    const params = useParams();
    const orgId = params.orgId as string;
    const [properties, setProperties] = useState<any[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        if (orgId) {
            fetchProperties();
        }
    }, [orgId]);

    const fetchProperties = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('properties')
            .select('id, name')
            .eq('organization_id', orgId);

        if (data && data.length > 0) {
            setProperties(data);
            setSelectedPropertyId(data[0].id);
        }
        setIsLoading(false);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Meeting Rooms</h1>

                {/* Property Selector */}
                <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
                    <Building2 className="w-4 h-4 text-primary" />
                    <select
                        value={selectedPropertyId}
                        onChange={(e) => setSelectedPropertyId(e.target.value)}
                        className="bg-transparent text-sm font-black text-slate-700 focus:outline-none cursor-pointer uppercase tracking-widest"
                    >
                        {properties.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedPropertyId ? (
                <AdminRoomManager propertyId={selectedPropertyId} />
            ) : (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-24 text-center">
                    <p className="text-slate-500 font-bold uppercase tracking-widest">No properties found for this organization.</p>
                </div>
            )}
        </div>
    );
}
