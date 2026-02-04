import React, { useState, useEffect, useCallback } from 'react';
import { Activity, ActivityEntityType, ActivityAction, Employee } from '../types';
import { getActivitiesFiltered } from '../services/mongoService';

const ENTITY_TYPE_LABELS: Record<string, string> = {
    order: 'הזמנה',
    customer: 'לקוח',
    supplier: 'ספק',
    employee: 'עובד',
    settings: 'הגדרות',
    quote: 'הצעת מחיר',
    transaction: 'תנועה',
    manual_event: 'אירוע יומן',
    finance: 'כספים',
    system: 'מערכת',
};

const ACTION_LABELS: Record<string, string> = {
    create: 'נוצר',
    update: 'עודכן',
    delete: 'נמחק',
    status_change: 'שינוי סטטוס',
    payment: 'תשלום',
    merge: 'מיזוג',
    sync: 'סנכרון',
    login: 'התחברות',
    logout: 'התנתקות',
    other: 'אחר',
};

const ENTITY_TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'הכל' },
    ...Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const ACTION_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'הכל' },
    ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

/** Hebrew labels for metadata keys (for display) */
const METADATA_KEY_LABELS: Record<string, string> = {
    orderNumber: 'הזמנה',
    oldStatus: 'היה',
    newStatus: 'הפך ל',
    name: 'שם',
    amount: 'סכום',
    victimName: 'מיזוג מ',
    targetName: 'לתוך',
    docType: 'סוג מסמך',
    paymentsCount: 'תשלומים',
    paymentsAdded: 'תשלומים שויכו',
    created: 'חדשים',
    updated: 'עודכנו',
    reference: 'אסמכתא',
    type: 'סוג',
    configId: 'מזהה',
    label: 'תווית',
    receivableId: 'גבייה',
    debtId: 'חוב',
};

function formatTimestamp(d: Date): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
}

interface ActivityDisplayDetails {
    beforeAfter: string | null;
    summary: string;
    detailLines: string[];
}

function formatActivityDetails(a: Activity): ActivityDisplayDetails {
    const meta = a.metadata || {};
    const beforeAfter: string | null =
        meta.oldStatus != null && meta.newStatus != null
            ? `היה: ${String(meta.oldStatus)} → הפך ל: ${String(meta.newStatus)}`
            : meta.oldValue != null && meta.newValue != null
                ? `היה: ${String(meta.oldValue)} → הפך ל: ${String(meta.newValue)}`
                : null;

    let summary = '';
    switch (a.action) {
        case 'status_change':
            if (meta.oldStatus != null && meta.newStatus != null) {
                summary = `מ־${String(meta.oldStatus)} ל־${String(meta.newStatus)}`;
            }
            if (meta.orderNumber) summary = `הזמנה ${meta.orderNumber}: ${summary || 'שינוי סטטוס'}`;
            break;
        case 'payment':
            if (typeof meta.amount === 'number') summary = `סכום: ₪${meta.amount.toLocaleString()}`;
            if (meta.name) summary = summary ? `${meta.name} — ${summary}` : String(meta.name);
            break;
        case 'merge':
            if (meta.victimName && meta.targetName) summary = `מ־${meta.victimName} לתוך ${meta.targetName}`;
            else if (meta.name) summary = String(meta.name);
            break;
        case 'create':
            if (meta.name) summary = `נוצר: ${meta.name}`;
            if (meta.orderNumber) summary = summary ? `${summary} (${meta.orderNumber})` : `הזמנה ${meta.orderNumber}`;
            break;
        case 'update':
            if (meta.orderNumber) summary = `הזמנה ${meta.orderNumber}`;
            if (meta.docType) summary = summary ? `${summary}, ${meta.docType}` : String(meta.docType);
            if (meta.paymentsAdded != null) summary = (summary ? summary + ', ' : '') + `${meta.paymentsAdded} תשלומים שויכו`;
            if (meta.label) summary = summary ? `${summary}; ${meta.label}` : String(meta.label);
            break;
        case 'sync':
            if (meta.created != null && meta.updated != null) summary = `חדשים: ${meta.created}, עודכנו: ${meta.updated}`;
            break;
        case 'delete':
            if (meta.label) summary = String(meta.label);
            break;
        default:
            if (meta.orderNumber) summary = `הזמנה ${meta.orderNumber}`;
            if (meta.name) summary = summary ? `${summary}; ${meta.name}` : String(meta.name);
    }

    const detailLines = Object.entries(meta).map(([k, v]) => {
        const label = METADATA_KEY_LABELS[k] ?? k;
        const val = typeof v === 'number' && (k === 'amount' || k === 'paymentsCount' || k === 'paymentsAdded' || k === 'created' || k === 'updated')
            ? (k === 'amount' ? `₪${v.toLocaleString()}` : String(v))
            : String(v);
        return `${label}: ${val}`;
    });

    return { beforeAfter, summary, detailLines };
}

function buildCsv(activities: Activity[]): string {
    const BOM = '\uFEFF';
    const header = 'תאריך,משתמש,פעולה,סוג ישות,תיאור,מה היה / מה קרה,מטא-נתונים';
    const rows = activities.map((a) => {
        const date = formatTimestamp(a.timestamp);
        const user = (a.username ?? a.userId ?? '-');
        const action = (a.action ? ACTION_LABELS[a.action] ?? a.action : '-');
        const entityType = (a.entityType ? ENTITY_TYPE_LABELS[a.entityType] ?? a.entityType : '-');
        const desc = (a.description ?? '').replace(/"/g, '""');
        const details = formatActivityDetails(a);
        const whatHappened = [details.beforeAfter, details.summary].filter(Boolean).join(' | ').replace(/"/g, '""');
        const meta = a.metadata ? JSON.stringify(a.metadata).replace(/"/g, '""') : '';
        return `"${date}","${user}","${action}","${entityType}","${desc}","${whatHappened}","${meta}"`;
    });
    return BOM + header + '\n' + rows.join('\n');
}

function downloadCsv(activities: Activity[], filename: string) {
    const csv = buildCsv(activities);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

interface LogsAndAuditTabProps {
    employees: Employee[];
    onNavigateToOrder?: (orderId: string) => void;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_EXPORT = 2000;

const INITIAL_FILTERS = { from: '', to: '', userId: '', entityType: '', action: '', search: '' };

const LogsAndAuditTab: React.FC<LogsAndAuditTabProps> = ({ employees, onNavigateToOrder }) => {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);

    const fetchLogs = useCallback(async (pageNum: number) => {
        setLoading(true);
        try {
            const result = await getActivitiesFiltered({
                from: appliedFilters.from || undefined,
                to: appliedFilters.to || undefined,
                userId: appliedFilters.userId || undefined,
                entityType: appliedFilters.entityType || undefined,
                action: appliedFilters.action || undefined,
                search: appliedFilters.search.trim() || undefined,
                page: pageNum,
                limit: pageSize,
            });
            setTotalCount(result.total);
            setActivities(result.activities);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
            setActivities([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [appliedFilters.from, appliedFilters.to, appliedFilters.userId, appliedFilters.entityType, appliedFilters.action, appliedFilters.search, pageSize]);

    useEffect(() => {
        fetchLogs(currentPage);
    }, [currentPage, pageSize, fetchLogs]);

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const handleApplyFilters = () => {
        setAppliedFilters(filters);
        setCurrentPage(1);
    };

    const handleExportCsv = async () => {
        setLoading(true);
        try {
            const result = await getActivitiesFiltered({
                from: appliedFilters.from || undefined,
                to: appliedFilters.to || undefined,
                userId: appliedFilters.userId || undefined,
                entityType: appliedFilters.entityType || undefined,
                action: appliedFilters.action || undefined,
                search: appliedFilters.search.trim() || undefined,
                page: 1,
                limit: MAX_EXPORT,
            });
            const dateStr = new Date().toISOString().slice(0, 10);
            downloadCsv(result.activities, `audit-log-${dateStr}.csv`);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">מתאריך</label>
                    <input
                        type="date"
                        value={filters.from}
                        onChange={(e) => handleFilterChange('from', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">עד תאריך</label>
                    <input
                        type="date"
                        value={filters.to}
                        onChange={(e) => handleFilterChange('to', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">משתמש</label>
                    <select
                        value={filters.userId}
                        onChange={(e) => handleFilterChange('userId', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[120px]"
                    >
                        <option value="">הכל</option>
                        {employees.map((e) => (
                            <option key={e.id} value={e.id}>{e.name || e.username}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">סוג ישות</label>
                    <select
                        value={filters.entityType}
                        onChange={(e) => handleFilterChange('entityType', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[120px]"
                    >
                        {ENTITY_TYPE_OPTIONS.map((o) => (
                            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">סוג פעולה</label>
                    <select
                        value={filters.action}
                        onChange={(e) => handleFilterChange('action', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[120px]"
                    >
                        {ACTION_OPTIONS.map((o) => (
                            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">חיפוש בתיאור</label>
                    <input
                        type="text"
                        value={filters.search}
                        onChange={(e) => handleFilterChange('search', e.target.value)}
                        placeholder="טקסט חופשי"
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm w-40"
                    />
                </div>
                <button
                    onClick={handleApplyFilters}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 text-sm"
                >
                    החל סינון
                </button>
                <button
                    onClick={handleExportCsv}
                    disabled={loading}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 text-sm disabled:opacity-50"
                >
                    ייצוא CSV
                </button>
            </div>

            {loading && activities.length === 0 ? (
                <p className="text-slate-500 py-8">טוען...</p>
            ) : (
                <div className="bg-white shadow-md rounded-lg overflow-hidden border border-slate-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-start">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase">תאריך/שעה</th>
                                    <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase">משתמש</th>
                                    <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase">פעולה</th>
                                    <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase">ישות</th>
                                    <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase">תיאור</th>
                                    <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase">מה היה / מה קרה</th>
                                    <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase">פרטים מלאים</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {activities.map((a) => {
                                    const details = formatActivityDetails(a);
                                    return (
                                        <tr key={a.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-2 text-sm text-slate-600 whitespace-nowrap">
                                                {formatTimestamp(a.timestamp)}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-slate-700">
                                                {a.username ?? a.userId ?? '-'}
                                            </td>
                                            <td className="px-4 py-2 text-sm">
                                                {a.action ? (
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                                                        {ACTION_LABELS[a.action] ?? a.action}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-2 text-sm">
                                                {a.entityType ? (
                                                    <span className="text-slate-700">
                                                        {ENTITY_TYPE_LABELS[a.entityType] ?? a.entityType}
                                                        {a.entityId && onNavigateToOrder && a.entityType === 'order' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => onNavigateToOrder(a.entityId!)}
                                                                className="mr-1 text-primary hover:underline"
                                                            >
                                                                #{a.metadata?.orderNumber ?? a.entityId.slice(0, 8)}
                                                            </button>
                                                        ) : a.entityId ? (
                                                            <span className="text-slate-500"> ({a.entityId.slice(0, 8)}…)</span>
                                                        ) : null}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-slate-800 max-w-md truncate" title={a.description}>
                                                {a.description}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-slate-700 max-w-xs">
                                                {details.beforeAfter ? (
                                                    <span className="block font-medium text-slate-800">{details.beforeAfter}</span>
                                                ) : null}
                                                {details.summary ? (
                                                    <span className="block text-slate-600">{details.summary}</span>
                                                ) : null}
                                                {!details.beforeAfter && !details.summary && '-'}
                                            </td>
                                            <td className="px-4 py-2 text-sm">
                                                {details.detailLines.length > 0 ? (
                                                    <div className="text-xs text-slate-500 space-y-0.5" title={details.detailLines.join('\n')}>
                                                        {details.detailLines.map((line, i) => (
                                                            <div key={i}>{line}</div>
                                                        ))}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination bar - same pattern as CustomersPage, OrdersPage */}
                    {totalCount > 0 && (
                        <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200">
                            <div className="flex items-center gap-4">
                                <div className="text-sm text-slate-600">
                                    מציג {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} מתוך {totalCount} לוגים
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-slate-600">שורות לעמוד:</label>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="text-sm border border-slate-300 rounded px-2 py-1 focus:ring-primary focus:border-primary"
                                    >
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={200}>200</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1 || loading}
                                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    ראשון
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1 || loading}
                                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    קודם
                                </button>
                                <span className="px-3 py-1 text-sm text-slate-600">
                                    עמוד {currentPage} מתוך {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage >= totalPages || loading}
                                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    הבא
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage >= totalPages || loading}
                                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    אחרון
                                </button>
                            </div>
                        </div>
                    )}

                    {loading && activities.length > 0 && (
                        <div className="py-2 text-center text-slate-500 text-sm border-t border-slate-100">טוען...</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LogsAndAuditTab;
