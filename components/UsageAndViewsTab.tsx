import React, { useState, useCallback, useEffect } from 'react';
import { Employee } from '../types';
import { getViewEventsAggregated, getViewEventsRaw } from '../services/mongoService';
import type { ViewEventsAggregatedRow, ViewEvent } from '../types';

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} ש׳`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (s === 0) return `${m} דק׳`;
    return `${m} דק׳ ${s} ש׳`;
}

function todayIsrael(): string {
    const d = new Date();
    const offset = 120;
    const local = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + offset * 60000);
    return local.toISOString().slice(0, 10);
}

function daysAgoIsrael(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}

const ENTITY_LABELS: Record<string, string> = {
    route: 'מסך',
    order: 'הזמנה',
    customer: 'לקוח',
    supplier: 'ספק',
};

interface UsageAndViewsTabProps {
    employees: Employee[];
}

const UsageAndViewsTab: React.FC<UsageAndViewsTabProps> = ({ employees }) => {
    const [from, setFrom] = useState(daysAgoIsrael(6));
    const [to, setTo] = useState(todayIsrael());
    const [userId, setUserId] = useState('');
    const [rows, setRows] = useState<ViewEventsAggregatedRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadAggregated = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getViewEventsAggregated({
                from,
                to,
                userId: userId || undefined,
            });
            setRows(result.rows);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'שגיאה בטעינה');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [from, to, userId]);

    useEffect(() => {
        loadAggregated();
    }, [loadAggregated]);

    const [showRaw, setShowRaw] = useState(false);
    const [rawFrom, setRawFrom] = useState(todayIsrael());
    const [rawTo, setRawTo] = useState(todayIsrael());
    const [rawUserId, setRawUserId] = useState('');
    const [rawEntityType, setRawEntityType] = useState('');
    const [rawEvents, setRawEvents] = useState<ViewEvent[]>([]);
    const [rawTotal, setRawTotal] = useState(0);
    const [rawLoading, setRawLoading] = useState(false);
    const [rawPage, setRawPage] = useState(1);
    const rawLimit = 50;

    const loadRaw = useCallback(async () => {
        setRawLoading(true);
        try {
            const result = await getViewEventsRaw({
                from: rawFrom,
                to: rawTo,
                userId: rawUserId || undefined,
                entityType: rawEntityType || undefined,
                page: rawPage,
                limit: rawLimit,
            });
            setRawEvents(result.events);
            setRawTotal(result.total);
        } catch {
            setRawEvents([]);
            setRawTotal(0);
        } finally {
            setRawLoading(false);
        }
    }, [rawFrom, rawTo, rawUserId, rawEntityType, rawPage]);

    useEffect(() => {
        if (showRaw) loadRaw();
    }, [showRaw, loadRaw]);

    const rawPages = Math.ceil(rawTotal / rawLimit) || 1;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-bold text-slate-800">שימוש וצפיות במערכת</h3>
                <p className="text-slate-500 text-sm">סיכום לפי עובד, תאריך וסוג ישות (מסכים, הזמנות). נתונים מקובצים — לא מעמיס על הלוגים.</p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">מתאריך</label>
                    <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">עד תאריך</label>
                    <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">עובד</label>
                    <select value={userId} onChange={(e) => setUserId(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[140px]">
                        <option value="">הכל</option>
                        {employees.map((e) => (
                            <option key={e.id} value={e.id}>{e.name || e.username}</option>
                        ))}
                    </select>
                </div>
                <button type="button" onClick={() => loadAggregated()} disabled={loading} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm">
                    רענן
                </button>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {loading && rows.length === 0 ? (
                <p className="text-slate-500 py-4">טוען...</p>
            ) : rows.length === 0 ? (
                <p className="text-slate-500 py-4">אין נתוני צפיות בטווח הנבחר.</p>
            ) : (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200 text-start">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">עובד</th>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">תאריך</th>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">סוג</th>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">מספר צפיות</th>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">זמן כולל</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {rows.map((r, i) => (
                                <tr key={`${r.userId}-${r.dateKey}-${r.entityType}-${i}`} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 text-sm text-slate-800">{r.username || r.userId || '—'}</td>
                                    <td className="px-4 py-2 text-sm text-slate-600">{r.dateKey}</td>
                                    <td className="px-4 py-2 text-sm">{ENTITY_LABELS[r.entityType] || r.entityType}</td>
                                    <td className="px-4 py-2 text-sm text-slate-700">{r.viewCount}</td>
                                    <td className="px-4 py-2 text-sm text-slate-700">{formatDuration(r.totalDurationSeconds)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="border-t border-slate-200 pt-6">
                <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    className="text-sm text-primary hover:underline"
                >
                    {showRaw ? 'הסתר פירוט אירועים' : 'הצג פירוט אירועים (לפי תאריך ועובד)'}
                </button>
                {showRaw && (
                    <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-end gap-2">
                            <input type="date" value={rawFrom} onChange={(e) => setRawFrom(e.target.value)} className="rounded border px-2 py-1 text-sm" />
                            <input type="date" value={rawTo} onChange={(e) => setRawTo(e.target.value)} className="rounded border px-2 py-1 text-sm" />
                            <select value={rawUserId} onChange={(e) => setRawUserId(e.target.value)} className="rounded border px-2 py-1 text-sm min-w-[120px]">
                                <option value="">כל עובד</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>{e.name || e.username}</option>
                                ))}
                            </select>
                            <select value={rawEntityType} onChange={(e) => setRawEntityType(e.target.value)} className="rounded border px-2 py-1 text-sm">
                                <option value="">כל סוג</option>
                                {Object.entries(ENTITY_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>{l}</option>
                                ))}
                            </select>
                            <button type="button" onClick={loadRaw} disabled={rawLoading} className="px-3 py-1.5 bg-slate-600 text-white rounded text-sm disabled:opacity-50">טען פירוט</button>
                        </div>
                        {rawLoading && rawEvents.length === 0 && <p className="text-slate-500 text-sm">טוען...</p>}
                        {rawEvents.length > 0 && (
                            <>
                                <p className="text-xs text-slate-500">מציג {rawEvents.length} מתוך {rawTotal} אירועים</p>
                                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                    <table className="min-w-full divide-y divide-slate-200 text-start text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-3 py-1.5 text-xs text-slate-500">עובד</th>
                                                <th className="px-3 py-1.5 text-xs text-slate-500">סוג</th>
                                                <th className="px-3 py-1.5 text-xs text-slate-500">ישות</th>
                                                <th className="px-3 py-1.5 text-xs text-slate-500">התחלה</th>
                                                <th className="px-3 py-1.5 text-xs text-slate-500">משך</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {rawEvents.map((e, i) => (
                                                <tr key={i}>
                                                    <td className="px-3 py-1.5">{e.username || e.userId}</td>
                                                    <td className="px-3 py-1.5">{ENTITY_LABELS[e.entityType] || e.entityType}</td>
                                                    <td className="px-3 py-1.5">{e.label || e.entityId || '—'}</td>
                                                    <td className="px-3 py-1.5 text-slate-600">{e.startedAt ? new Date(e.startedAt).toLocaleString('he-IL') : '—'}</td>
                                                    <td className="px-3 py-1.5">{e.durationSeconds != null ? formatDuration(e.durationSeconds) : (e.endedAt ? formatDuration(Math.round((new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 1000)) : '—')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <button type="button" disabled={rawPage <= 1} onClick={() => setRawPage((p) => p - 1)} className="px-2 py-1 border rounded text-sm disabled:opacity-50">הקודם</button>
                                    <span className="text-sm text-slate-600">עמוד {rawPage} מתוך {rawPages}</span>
                                    <button type="button" disabled={rawPage >= rawPages} onClick={() => setRawPage((p) => p + 1)} className="px-2 py-1 border rounded text-sm disabled:opacity-50">הבא</button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default UsageAndViewsTab;
