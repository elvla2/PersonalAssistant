'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface RealtimeContextType {
  lastUpdated: number;
  triggerManualRefresh: () => void;
}

const RealtimeContext = createContext<RealtimeContextType>({
  lastUpdated: Date.now(),
  triggerManualRefresh: () => {},
});

export const useRealtime = () => useContext(RealtimeContext);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerManualRefresh = () => {
    setLastUpdated(Date.now());
  };

  useEffect(() => {
    const supabase = createClient();

    const debouncedRefresh = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        setLastUpdated(Date.now());
      }, 350);
    };

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_items' },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_threads' },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_purge_log' },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sessions' },
        debouncedRefresh
      )
      .subscribe();

    // Heartbeat polling for local desktop SQLite mode and fallback
    const pollInterval = setInterval(() => {
      setLastUpdated(Date.now());
    }, 5000);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ lastUpdated, triggerManualRefresh }}>
      {children}
    </RealtimeContext.Provider>
  );
}
