'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface RelativeTimeProps {
    date: Date | string;
    className?: string;
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
    const [formatted, setFormatted] = useState<string | null>(null);

    useEffect(() => {
        const update = () => {
            setFormatted(
                formatDistanceToNow(new Date(date), {
                    addSuffix: true,
                    includeSeconds: false,
                })
            );
        };

        // Run immediately on mount
        update();

        // Update every minute
        const interval = setInterval(update, 60000);

        return () => clearInterval(interval);
    }, [date]);

    // Return empty during SSR to avoid hydration mismatch
    if (formatted === null) {
        return <span className={className} />;
    }

    return <span className={className}>{formatted}</span>;
}
