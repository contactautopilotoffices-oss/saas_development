/**
 * PropertySelectionView
 * Multi-property onboarding screen for selecting an active property.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/frontend/utils/supabase/client';
import PropertyCard from '@/frontend/components/shared/PropertyCard';
import Loader from '@/frontend/components/ui/Loader';
import { Building2, LayoutGrid } from 'lucide-react';

interface PropertySelectionViewProps {
    propertyIds: string[];
    onSelect: (id: string) => void;
}

const PropertySelectionView: React.FC<PropertySelectionViewProps> = ({ propertyIds, onSelect }) => {
    const [properties, setProperties] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchProperties = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('properties')
                    .select('*')
                    .in('id', propertyIds);

                if (error) throw error;
                setProperties(data || []);
            } catch (err) {
                console.error('Error fetching properties:', err);
            } finally {
                setIsLoading(false);
            }
        };

        if (propertyIds.length > 0) {
            fetchProperties();
        } else {
            setIsLoading(false);
        }
    }, [propertyIds]);

    if (isLoading) {
        return (
            <div className="h-[60vh] w-full flex items-center justify-center">
                <Loader size="lg" />
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto p-12 space-y-12 animate-in fade-in duration-700">
            <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-sm border border-primary/5">
                    <Building2 className="w-10 h-10 text-primary" />
                </div>
                <h1 className="text-5xl font-black text-slate-900 tracking-tight">Select Location</h1>
                <p className="text-slate-500 font-medium text-lg max-w-2xl mx-auto">
                    You have access to multiple properties. Choose a location to view its live analytics and operational dashboard.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {properties.map((prop) => (
                    <PropertyCard
                        key={prop.id}
                        property={prop}
                        onSelect={onSelect}
                    />
                ))}
            </div>

            {properties.length === 0 && (
                <div className="text-center py-24 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                    <LayoutGrid className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No properties assigned to your account</p>
                </div>
            )}
        </div>
    );
};

export default PropertySelectionView;
