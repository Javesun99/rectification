'use client';

import { useState, useEffect } from 'react';

interface FormattedDateProps {
  date: string | Date | number | null | undefined;
  mode?: 'datetime' | 'date';
  className?: string;
}

export default function FormattedDate({ date, mode = 'datetime', className }: FormattedDateProps) {
  const [formatted, setFormatted] = useState<string>('');

  useEffect(() => {
    if (!date) {
        setFormatted('-');
        return;
    }
    const d = new Date(date);
    if (mode === 'date') {
        setFormatted(d.toLocaleDateString());
    } else {
        setFormatted(d.toLocaleString());
    }
  }, [date, mode]);

  // Return a span with a suppressHydrationWarning if we wanted to render *something* initially
  // But here we just wait for effect. To avoid layout shift, we can render a placeholder
  // or just render the content once available.
  
  // A common trick to avoid hydration mismatch without layout shift is:
  // Render a server-safe format (like YYYY-MM-DD) initially, then switch.
  // But simpler is just to return null or a consistent placeholder until mounted.
  
  if (!formatted) return <span className={className}>-</span>;

  return <span className={className}>{formatted}</span>;
}
