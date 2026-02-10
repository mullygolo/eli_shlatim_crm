import React, { useState, useCallback, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, LabelList,
} from 'recharts';
import { Employee } from '../types';
import { getViewEventsAggregated, getViewEventsRaw, getViewEventsChartData } from '../services/mongoService';
import type {
    ViewEventsAggregatedRow, ViewEvent,
    ViewEventsChartRowByHour, ViewEventsChartRowByDay, ViewEventsChartRowByEntity, ViewEventsChartRowByUser,
} from '../types';

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
    const [showDetailedPie, setShowDetailedPie] = useState(false);

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

    // Chart data
    const [chartByHour, setChartByHour] = useState<ViewEventsChartRowByHour[]>([]);
    const [chartByDay, setChartByDay] = useState<ViewEventsChartRowByDay[]>([]);
    const [chartByEntity, setChartByEntity] = useState<ViewEventsChartRowByEntity[]>([]);
    const [chartByUser, setChartByUser] = useState<ViewEventsChartRowByUser[]>([]);
    const [chartLoading, setChartLoading] = useState(false);
    const loadCharts = useCallback(async () => {
        setChartLoading(true);
        try {
            const [byHour, byDay, byEntity, byUser] = await Promise.all([
                getViewEventsChartData({ from, to, userId: userId || undefined, type: 'byHour' }),
                getViewEventsChartData({ from, to, userId: userId || undefined, type: 'byDay' }),
                getViewEventsChartData({ from, to, userId: userId || undefined, type: 'byEntity' }),
                getViewEventsChartData({ from, to, userId: userId || undefined, type: 'byUser' }),
            ]);
            setChartByHour(byHour.type === 'byHour' ? byHour.data : []);
            setChartByDay(byDay.type === 'byDay' ? byDay.data : []);
            setChartByEntity(byEntity.type === 'byEntity' ? byEntity.data : []);
            setChartByUser(byUser.type === 'byUser' ? byUser.data : []);
        } catch {
            setChartByHour([]);
            setChartByDay([]);
            setChartByEntity([]);
            setChartByUser([]);
        } finally {
            setChartLoading(false);
        }
    }, [from, to, userId]);
    useEffect(() => {
        loadCharts();
    }, [loadCharts]);

    const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b'];
    const formatMinutes = (sec: number) => `${Math.round(sec / 60)} דק׳`;

    // Pie: displayName per row, then aggregate by displayName (הזמנה/לקוח/ספק → פרוסה אחת לכל סוג)
    const PIE_TOP_N = 6;
    const pieDataWithOthers = (() => {
        if (!chartByEntity.length) return [];
        const total = chartByEntity.reduce((s, r) => s + r.totalDurationSeconds, 0);
        if (total === 0) return [];
        const withDisplayName = chartByEntity.map((r) => {
            const name = (r.entityType === 'route' && r.label) ? r.label : (ENTITY_LABELS[r.entityType] || r.entityType);
            return { ...r, displayName: name };
        });
        // איחוד לפי displayName – פרוסה אחת "הזמנה", אחת "לקוח", אחת "ספק", ומסכים נפרדים
        const byName = new Map<string, { displayName: string; totalDurationSeconds: number; entityType: string }>();
        for (const r of withDisplayName) {
            const cur = byName.get(r.displayName);
            if (cur) {
                cur.totalDurationSeconds += r.totalDurationSeconds;
            } else {
                byName.set(r.displayName, { displayName: r.displayName, totalDurationSeconds: r.totalDurationSeconds, entityType: r.entityType });
            }
        }
        const aggregated = Array.from(byName.values()).map((r) => ({
            ...r,
            percent: total ? Math.round((100 * r.totalDurationSeconds) / total) : 0,
        }));
        const sorted = [...aggregated].sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds);
        if (showDetailedPie) return sorted;
        const top = sorted.slice(0, PIE_TOP_N);
        const rest = sorted.slice(PIE_TOP_N);
        if (rest.length === 0) return top;
        const othersSum = rest.reduce((s, r) => s + r.totalDurationSeconds, 0);
        const othersPercent = total ? Math.round((100 * othersSum) / total) : 0;
        return [...top, { displayName: 'אחרים', totalDurationSeconds: othersSum, percent: othersPercent, entityType: '_others' }];
    })();
    // מקרא מפורש בעברית לכל צבע בעוגה (כותרת לכל פרוסה)
    const pieLegendPayload = pieDataWithOthers.map((item, i) => ({
        value: `${item.displayName} (${item.percent ?? 0}%)`,
        type: 'circle' as const,
        id: item.displayName,
        color: CHART_COLORS[i % CHART_COLORS.length],
    }));

    // By-user: שם לתצוגה – התאמה לפי id או username, אחרת username/userId
    const chartByUserWithName = chartByUser.map((r) => {
        const byId = employees.find((e) => e.id === r.userId)?.name;
        const byUsername = r.username ? employees.find((e) => e.username === r.username)?.name : undefined;
        const displayName = byId ?? byUsername ?? r.username ?? (r.userId ? `משתמש (${r.userId.slice(0, 8)}…)` : 'משתמש');
        return { ...r, displayName };
    });

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

            {/* Charts */}
            <div className="space-y-6">
                <h4 className="text-base font-bold text-slate-700">גרפי שימוש</h4>
                {chartLoading ? (
                    <p className="text-slate-500 py-4">טוען גרפים...</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-slate-600 mb-0.5">שימוש לפי שעה ביום (מתי יש עבודה)</h5>
                            <p className="text-xs text-slate-400 mb-2">כמה דקות בילו במערכת בכל שעה — סיכום לכל הטווח הנבחר. עמודה גבוהה = יותר פעילות באותה שעה.</p>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={chartByHour} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} fontSize={10} />
                                    <YAxis tickFormatter={(v) => `${Math.round(v / 60)}`} fontSize={10} label={{ value: 'דקות שימוש', position: 'insideTopLeft', style: { fill: '#64748b', fontSize: 10 } }} />
                                    <Tooltip formatter={(value: number) => [formatMinutes(value), 'דקות']} labelFormatter={(label) => `שעה ${label}:00`} contentStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="totalDurationSeconds" fill="#6366f1" name="דקות" radius={[4, 4, 0, 0]}>
                                        <LabelList dataKey="totalDurationSeconds" position="top" formatter={(v: number) => `${Math.round(v / 60)}`} style={{ fontSize: 10, fill: '#475569' }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-slate-600 mb-0.5">שימוש לפי יום (מגמה)</h5>
                            <p className="text-xs text-slate-400 mb-2">כמה דקות בילו במערכת בכל יום — כדי לראות מגמה. טווח: {from} עד {to}.</p>
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={chartByDay} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="dateKey" fontSize={10} />
                                    <YAxis tickFormatter={(v) => `${Math.round(v / 60)}`} fontSize={10} label={{ value: 'דקות שימוש', position: 'insideTopLeft', style: { fill: '#64748b', fontSize: 10 } }} />
                                    <Tooltip formatter={(value: number) => [formatMinutes(value), 'דקות']} contentStyle={{ fontSize: 12 }} />
                                    <Line type="monotone" dataKey="totalDurationSeconds" stroke="#8b5cf6" name="דקות" strokeWidth={2} dot={{ r: 3 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                <h5 className="text-sm font-semibold text-slate-600 mb-0.5">איפה במערכת (התפלגות)</h5>
                                <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={showDetailedPie} onChange={() => setShowDetailedPie((v) => !v)} className="rounded border-slate-300" />
                                    פאי מפורט (כל הקטגוריות)
                                </label>
                            </div>
                            <p className="text-xs text-slate-400 mb-2">חלוקת הזמן בין מסכים ומקומות במערכת (באחוזים). המקרא מציג את שם המסך/הישות ואחוז.</p>
                            <div className="flex items-start gap-4">
                                <div className="shrink-0 flex flex-col gap-1 text-xs text-slate-700" style={{ fontSize: 12 }}>
                                    {pieLegendPayload.map((entry, i) => (
                                        <div key={entry.id ?? i} className="flex items-center gap-2">
                                            <span className="shrink-0 w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                                            <span>{entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex-1 min-w-0" style={{ height: 220 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieDataWithOthers}
                                                dataKey="totalDurationSeconds"
                                                nameKey="displayName"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={70}
                                                label={({ displayName, percent }) => (showDetailedPie ? percent >= 4 : percent >= 8) ? `${displayName} ${percent}%` : ''}
                                            >
                                                {pieDataWithOthers.map((_, i) => (
                                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value: number, name: string, props: { payload?: { displayName?: string; percent?: number } }) => [
                                                    `${formatMinutes(value)} (${props.payload?.percent ?? 0}%)`,
                                                    props.payload?.displayName ?? name,
                                                ]}
                                                contentStyle={{ fontSize: 12 }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-slate-600 mb-0.5">השוואת עובדים (זמן במערכת)</h5>
                            <p className="text-xs text-slate-400 mb-2">השוואה בין עובדים: כמה דקות כל אחד בילה במערכת. שמות העובדים מופיעים משמאל.</p>
                            {chartByUserWithName.length === 0 ? (
                                <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                                    אין נתונים בטווח הנבחר
                                </div>
                            ) : (
                                <div dir="ltr" className="min-h-[220px] overflow-visible">
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={chartByUserWithName} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                                            <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 60)}`} fontSize={10} label={{ value: 'דקות שימוש', position: 'insideTopRight', style: { fill: '#64748b', fontSize: 10 } }} />
                                            <YAxis
                                                type="category"
                                                dataKey="displayName"
                                                width={140}
                                                interval={0}
                                                tick={(props: { x?: number; y?: number; payload?: { value?: string } }) => (
                                                    <g transform={`translate(${props.x},${props.y})`}>
                                                        <text x={-6} y={0} dy={4} fill="#334155" fontSize={11} textAnchor="end">
                                                            {String(props.payload?.value ?? '')}
                                                        </text>
                                                    </g>
                                                )}
                                            />
                                            <Tooltip formatter={(value: number) => [formatMinutes(value), 'דקות']} contentStyle={{ fontSize: 12 }} />
                                            <Bar dataKey="totalDurationSeconds" fill="#14b8a6" name="דקות" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>
                )}
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
