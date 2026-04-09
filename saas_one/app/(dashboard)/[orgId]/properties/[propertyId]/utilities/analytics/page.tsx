'use client';

import { UnifiedAnalyticsDashboard } from '@/frontend/components/utilities';
import { useParams } from 'next/navigation';
import { useTheme } from '@/frontend/context/ThemeContext';

export default function UtilitiesAnalyticsPage() {
    const params = useParams();
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const propertyId = params?.propertyId as string;

    return (
        <UnifiedAnalyticsDashboard
            propertyId={propertyId}
            isDark={isDark}
        />
    );
}
