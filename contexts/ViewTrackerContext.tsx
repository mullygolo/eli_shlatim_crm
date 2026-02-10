import React, { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { postViewEvents } from '../services/mongoService';
import type { ViewEvent } from '../types';

const BATCH_INTERVAL_MS = 30000;
const MAX_BUFFER = 100;

interface PendingView {
    startedAt: string;
    entityType: string;
    entityId?: string;
    label?: string;
}

interface ViewTrackerContextType {
    trackViewStart: (key: string, entityType: string, entityId?: string, label?: string) => void;
    trackViewEnd: (key: string) => void;
}

const ViewTrackerContext = createContext<ViewTrackerContextType | undefined>(undefined);

export function useViewTracker(): ViewTrackerContextType {
    const ctx = useContext(ViewTrackerContext);
    if (!ctx) return { trackViewStart: () => {}, trackViewEnd: () => {} };
    return ctx;
}

export const ViewTrackerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const bufferRef = useRef<ViewEvent[]>([]);
    const pendingRef = useRef<Map<string, PendingView>>(new Map());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const flush = useCallback(async () => {
        const pending = pendingRef.current;
        const toSend: ViewEvent[] = [...bufferRef.current];
        bufferRef.current = [];
        for (const [key, p] of pending) {
            const now = new Date().toISOString();
            const start = new Date(p.startedAt).getTime();
            const end = new Date(now).getTime();
            toSend.push({
                userId: user?.id ?? '',
                username: user?.name ?? undefined,
                entityType: p.entityType,
                entityId: p.entityId,
                label: p.label,
                startedAt: p.startedAt,
                endedAt: now,
                durationSeconds: Math.round((end - start) / 1000),
            });
        }
        pending.clear();
        if (toSend.length === 0) return;
        try {
            await postViewEvents(toSend.slice(0, MAX_BUFFER));
        } catch (e) {
            console.warn('View events flush failed:', e);
        }
    }, [user?.id, user?.name]);

    const trackViewStart = useCallback((key: string, entityType: string, entityId?: string, label?: string) => {
        const now = new Date().toISOString();
        pendingRef.current.set(key, { startedAt: now, entityType, entityId, label });
    }, []);

    const trackViewEnd = useCallback((key: string) => {
        const pending = pendingRef.current.get(key);
        if (!pending) return;
        pendingRef.current.delete(key);
        const now = new Date().toISOString();
        const start = new Date(pending.startedAt).getTime();
        const end = new Date(now).getTime();
        bufferRef.current.push({
            userId: user?.id ?? '',
            username: user?.name ?? undefined,
            entityType: pending.entityType,
            entityId: pending.entityId,
            label: pending.label,
            startedAt: pending.startedAt,
            endedAt: now,
            durationSeconds: Math.round((end - start) / 1000),
        });
        if (bufferRef.current.length >= 20) flush();
    }, [user?.id, user?.name, flush]);

    useEffect(() => {
        intervalRef.current = setInterval(flush, BATCH_INTERVAL_MS);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [flush]);

    useEffect(() => {
        const onBeforeUnload = () => { flush(); };
        const onPageHide = () => { flush(); };
        window.addEventListener('beforeunload', onBeforeUnload);
        window.addEventListener('pagehide', onPageHide);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            window.removeEventListener('pagehide', onPageHide);
        };
    }, [flush]);

    const value: ViewTrackerContextType = { trackViewStart, trackViewEnd };
    return (
        <ViewTrackerContext.Provider value={value}>
            {children}
        </ViewTrackerContext.Provider>
    );
};
