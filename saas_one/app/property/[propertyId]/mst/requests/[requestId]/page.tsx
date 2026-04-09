'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import { ArrowLeft, MapPin, Clock, AlertTriangle, User, CheckCircle2, Activity, Camera, Video, Upload, Loader2, Play } from 'lucide-react';
import MediaCaptureModal, { MediaFile } from '@/frontend/components/shared/MediaCaptureModal';

function formatTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

function MediaSlotCard({
    label,
    photoUrl,
    videoUrl,
    onUpload,
    isUploading,
}: {
    label: string;
    photoUrl?: string | null;
    videoUrl?: string | null;
    onUpload: () => void;
    isUploading?: boolean;
}) {
    const hasVideo = Boolean(videoUrl);
    const hasPhoto = Boolean(photoUrl);
    const hasMedia = hasVideo || hasPhoto;

    return (
        <div className="bg-[#0f1419] border border-[#21262d] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#21262d]">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                <button
                    onClick={onUpload}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors"
                >
                    {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Upload className="w-3.5 h-3.5" />
                    )}
                    {isUploading ? 'Uploading…' : 'Upload'}
                </button>
            </div>

            <div className="aspect-video relative flex items-center justify-center bg-[#0d1117]">
                {hasVideo ? (
                    <video
                        src={videoUrl!}
                        controls
                        playsInline
                        className="w-full h-full object-cover"
                    />
                ) : hasPhoto ? (
                    <img src={photoUrl!} alt={label} className="w-full h-full object-cover" />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-600">
                        <Camera className="w-8 h-8" />
                        <span className="text-xs">No media yet</span>
                        <button
                            onClick={onUpload}
                            className="mt-1 flex items-center gap-1.5 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
                        >
                            <Upload className="w-3.5 h-3.5" /> Add photo or video
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function RequestDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const propertyId = params?.propertyId as string;
    const requestId = params?.requestId as string;
    const [ticket, setTicket] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [property, setProperty] = useState<any>(null);

    // Media upload state
    const [showMediaModal, setShowMediaModal] = useState(false);
    const [uploadingType, setUploadingType] = useState<'before' | 'after' | null>(null);
    const [isUploadingBefore, setIsUploadingBefore] = useState(false);
    const [isUploadingAfter, setIsUploadingAfter] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const supabase = createClient();

    const fetchData = async () => {
        if (!requestId || !propertyId) return;
        setIsLoading(true);

        const { data: ticketData, error: ticketError } = await supabase
            .from('tickets')
            .select(`
                *,
                creator:users!raised_by(full_name, email),
                category:issue_categories(name, code, icon)
            `)
            .eq('id', requestId)
            .single();

        if (ticketError) console.error('Error fetching ticket:', ticketError);
        else setTicket(ticketData);

        const { data: propertyData, error: propertyError } = await supabase
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();

        if (propertyError) console.error('Error fetching property:', propertyError);
        else setProperty(propertyData);

        setIsLoading(false);
    };

    useEffect(() => { fetchData(); }, [requestId, propertyId]);

    const openUpload = (type: 'before' | 'after') => {
        setUploadingType(type);
        setUploadError(null);
        setShowMediaModal(true);
    };

    const handleMediaUpload = async (media: MediaFile) => {
        if (!uploadingType || !ticket?.id) return;
        setShowMediaModal(false);

        const setUploading = uploadingType === 'before' ? setIsUploadingBefore : setIsUploadingAfter;
        setUploading(true);
        setUploadError(null);

        try {
            const formData = new FormData();
            formData.append('file', media.file);
            formData.append('type', uploadingType);

            const endpoint = media.type === 'video'
                ? `/api/tickets/${ticket.id}/videos`
                : `/api/tickets/${ticket.id}/photos`;

            const res = await fetch(endpoint, { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Upload failed');
            }
            await fetchData();
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
            setUploadingType(null);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#0f1419] flex items-center justify-center text-slate-400">
                Loading request details...
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="min-h-screen bg-[#0f1419] flex flex-col items-center justify-center text-slate-400 gap-4">
                <p>Request not found.</p>
                <button onClick={() => router.back()} className="flex items-center gap-2 text-emerald-500 hover:text-emerald-400">
                    <ArrowLeft className="w-4 h-4" /> Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0f1419] text-white font-inter">
            {/* Header */}
            <header className="h-16 border-b border-[#21262d] flex items-center px-6 bg-[#161b22]">
                <button
                    onClick={() => router.back()}
                    className="mr-4 p-2 hover:bg-[#21262d] rounded-full text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-lg font-bold flex items-center gap-2">
                        {ticket.ticket_number || 'Ticket Details'}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${ticket.status === 'open' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                            ticket.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}>
                            {ticket.status?.replace('_', ' ')}
                        </span>
                    </h1>
                </div>
            </header>

            <main className="p-6 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Ticket Overview */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
                        <h2 className="text-xl font-bold mb-4">{ticket.title}</h2>
                        <p className="text-slate-400 text-sm leading-relaxed mb-6">{ticket.description}</p>

                        <div className="flex items-center gap-6 text-xs text-slate-500 border-t border-[#21262d] pt-4">
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                <span>Raised by <span className="text-slate-300">{ticket.creator?.full_name || 'Unknown'}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>{formatTimeAgo(ticket.created_at)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Media Section */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Photos & Videos</h3>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                <Camera className="w-3 h-3" /> Photo
                                <span className="mx-1">·</span>
                                <Video className="w-3 h-3" /> Video supported
                            </div>
                        </div>

                        {uploadError && (
                            <div className="mb-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                {uploadError}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <MediaSlotCard
                                label="Before"
                                photoUrl={ticket.photo_before_url}
                                videoUrl={ticket.video_before_url}
                                onUpload={() => openUpload('before')}
                                isUploading={isUploadingBefore}
                            />
                            <MediaSlotCard
                                label="After"
                                photoUrl={ticket.photo_after_url}
                                videoUrl={ticket.video_after_url}
                                onUpload={() => openUpload('after')}
                                isUploading={isUploadingAfter}
                            />
                        </div>
                    </div>

                    {/* Activity Log */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6 opacity-50">
                        <h3 className="text-sm font-bold mb-4">Activity Log</h3>
                        <p className="text-xs text-slate-500">No recent activity.</p>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Property Details */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Property Details</h3>
                        {property ? (
                            <div className="space-y-4">
                                <div>
                                    <p className="text-white font-bold">{property.name}</p>
                                    <div className="flex items-start gap-2 mt-2 text-xs text-slate-400">
                                        <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                        <p>{property.address || 'No address provided'}</p>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-[#21262d]">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs text-slate-500">Property Code</span>
                                        <code className="text-xs bg-[#21262d] px-2 py-1 rounded text-slate-300">{property.code}</code>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">Loading property info...</p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Actions</h3>
                        <button
                            onClick={() => router.push(`/property/${propertyId}/flow-map`)}
                            className="w-full flex items-center justify-center gap-2 bg-[#21262d] hover:bg-[#30363d] text-secondary border border-secondary/20 py-2.5 rounded-lg text-sm font-bold transition-colors mb-3"
                        >
                            <Activity className="w-4 h-4" />
                            Live Flow Map
                        </button>
                        <button className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors mb-3">
                            <CheckCircle2 className="w-4 h-4" />
                            Accept Request
                        </button>
                        <button className="w-full flex items-center justify-center gap-2 bg-[#21262d] hover:bg-[#30363d] text-slate-300 border border-[#30363d] py-2.5 rounded-lg text-sm font-medium transition-colors">
                            <AlertTriangle className="w-4 h-4" />
                            Report Issue
                        </button>
                    </div>
                </div>
            </main>

            {/* Media Capture Modal */}
            <MediaCaptureModal
                isOpen={showMediaModal}
                onClose={() => { setShowMediaModal(false); setUploadingType(null); }}
                onCapture={handleMediaUpload}
                title={`Upload ${uploadingType === 'before' ? 'Before' : 'After'} Media`}
            />
        </div>
    );
}
