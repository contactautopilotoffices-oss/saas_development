'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Loader2, Search, Filter, Calendar as CalendarIcon, LayoutGrid, Zap } from 'lucide-react';
import RoomCard from './RoomCard';
import RoomFormModal from './RoomFormModal';
import AdminBookingList from './AdminBookingList';
import TenantRoomBooking from './TenantRoomBooking';
import AdminCreditsPanel from './AdminCreditsPanel';

interface Room {
    id: string;
    name: string;
    photo_url: string;
    location: string;
    capacity: number;
    size?: number;
    amenities: string[];
    status: string;
}

interface AdminRoomManagerProps {
    propertyId: string;
    user?: any;
}

const AdminRoomManager: React.FC<AdminRoomManagerProps> = ({ propertyId, user }) => {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [activeTab, setActiveTab] = useState<'rooms' | 'bookings' | 'book' | 'credits'>('rooms');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<Room | undefined>(undefined);

    useEffect(() => {
        fetchRooms();
    }, [propertyId]);

    const fetchRooms = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/meeting-rooms?propertyId=${propertyId}`);
            const data = await res.json();
            if (res.ok) {
                setRooms(data.rooms || []);
            }
        } catch (error) {
            console.error('Error fetching rooms:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (room: Room) => {
        setSelectedRoom(room);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setSelectedRoom(undefined);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to deactivate this room?')) return;
        try {
            const res = await fetch(`/api/meeting-rooms/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchRooms();
            }
        } catch (error) {
            console.error('Error deleting room:', error);
        }
    };

    const filteredRooms = rooms.filter(room => {
        const matchesSearch = room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            room.location.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="space-y-4 md:space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-0 md:p-8 md:rounded-[2.5rem] md:border md:border-slate-100 md:shadow-sm">
                <div className="flex flex-col gap-4 w-full md:w-auto px-4 md:px-0 pt-4 md:pt-0">
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Meeting Room Assets</h2>
                        <p className="text-slate-500 font-bold text-[10px] md:text-xs uppercase tracking-widest mt-1">Manage and monitor conference facilities</p>
                    </div>

                    {/* Tabs */}
                    <div className="grid grid-cols-4 md:flex bg-slate-50 p-1 md:p-1.5 rounded-xl md:rounded-2xl w-full md:w-fit">
                        <button
                            onClick={() => setActiveTab('rooms')}
                            className={`flex flex-1 items-center justify-center gap-0.5 md:gap-2 px-0.5 md:px-6 py-2 rounded-lg md:rounded-xl text-[6.5px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'rooms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <LayoutGrid className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                            <span className="truncate">Assets</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('bookings')}
                            className={`flex flex-1 items-center justify-center gap-0.5 md:gap-2 px-0.5 md:px-6 py-2 rounded-lg md:rounded-xl text-[6.5px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'bookings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <CalendarIcon className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                            <span className="truncate">Bookings</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('credits')}
                            className={`flex flex-1 items-center justify-center gap-0.5 md:gap-2 px-0.5 md:px-6 py-2 rounded-lg md:rounded-xl text-[6.5px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'credits' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <Zap className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                            <span className="truncate">Credits</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('book')}
                            className={`flex flex-1 items-center justify-center gap-0.5 md:gap-2 px-0.5 md:px-6 py-2 rounded-lg md:rounded-xl text-[6.5px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'book' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <Plus className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                            <span className="truncate">Book Now</span>
                        </button>
                    </div>
                </div>

                {activeTab === 'rooms' && (
                    <div className="px-4 md:px-0 pb-2 md:pb-0 w-full md:w-auto">
                        <button
                            className="w-full md:w-auto px-6 md:px-8 py-3 md:py-4 bg-primary text-white font-black text-xs rounded-xl md:rounded-2xl uppercase tracking-[0.2em] hover:opacity-95 hover:scale-105 transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
                            onClick={handleAdd}
                        >
                            <Plus className="w-4 h-4" />
                            Add New Room
                        </button>
                    </div>
                )}
            </div>

            {activeTab === 'rooms' ? (
                <>
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                        <div className="flex-1 relative group">
                            <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder="Search by name or location..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-12 md:pl-14 pr-4 md:pr-6 py-3.5 md:py-4 bg-white border border-slate-100 rounded-xl md:rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-white px-4 md:px-6 py-3.5 md:py-4 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-w-[140px] md:min-w-[160px]">
                            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-transparent text-[11px] md:text-sm font-black text-slate-700 focus:outline-none cursor-pointer uppercase tracking-widest w-full appearance-none outline-none"
                            >
                                <option value="all">All Status</option>
                                <option value="active">Active Only</option>
                                <option value="inactive">Inactive Only</option>
                            </select>
                        </div>
                    </div>

                    {/* Grid */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-[450px] bg-slate-50 rounded-[1.5rem] md:rounded-[2.5rem] animate-pulse border border-slate-100" />
                            ))}
                        </div>
                    ) : filteredRooms.length === 0 ? (
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] md:rounded-[3rem] p-12 md:p-24 text-center">
                            <div className="w-16 h-16 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8 shadow-sm">
                                <Plus className="w-8 h-8 md:w-10 md:h-10 text-slate-200" />
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-2">No meeting rooms found</h3>
                            <p className="text-slate-500 max-w-sm mx-auto font-medium text-sm">Start by adding your first meeting room to allow clients to make bookings.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                            {filteredRooms.map(room => (
                                <RoomCard
                                    key={room.id}
                                    room={room}
                                    isAdmin={true}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    )}
                </>
            ) : activeTab === 'bookings' ? (
                <AdminBookingList propertyId={propertyId} />
            ) : activeTab === 'credits' ? (
                <AdminCreditsPanel propertyId={propertyId} />
            ) : (
                <TenantRoomBooking propertyId={propertyId} user={user} hideHeader={true} />
            )}

            <RoomFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchRooms}
                propertyId={propertyId}
                room={selectedRoom}
            />
        </div>
    );
};

export default AdminRoomManager;
