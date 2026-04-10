/**
 * RoomFormModal
 * Modal form for creating or editing a meeting room.
 * Collects room name, location, capacity, size, photo, and amenities.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { X, Upload, Check, Loader2, Info, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { compressImage } from '@/frontend/utils/image-compression';

interface RoomFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    propertyId: string;
    room?: any; // If provided, edit mode
}

const RoomFormModal: React.FC<RoomFormModalProps> = ({ isOpen, onClose, onSuccess, propertyId, room }) => {
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [capacity, setCapacity] = useState('4');
    const [size, setSize] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [amenities, setAmenities] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (room) {
            setName(room.name);
            setLocation(room.location);
            setCapacity(room.capacity.toString());
            setSize(room.size?.toString() || '');
            setPhotoUrl(room.photo_url);
            setAmenities(room.amenities || []);
        } else {
            // Reset
            setName('');
            setLocation('');
            setCapacity('4');
            setSize('');
            setPhotoUrl('');
            setAmenities([]);
        }
    }, [room, isOpen]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // Compress image before upload
            const compressedFile = await compressImage(file, {
                maxWidth: 1200,
                maxSizeKB: 500,
                format: 'image/webp'
            });

            const formData = new FormData();
            formData.append('file', compressedFile);

            const res = await fetch('/api/meeting-rooms/photos', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                setPhotoUrl(data.url);
            } else {
                alert(data.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Upload failed. Please try a different photo.');
        } finally {
            setIsUploading(false);
        }
    };

    const toggleAmenity = (amenity: string) => {
        setAmenities(prev =>
            prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const payload = {
            name,
            location,
            capacity: parseInt(capacity),
            size: size ? parseInt(size) : null,
            photo_url: photoUrl,
            amenities,
            propertyId
        };

        try {
            const res = await fetch(room ? `/api/meeting-rooms/${room.id}` : '/api/meeting-rooms', {
                method: room ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                const data = await res.json();
                alert(data.error);
            }
        } catch (error) {
            alert('Operation failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{room ? 'Edit Room' : 'Add New Room'}</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configure meeting room specifications</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                    {/* Photo Section */}
                    <div className="flex flex-col md:flex-row gap-8 items-center">
                        <div className="w-full md:w-64 h-40 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 flex items-center justify-center relative overflow-hidden group">
                            {photoUrl ? (
                                <>
                                    <img src={photoUrl} className="w-full h-full object-cover" alt="Preview" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <label className="cursor-pointer p-3 bg-white rounded-xl shadow-lg">
                                            <Upload className="w-5 h-5 text-slate-900" />
                                            <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                        </label>
                                    </div>
                                </>
                            ) : (
                                <label className="flex flex-col items-center gap-2 cursor-pointer p-8 text-center group">
                                    {isUploading ? <Loader2 className="w-8 h-8 animate-spin text-primary" /> : <Upload className="w-8 h-8 text-slate-300 group-hover:text-primary transition-colors" />}
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upload Photo</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                </label>
                            )}
                        </div>
                        <div className="flex-1 space-y-4 w-full">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Room Name</label>
                                <input
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="e.g. Executive Boardroom"
                                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/5 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Location</label>
                                <input
                                    required
                                    value={location}
                                    onChange={e => setLocation(e.target.value)}
                                    placeholder="e.g. 4th Floor, West Wing"
                                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/5 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seating Capacity</label>
                            <select
                                value={capacity}
                                onChange={e => setCapacity(e.target.value)}
                                className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer"
                            >
                                {[2, 4, 6, 8, 10, 12, 15, 20].map(c => (
                                    <option key={c} value={c}>{c} Seater</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Size (Sq Ft)</label>
                            <input
                                type="number"
                                value={size}
                                onChange={e => setSize(e.target.value)}
                                placeholder="Optional"
                                className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/5 transition-all"
                            />
                        </div>
                    </div>

                    {/* Amenities Checkboxes */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amenities</label>
                        <div className="flex flex-wrap gap-3">
                            {['TV Screen', 'Whiteboard', 'Projector', 'Video Conf', 'Coffee Maker', 'AC', 'Fast WiFi'].map(amenity => (
                                <button
                                    key={amenity}
                                    type="button"
                                    onClick={() => toggleAmenity(amenity)}
                                    className={`px-5 py-3 rounded-xl text-[10px] font-bold uppercase tracking-tight border transition-all ${amenities.includes(amenity)
                                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'
                                        }`}
                                >
                                    {amenities.includes(amenity) && <Check className="w-3 h-3 inline-block mr-2" />}
                                    {amenity}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 pt-4 border-t border-slate-50">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-900 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !photoUrl}
                            className="flex-[2] py-4 bg-slate-900 text-white font-black text-xs rounded-2xl uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-black hover:scale-[1.02] transition-all disabled:opacity-30 flex items-center justify-center gap-3"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : null}
                            {room ? 'Update Room' : 'Save Meeting Room'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default RoomFormModal;
