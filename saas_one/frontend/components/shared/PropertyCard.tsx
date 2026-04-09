/**
 * PropertyCard
 * Card component displaying property info (Name, address, unit count, status).
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { Building2, MapPin, Edit, Trash2 } from 'lucide-react';

interface PropertyCardProps {
    property: {
        id: string;
        name: string;
        code: string;
        address?: string;
        image_url?: string;
    };
    onSelect?: (id: string) => void;
    onEdit?: (property: any) => void;
    onDelete?: (id: string) => void;
    showActions?: boolean;
}

const PropertyCard: React.FC<PropertyCardProps> = ({
    property,
    onSelect,
    onEdit,
    onDelete,
    showActions = false
}) => {
    return (
        <div
            onClick={() => !showActions && onSelect?.(property.id)}
            className={`bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group overflow-hidden flex flex-col ${!showActions ? 'cursor-pointer' : ''}`}
        >
            {/* Image Header with aspect-ratio handling */}
            <div className="relative h-56 bg-slate-50 overflow-hidden">
                {property.image_url ? (
                    <img
                        src={property.image_url}
                        alt={property.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-200 gap-2">
                        <Building2 className="w-16 h-16" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Standard Asset View</span>
                    </div>
                )}

                {/* Overlay Controls */}
                {showActions && (
                    <div className="absolute top-4 right-4 flex gap-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit?.(property); }}
                            className="p-3 bg-white/90 backdrop-blur-xl text-slate-600 rounded-2xl hover:bg-blue-500 hover:text-white shadow-xl shadow-black/5 transition-all"
                        >
                            <Edit className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete?.(property.id); }}
                            className="p-3 bg-white/90 backdrop-blur-xl text-slate-600 rounded-2xl hover:bg-rose-500 hover:text-white shadow-xl shadow-black/5 transition-all"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Property Tag */}
                <div className="absolute bottom-4 left-4">
                    <span className="px-3 py-1.5 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-black rounded-xl uppercase tracking-widest border border-white/10 shadow-lg">
                        {property.code}
                    </span>
                </div>
            </div>

            <div className="p-8 flex-1 flex flex-col">
                <h3 className="text-xl font-black text-slate-900 leading-tight mb-2 truncate decoration-blue-500 decoration-4">{property.name}</h3>
                <div className="flex items-start gap-2.5 text-slate-500 text-xs font-medium mb-8">
                    <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                    <span className="line-clamp-2 leading-relaxed">{property.address || 'No physical address registered'}</span>
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); onSelect?.(property.id); }}
                    className="w-full py-4 bg-slate-50 border border-slate-100 text-slate-900 font-bold rounded-2xl text-[10px] hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all mt-auto uppercase tracking-[0.2em] shadow-sm"
                >
                    View Live Analytics
                </button>
            </div>
        </div>
    );
};

export default PropertyCard;
