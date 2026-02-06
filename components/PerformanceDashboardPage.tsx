import React, { useState, useEffect, useCallback } from 'react';
import {
    PerformanceMetricsPayload,
    EmployeePerformanceMetrics,
    BusinessPerformanceSummary,
    ActivityScoreEntry,
    RedFlagOrder,
    Employee
} from '../types';
import { getPerformanceMetrics } from '../services/mongoService';

function todayIsrael(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

interface PerformanceDashboardPageProps {
    employees: Employee[];
    onNavigateToOrder?: (orderId: string) => void;
}

type TabId = 'business' | 'employees' | 'activity' | 'redflags';

const PerformanceDashboardPage: React.FC<PerformanceDashboardPageProps> = ({ employees, onNavigateToOrder }) => {
    const [tab, setTab] = useState<TabId>('business');
    const [from, setFrom] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    });
    const [to, setTo] = useState<string>(todayIsrael());
    const [employeeFilterId, setEmployeeFilterId] = useState<string>('');
    const [data, setData] = useState<PerformanceMetricsPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMetrics = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await getPerformanceMetrics({
                from: from || undefined,
                to: to || undefined,
                employeeId: employeeFilterId || undefined
            });
            setData(payload);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'שגיאה בטעינת נתונים');
        } finally {
            setLoading(false);
        }
    }, [from, to, employeeFilterId]);

    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);

    return (
        <div className="space-y-6 pb-24">
            <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
                <h1 className="text-2xl font-bold text-slate-800">דוח ביצועים ומדדי מכירות</h1>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">מתאריך</label>
                        <input
                            type="date"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">עד תאריך</label>
                        <input
                            type="date"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">עובד</label>
                        <select
                            value={employeeFilterId}
                            onChange={(e) => setEmployeeFilterId(e.target.value)}
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[140px]"
                        >
                            <option value="">הכל</option>
                            {employees.map((e) => (
                                <option key={e.id} value={e.id}>{e.name || e.username}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={fetchMetrics}
                        disabled={loading}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50"
                    >
                        {loading ? 'טוען...' : 'רענן'}
                    </button>
                </div>
            </div>

            {data && (
                <p className="text-xs text-slate-500">
                    חישובים מתאריך {data.metricsStartDate} (תאריך ישראל). טווח: {data.from || data.metricsStartDate} – {data.to || 'היום'}
                </p>
            )}

            <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                {([
                    { id: 'business' as TabId, label: 'ביצועי עסק' },
                    { id: 'employees' as TabId, label: 'ביצועי עובדים' },
                    { id: 'activity' as TabId, label: 'פעילות במערכת' },
                    { id: 'redflags' as TabId, label: 'נורות אדומות' }
                ]).map(({ id, label }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === id ? 'bg-white shadow text-primary' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}

            {loading && !data && <p className="text-slate-500 py-8">טוען נתונים...</p>}

            {data && !loading && (
                <>
                    {tab === 'business' && <BusinessTab summary={data.business} />}
                    {tab === 'employees' && <EmployeesTab employees={data.employees} onNavigateToOrder={onNavigateToOrder} />}
                    {tab === 'activity' && <ActivityTab entries={data.activityScore} />}
                    {tab === 'redflags' && <RedFlagsTab redFlags={data.redFlags} onNavigateToOrder={onNavigateToOrder} />}
                </>
            )}
        </div>
    );
};

function BusinessTab({ summary }: { summary: BusinessPerformanceSummary }) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                    <h3 className="text-xs font-medium text-slate-500 uppercase">סה"כ הזמנות</h3>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{summary.totalOrders}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                    <h3 className="text-xs font-medium text-slate-500 uppercase">סה"כ תמחיר</h3>
                    <p className="text-2xl font-bold text-slate-900 mt-1">₪{summary.totalAmount.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                    <h3 className="text-xs font-medium text-slate-500 uppercase">סה"כ רווח</h3>
                    <p className="text-2xl font-bold text-green-700 mt-1">₪{summary.totalProfit.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                    <h3 className="text-xs font-medium text-slate-500 uppercase">זמן סגירה ממוצע</h3>
                    <p className="text-2xl font-bold text-slate-900 mt-1">
                        {summary.avgClosingTimeHours != null ? `${Math.round(summary.avgClosingTimeHours)} שעות` : '—'}
                    </p>
                </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <h3 className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-800">מכירות לפי חודש</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-right">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500">חודש</th>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500">הזמנות</th>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500">תמחיר</th>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500">רווח</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {summary.salesByMonth.map((row) => (
                                <tr key={row.monthKey} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 text-sm font-medium text-slate-800">{row.label}</td>
                                    <td className="px-4 py-2 text-sm text-slate-600">{row.orderCount}</td>
                                    <td className="px-4 py-2 text-sm text-slate-600">₪{row.totalAmount.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-sm text-green-600">₪{row.totalProfit.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <h3 className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-800">התפלגות סטטוסים</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-right">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500">סטטוס</th>
                                <th className="px-4 py-2 text-xs font-medium text-slate-500">כמות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {summary.statusDistribution.map((row) => (
                                <tr key={row.statusLabel} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 text-sm font-medium text-slate-800">{row.statusLabel}</td>
                                    <td className="px-4 py-2 text-sm text-slate-600">{row.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function EmployeesTab({ employees: list, onNavigateToOrder }: { employees: EmployeePerformanceMetrics[]; onNavigateToOrder?: (id: string) => void }) {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">עובד</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">הזמנות</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">תמחיר</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">רווח</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">לקוחות</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">ממוצע ללקוח</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">לקוחות חדשים</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">שינויי סטטוס</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">שעות</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">עומס פתוח</th>
                            <th className="px-3 py-2 text-xs font-medium text-slate-500">הפסדים</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {list.map((m) => (
                            <tr key={m.employeeId} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium text-slate-800">{m.employeeName}</td>
                                <td className="px-3 py-2 text-slate-600">{m.orderCount}</td>
                                <td className="px-3 py-2 text-slate-600">₪{m.totalAmount.toLocaleString()}</td>
                                <td className="px-3 py-2 text-green-600">₪{m.totalProfit.toLocaleString()}</td>
                                <td className="px-3 py-2 text-slate-600">{m.uniqueCustomers}</td>
                                <td className="px-3 py-2 text-slate-600">₪{m.avgSalePerCustomer.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td className="px-3 py-2 text-slate-600">{m.newCustomersCreated}</td>
                                <td className="px-3 py-2 text-slate-600">{m.statusChangesCount}</td>
                                <td className="px-3 py-2 text-slate-600">{m.workHoursTotal.toFixed(1)}</td>
                                <td className="px-3 py-2 text-slate-600">{m.currentWorkloadOpen}</td>
                                <td className="px-3 py-2 text-red-600">{m.lostOrdersCount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ActivityTab({ entries }: { entries: ActivityScoreEntry[] }) {
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-2 text-xs font-medium text-slate-500">משתמש</th>
                            <th className="px-4 py-2 text-xs font-medium text-slate-500">ניקוד פעילות</th>
                            <th className="px-4 py-2 text-xs font-medium text-slate-500">פירוט פעולות</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sorted.map((e) => (
                            <tr key={e.userId} className="hover:bg-slate-50">
                                <td className="px-4 py-2 font-medium text-slate-800">{e.username}</td>
                                <td className="px-4 py-2 font-bold text-primary">{e.score}</td>
                                <td className="px-4 py-2 text-slate-600">
                                    {Object.entries(e.actionCounts).map(([action, count]) => (
                                        <span key={action} className="me-2 text-xs bg-slate-100 px-1.5 py-0.5 rounded">{action}: {count}</span>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function RedFlagsTab({ redFlags, onNavigateToOrder }: { redFlags: RedFlagOrder[]; onNavigateToOrder?: (id: string) => void }) {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <p className="px-4 py-2 text-sm text-slate-600 bg-amber-50 border-b border-amber-100">
                הזמנות ללא פעילות מעל 48 שעות (סטטוס ליד/פעיל).
            </p>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-2 text-xs font-medium text-slate-500">הזמנה</th>
                            <th className="px-4 py-2 text-xs font-medium text-slate-500">תיאור</th>
                            <th className="px-4 py-2 text-xs font-medium text-slate-500">סטטוס</th>
                            <th className="px-4 py-2 text-xs font-medium text-slate-500">עובד</th>
                            <th className="px-4 py-2 text-xs font-medium text-slate-500">שעות ללא פעילות</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {redFlags.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">אין נורות אדומות</td></tr>
                        )}
                        {redFlags.map((r) => (
                            <tr key={r.orderId} className="hover:bg-slate-50">
                                <td className="px-4 py-2">
                                    {onNavigateToOrder ? (
                                        <button onClick={() => onNavigateToOrder(r.orderId)} className="text-primary font-mono font-bold hover:underline">
                                            {r.orderNumber}
                                        </button>
                                    ) : (
                                        <span className="font-mono font-bold">{r.orderNumber}</span>
                                    )}
                                </td>
                                <td className="px-4 py-2 text-slate-700 max-w-xs truncate" title={r.description}>{r.description}</td>
                                <td className="px-4 py-2 text-slate-600">{r.orderStatus}</td>
                                <td className="px-4 py-2 text-slate-600">{r.employeeName}</td>
                                <td className="px-4 py-2 font-bold text-red-600">{r.hoursSinceActivity.toFixed(1)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default PerformanceDashboardPage;
