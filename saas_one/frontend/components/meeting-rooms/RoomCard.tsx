/**
 * RoomCard
 * Meeting room card displaying availability, amenities, and booking slot grid.
 * Shows room photo, name, location, capacity, and configurable time slots.
 * @remarks Client component.
 */

'use client';

import React, { useState } from 'react';
import { Monitor, Trash2, Edit2, X } from 'lucide-react';

interface RoomCardProps {
    room: any;
    selectedDate?: string;
    onBook?: (room: any, slot: any) => void;
    isAdmin?: boolean;
    onEdit?: (room: any) => void;
    onDelete?: (id: string) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, selectedDate: _selectedDate, onBook, isAdmin, onEdit, onDelete }) => {
    const [showPhoto, setShowPhoto] = useState(false);

    // Standard time slots for the design (9:00 AM to 7:00 PM)
    const slots = [
        { time: '09:00 AM', start: '09:00', end: '10:00', endLabel: '10:00 AM', type: 'STANDARD' },
        { time: '10:15 AM', start: '10:15', end: '11:15', endLabel: '11:15 AM', type: 'PREMIUM' },
        { time: '11:30 AM', start: '11:30', end: '12:30', endLabel: '12:30 PM', type: 'STANDARD' },
        { time: '12:00 PM', start: '12:00', end: '13:00', endLabel: '01:00 PM', type: 'PREMIUM' },
        { time: '01:00 PM', start: '13:00', end: '14:00', endLabel: '02:00 PM', type: 'STANDARD' },
        { time: '03:00 PM', start: '15:00', end: '16:00', endLabel: '04:00 PM', type: 'PREMIUM' },
        { time: '05:00 PM', start: '17:00', end: '18:00', endLabel: '06:00 PM', type: 'STANDARD' },
        { time: '06:00 PM', start: '18:00', end: '19:00', endLabel: '07:00 PM', type: 'PREMIUM' },
        { time: '07:00 PM', start: '19:00', end: '20:00', endLabel: '08:00 PM', type: 'STANDARD' },
    ];

    const checkIsBooked = (slot: any) => {
        if (!room.bookings) return false;
        return room.bookings.some((b: any) => {
            const bStart = b.start_time;
            const bEnd = b.end_time;
            // Overlap logic: (StartA < EndB) and (EndA > StartB)
            return (slot.start < bEnd) && (slot.end > bStart);
        });
    };

    return (
        <>
            <div className="w-full h-full">
                <div className="w-full max-w-full rounded-xl bg-card border border-border p-3 md:p-6 shadow-sm hover:shadow-md transition-all relative flex flex-col h-full">
                    <span className="absolute top-4 right-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest hidden md:block">Available</span>

                    <div className="flex gap-4 md:gap-6 mb-4 md:mb-6">
                        {/* Room Photo */}
                        <div
                            className={`w-[64px] h-[64px] md:w-24 md:h-24 rounded-2xl bg-muted flex-shrink-0 overflow-hidden border border-border ${room.photo_url ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
                            onClick={() => room.photo_url && setShowPhoto(true)}
                        >
                            {room.photo_url ? (
                                <img
                                    src={room.photo_url}
                                    alt={room.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Monitor className="w-8 h-8" />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="text-base md:text-[18px] font-bold text-foreground truncate mb-1">{room.name}</h3>
                            <p className="text-[12px] md:text-[14px] font-medium text-muted-foreground break-words">
                                {room.capacity} People • {room.location}
                            </p>
                        </div>
                    </div>

                    {/* Amenities */}
                    <div className="flex flex-wrap gap-x-2 text-[12px] md:text-[13px] font-bold text-muted-foreground mb-4 md:mb-6">
                        {(room.amenities || []).map((amenity: string, i: number) => (
                            <React.Fragment key={amenity}>
                                {i > 0 && <span className="text-muted-foreground">•</span>}
                                <span>{amenity}</span>
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="mt-auto min-w-0 w-full">
                        {isAdmin ? (
                            /* Admin Actions */
                            <div className="flex items-center gap-3 pt-4 border-t border-border">
                                <button
                                    onClick={() => onEdit?.(room)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-muted hover:bg-muted/80 text-muted-foreground rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    Edit Room
                                </button>
                                <button
                                    onClick={() => onDelete?.(room.id)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                </button>
                            </div>
                        ) : (
                            /* Time Slots Grid (Tenant View) */
                            <div className="w-full overflow-x-auto no-scrollbar">
                                <div className="flex gap-2 min-w-max pb-1">
                                    {slots.map((slot, i) => {
                                        const isPremium = slot.type === 'PREMIUM';
                                        const isBooked = checkIsBooked(slot);

                                        return (
                                            <button
                                                key={i}
                                                disabled={isBooked}
                                                onClick={() => onBook?.(room, slot)}
                                                className={`shrink-0 py-2 px-3 rounded-lg border-2 transition-all text-center flex flex-col items-center justify-center gap-0.5 ${isBooked
                                                    ? 'bg-muted border-border opacity-50 cursor-not-allowed'
                                                    : isPremium
                                                        ? 'bg-emerald-50 border-emerald-100 hover:border-emerald-500 text-emerald-700'
                                                        : 'bg-orange-50 border-orange-100 hover:border-orange-500 text-orange-700'
                                                    }`}
                                            >
                                                <span className={`text-[12px] font-bold leading-none ${isBooked ? 'text-muted-foreground' : 'text-foreground'}`}>
                                                    {slot.time.split(' ')[0]}
                                                </span>
                                                <span className={`text-[8px] font-black tracking-tighter uppercase ${isBooked ? 'text-muted-foreground' : isPremium ? 'text-emerald-500' : 'text-orange-500'
                                                    }`}>
                                                    {slot.time.split(' ')[1]}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Full-screen photo lightbox */}
            {showPhoto && room.photo_url && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setShowPhoto(false)}
                >
                    <button
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        onClick={() => setShowPhoto(false)}
                    >
                        <X className="w-5 h-5 text-white" />
                    </button>
                    <p className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">{room.name}</p>
                    <img
                        src={room.photo_url}
                        alt={room.name}
                        className="max-w-full max-h-[90vh] object-contain rounded-xl"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
};

export default RoomCard;
