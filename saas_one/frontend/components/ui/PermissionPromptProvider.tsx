/**
 * PermissionPromptProvider
 * Context provider managing permission prompts across the app.
 * @remarks Client component.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/frontend/context/AuthContext';
import PermissionPromptModal from './PermissionPromptModal';

/**
 * Global provider — renders the permission prompt once per login session
 * across ALL routes (property, org, master, etc.)
 */
export default function PermissionPromptProvider() {
    const { user } = useAuth();
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        if (!user) return;

        // Show once per browser session (cleared on tab/browser close)
        const alreadyPrompted = sessionStorage.getItem('perms_prompted');
        if (alreadyPrompted) return;

        // Small delay so the dashboard finishes rendering first
        const timer = setTimeout(() => setShowModal(true), 1200);
        return () => clearTimeout(timer);
    }, [user]);

    const handleClose = () => {
        sessionStorage.setItem('perms_prompted', 'true');
        setShowModal(false);
    };

    return <PermissionPromptModal isOpen={showModal} onClose={handleClose} />;
}
