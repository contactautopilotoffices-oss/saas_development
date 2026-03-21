'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/frontend/context/AuthContext';
import Skeleton from '@/frontend/components/ui/Skeleton';
import { Toast } from '@/frontend/components/ui/Toast';
import { ClipboardCheck, ScanLine } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SOPTemplateManager from './SOPTemplateManager';
import SOPCompletionHistory from './SOPCompletionHistory';
import SOPChecklistRunner from './SOPChecklistRunner';
import SOPCompletionDetail from './SOPCompletionDetail';
import UniversalQRScannerModal from '@/frontend/components/shared/UniversalQRScannerModal';

interface SOPDashboardProps {
    propertyId?: string;
    propertyIds?: string[];
    propertySelector?: React.ReactNode;
    headerRight?: React.ReactNode;
}

const SOPDashboard: React.FC<SOPDashboardProps> = ({ propertyId, propertyIds, propertySelector, headerRight }) => {
    const isMultiProperty = !!propertyIds && propertyIds.length > 0;
    const { membership } = useAuth();
    const [activeView, setActiveView] = useState<'list' | 'runner' | 'history' | 'detail'>('list');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [selectedCompletionId, setSelectedCompletionId] = useState<string | null>(null);
    const [viewingCompletionId, setViewingCompletionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [userRole, setUserRole] = useState<string>('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [showScanner, setShowScanner] = useState(false);

    useEffect(() => {
        // Determine user role for this property
        const fetchUserRole = async () => {
            try {
                const property = membership?.properties?.find(p => p.id === propertyId);
                if (property?.role) {
                    setUserRole(property.role);
                } else if (membership?.org_role) {
                    // Org-level admin viewing a property they don't have direct membership to
                    setUserRole(membership.org_role);
                } else {
                    setUserRole('staff');
                }
            } catch (err) {
                console.error('Error fetching user role:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserRole();
    }, [propertyId, membership]);

    const isAdmin = ['property_admin', 'org_admin', 'org_super_admin', 'master_admin'].includes(userRole.toLowerCase());

    // Non-admin users should always land on history view
    useEffect(() => {
        if (!isLoading && !isAdmin) {
            setActiveView('history');
        }
    }, [isLoading, isAdmin]);

    const handleStartChecklist = (templateId: string, completionId?: string) => {
        setSelectedTemplateId(templateId);
        setSelectedCompletionId(completionId || null);
        setActiveView('runner');
    };

    const handleChecklistComplete = () => {
        setToast({ message: 'Checklist completed successfully!', type: 'success' });
        setActiveView('history');
        setSelectedTemplateId(null);
        setSelectedCompletionId(null);
    };

    if (isLoading) {
        return (
            <div className="space-y-6 p-8">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-slate-50/50 rounded-xl md:rounded-[2rem] p-0">

            <div className="max-w-7xl mx-auto space-y-2 md:space-y-3">
                {/* Compact Header */}
                <div className="flex items-center justify-between gap-2 px-3 pt-2 md:px-2 md:pt-0">
                    {/* Left: icon + title (hidden when propertySelector provided) */}
                    {!propertySelector && (
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-sm flex-shrink-0">
                                <ClipboardCheck size={16} />
                            </div>
                            <h4 className="text-sm font-black text-slate-900 tracking-tight">{isAdmin ? 'Checklist Manager' : 'My Checklist'}</h4>
                        </div>
                    )}

                    {/* Property selector slot (org admin) */}
                    {propertySelector && (
                        <div className="flex-shrink-0">{propertySelector}</div>
                    )}

                    {/* Scan QR - Only for non-admin (MST/staff) */}
                    {!isAdmin && (
                        <button
                            onClick={() => setShowScanner(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-primary transition-all font-black uppercase tracking-widest text-[9px] md:text-[10px]"
                        >
                            <ScanLine size={12} />
                            Scan QR
                        </button>
                    )}

                    {/* Right side: headerRight (notification bell etc) */}
                    {headerRight && <div className="flex-shrink-0">{headerRight}</div>}
                </div>

                {/* Content Area */}
                <motion.div
                    layout
                    className="bg-white border border-slate-200 rounded-xl md:rounded-[2rem] shadow-sm overflow-hidden"
                >
                    <div className="p-2 md:p-6">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeView}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                {isAdmin && activeView === 'list' && (
                                    <SOPTemplateManager
                                        propertyId={propertyId}
                                        propertyIds={isMultiProperty ? propertyIds : undefined}
                                        isAdmin={isAdmin}
                                        userRole={userRole}
                                        onSelectTemplate={handleStartChecklist}
                                        onRefresh={() => { }}
                                        activeView="list"
                                        onViewChange={(v) => setActiveView(v)}
                                    />
                                )}

                                {(activeView === 'history' || (!isAdmin && activeView === 'list')) && (
                                    <SOPCompletionHistory
                                        propertyId={propertyId}
                                        propertyIds={isMultiProperty ? propertyIds : undefined}
                                        isAdmin={isAdmin}
                                        userRole={userRole}
                                        onSelectTemplate={handleStartChecklist}
                                        onViewDetail={(id: string) => {
                                            setViewingCompletionId(id);
                                            setActiveView('detail');
                                        }}
                                        activeView="history"
                                        onViewChange={isAdmin ? (v) => setActiveView(v) : undefined}
                                    />
                                )}

                                {activeView === 'detail' && viewingCompletionId && (
                                    <SOPCompletionDetail
                                        completionId={viewingCompletionId}
                                        propertyId={propertyId!}
                                        isAdmin={isAdmin}
                                        onBack={() => {
                                            setActiveView('history');
                                            setViewingCompletionId(null);
                                        }}
                                    />
                                )}

                                {activeView === 'runner' && selectedTemplateId && (
                                    <div className="max-w-3xl mx-auto py-2 md:py-8">
                                        <SOPChecklistRunner
                                            templateId={selectedTemplateId}
                                            completionId={selectedCompletionId || undefined}
                                            isSuperAdmin={['org_admin', 'org_super_admin', 'master_admin'].includes(userRole.toLowerCase())}
                                            propertyId={propertyId!}
                                            onComplete={handleChecklistComplete}
                                            onCancel={() => {
                                                setActiveView(isAdmin ? 'list' : 'history');
                                                setSelectedTemplateId(null);
                                                setSelectedCompletionId(null);
                                            }}
                                        />
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>

            {showScanner && (
                <UniversalQRScannerModal
                    onResult={(result) => {
                        setShowScanner(false);
                        if (result.type === 'checklist') {
                            handleStartChecklist(result.templateId);
                        }
                        // stock/barcode types not applicable in checklist context
                    }}
                    onClose={() => setShowScanner(false)}
                />
            )}

            {/* Toast Notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    visible={true}
                    onClose={() => setToast(null)}
                    duration={3000}
                />
            )}
        </div>
    );
};

export default SOPDashboard;
