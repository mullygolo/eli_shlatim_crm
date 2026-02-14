import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CallLog, type Customer, type Contact } from '../types';
import { PhoneIcon, ImportIcon } from './icons';
import Modal from './Modal';
import CustomerSyncBadges from './CustomerSyncBadges';
import { getCallLogsPaginated, getCallLogsStats, getCallLogsAgents, getCallLogsChartData, inferCallLogDirection, syncCallLogs, getCallLogRecordingBlob, matchPhones, matchSupplierPhones, getRelevantOrdersForCustomers, getCustomersPaginated, getCustomerById, updateCustomer, type RelevantOrderSummary, type CallLogsStatsResult, type CallLogsAgentItem, type CustomerPhoneMatch, type SupplierPhoneMatch, type CallLogsChartPoint, type CallLogsChartGranularity } from '../services/mongoService';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const normalizePhone = (s: string): string => (s || '').replace(/\D/g, '');

export interface CallCenterPageProps {
    onNavigateToPage?: (page: import('../types').Page) => void;
    setSelectedCustomerId?: (id: string | null) => void;
    onNewOrderWithCustomer?: (customerId: string) => void;
    onNewOrderWithPhone?: (phone: string) => void;
    onNewCustomerWithPhone?: (phone: string) => void;
    onNavigateToOrder?: (orderId: string) => void;
}

const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

/** Format date as YYYY-MM-DD in local timezone (so "today" matches the user's day). */
const toDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

type DatePreset = 'all' | 'today' | '7d' | '30d' | 'month' | 'prevMonth' | 'year' | 'custom';

function getPresetRange(preset: DatePreset, customStart: string, customEnd: string): { start: string; end: string } {
    if (preset === 'all') return { start: '', end: '' };
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);
    switch (preset) {
        case 'today':
            return { start: toDateString(today), end: toDateString(today) };
        case '7d':
            start.setDate(today.getDate() - 6);
            return { start: toDateString(start), end: toDateString(end) };
        case '30d':
            start.setDate(today.getDate() - 29);
            return { start: toDateString(start), end: toDateString(end) };
        case 'month':
            start.setDate(1);
            return { start: toDateString(start), end: toDateString(end) };
        case 'prevMonth':
            start.setMonth(today.getMonth() - 1);
            start.setDate(1);
            end.setDate(0); // last day of previous month
            return { start: toDateString(start), end: toDateString(end) };
        case 'year':
            start.setMonth(0, 1);
            return { start: toDateString(start), end: toDateString(end) };
        case 'custom':
        default:
            return { start: customStart || toDateString(today), end: customEnd || toDateString(today) };
    }
}

const formatDateTime = (d: Date): string => {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleString('he-IL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const isAnswered = (status: string): boolean => {
    const u = (status || '').toUpperCase();
    return u === 'ANSWER' || u === 'ANSWERED';
};

/** Build the public webhook URL for the call center (no auth). */
function getWebhookCallsUrl(): string {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const base = apiUrl.startsWith('http') ? apiUrl.replace(/\/api\/?$/, '') : (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base || ''}/api/webhook/calls`;
}

/** Format customer for display: contact name · customer name when contact exists, else customer name. */
const formatCustomerDisplay = (m: CustomerPhoneMatch): string =>
    m.contactName ? `${m.contactName} · ${m.customerName}` : m.customerName;

/** Format supplier badge text: include contact name when present. */
const formatSupplierDisplay = (s: SupplierPhoneMatch): string =>
    s.contactName ? `ספק: ${s.supplierName} (איש קשר: ${s.contactName})` : `ספק: ${s.supplierName}`;

const CallCenterPage: React.FC<CallCenterPageProps> = ({ onNavigateToPage, setSelectedCustomerId, onNewOrderWithCustomer, onNewOrderWithPhone, onNewCustomerWithPhone, onNavigateToOrder }) => {
    const [logs, setLogs] = useState<CallLog[]>([]);
    const [phoneMatches, setPhoneMatches] = useState<Record<string, CustomerPhoneMatch[]>>({});
    const [supplierMatches, setSupplierMatches] = useState<Record<string, SupplierPhoneMatch[]>>({});
    const [relevantOrdersByCustomer, setRelevantOrdersByCustomer] = useState<Record<string, RelevantOrderSummary[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [playingLog, setPlayingLog] = useState<CallLog | null>(null);
    const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
    const [openCustomerDropdownLogId, setOpenCustomerDropdownLogId] = useState<string | null>(null);
    const customerDropdownRef = useRef<HTMLDivElement>(null);
    const [openOrdersDropdownLogId, setOpenOrdersDropdownLogId] = useState<string | null>(null);
    const [ordersDropdownAnchor, setOrdersDropdownAnchor] = useState<{ top: number; left: number; width: number; height: number; customerId: string } | null>(null);
    const ordersDropdownRef = useRef<HTMLDivElement>(null);
    const [playingAudioLoading, setPlayingAudioLoading] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncLoading, setSyncLoading] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
    const [syncStartDate, setSyncStartDate] = useState('');
    const [syncEndDate, setSyncEndDate] = useState('');
    const [webhookCopied, setWebhookCopied] = useState(false);
    const [addContactForPhone, setAddContactForPhone] = useState<string | null>(null);
    const [addContactSearchTerm, setAddContactSearchTerm] = useState('');
    const [addContactDebouncedSearchTerm, setAddContactDebouncedSearchTerm] = useState('');
    const [addContactSearchResults, setAddContactSearchResults] = useState<Customer[]>([]);
    const [addContactSearchLoading, setAddContactSearchLoading] = useState(false);
    const [addContactSelectedId, setAddContactSelectedId] = useState<string | null>(null);
    const [addContactName, setAddContactName] = useState('');
    const [addContactEmail, setAddContactEmail] = useState('');
    const [addContactSaving, setAddContactSaving] = useState(false);
    const addContactSearchInputRef = useRef<HTMLInputElement>(null);

    // Summary stats: date range and agent filter (default 'all' so all calls are visible)
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const { start: statsStartDate, end: statsEndDate } = getPresetRange(datePreset, customStartDate, customEndDate);
    const [statsCallee, setStatsCallee] = useState('');
    const [stats, setStats] = useState<CallLogsStatsResult | null>(null);
    const [agents, setAgents] = useState<CallLogsAgentItem[]>([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [inferLoading, setInferLoading] = useState(false);
    const [chartData, setChartData] = useState<CallLogsChartPoint[]>([]);
    const [chartLoading, setChartLoading] = useState(false);

    /** Parse selected agent filter: value is "forward:X" or "callee:X" → { callee?, forward? } for API */
    const agentFilter = React.useMemo(() => {
        if (!statsCallee.trim()) return {};
        if (statsCallee.startsWith('forward:')) return { forward: statsCallee.slice(8).trim() };
        if (statsCallee.startsWith('callee:')) return { callee: statsCallee.slice(7).trim() };
        return {};
    }, [statsCallee]);

    const { chartGranularity, chartStartDate, chartEndDate } = React.useMemo(() => {
        let granularity: CallLogsChartGranularity = 'day';
        let start = statsStartDate;
        let end = statsEndDate;
        if (datePreset === 'all') {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 12);
            start = toDateString(startDate);
            end = toDateString(endDate);
            granularity = 'month';
        } else if (datePreset === 'today') {
            granularity = 'hour';
        } else if (datePreset === '7d' || datePreset === '30d' || datePreset === 'month' || datePreset === 'prevMonth') {
            granularity = 'day';
        } else if (datePreset === 'year') {
            granularity = 'month';
        } else if (datePreset === 'custom' && customStartDate && customEndDate) {
            const a = new Date(customStartDate);
            const b = new Date(customEndDate);
            const days = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
            if (days <= 31) granularity = 'day';
            else if (days <= 90) granularity = 'week';
            else granularity = 'month';
        }
        return { chartGranularity: granularity, chartStartDate: start, chartEndDate: end };
    }, [datePreset, statsStartDate, statsEndDate, customStartDate, customEndDate]);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

    useEffect(() => {
        let cancelled = false;
        if (stats === null) setStatsLoading(true);
        getCallLogsStats({
            startDate: statsStartDate || undefined,
            endDate: statsEndDate || undefined,
            ...agentFilter,
        })
            .then((data) => {
                if (!cancelled) setStats(data);
            })
            .catch(() => {
                if (!cancelled) setStats(null);
            })
            .finally(() => {
                if (!cancelled) setStatsLoading(false);
            });
        return () => { cancelled = true; };
    }, [statsStartDate, statsEndDate, agentFilter, refreshKey]);

    useEffect(() => {
        let cancelled = false;
        getCallLogsAgents({
            startDate: statsStartDate || undefined,
            endDate: statsEndDate || undefined,
        })
            .then((list) => {
                if (!cancelled) setAgents(list);
            })
            .catch(() => {
                if (!cancelled) setAgents([]);
            });
        return () => { cancelled = true; };
    }, [statsStartDate, statsEndDate, refreshKey]);

    useEffect(() => {
        if (!chartStartDate || !chartEndDate) {
            setChartData([]);
            return;
        }
        let cancelled = false;
        if (chartData.length === 0) setChartLoading(true);
        getCallLogsChartData({
            startDate: chartStartDate,
            endDate: chartEndDate,
            ...agentFilter,
            granularity: chartGranularity,
        })
            .then((data) => {
                if (!cancelled) setChartData(data || []);
            })
            .catch(() => {
                if (!cancelled) setChartData([]);
            })
            .finally(() => {
                if (!cancelled) setChartLoading(false);
            });
        return () => { cancelled = true; };
    }, [chartStartDate, chartEndDate, agentFilter, chartGranularity, refreshKey]);

    useEffect(() => {
        let cancelled = false;
        if (logs.length === 0) setLoading(true);
        setError(null);
        getCallLogsPaginated(
            {
                searchTerm: debouncedSearchTerm || undefined,
                startDate: statsStartDate || undefined,
                endDate: statsEndDate || undefined,
                ...agentFilter,
            },
            currentPage,
            pageSize
        )
            .then((result) => {
                if (!cancelled) {
                    setLogs(result.logs);
                    setTotalCount(result.totalCount);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [currentPage, pageSize, debouncedSearchTerm, statsStartDate, statsEndDate, agentFilter, refreshKey]);

    // רענון אוטומטי כל 2 שניות – נתונים בזמן אמת מהשרת (מתעדכן דרך webhook מהמרכזיה)
    useEffect(() => {
        if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const onVisible = () => { if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    useEffect(() => {
        if (logs.length === 0) {
            setPhoneMatches({});
            setSupplierMatches({});
            return;
        }
        const phones = [...new Set(logs.flatMap((log) => [log.caller, log.callee].filter(Boolean).map(String)))];
        matchPhones(phones)
            .then(setPhoneMatches)
            .catch(() => setPhoneMatches({}));
        matchSupplierPhones(phones)
            .then(setSupplierMatches)
            .catch(() => setSupplierMatches({}));
    }, [logs]);

    useEffect(() => {
        if (!addContactForPhone) {
            setAddContactSearchTerm('');
            setAddContactDebouncedSearchTerm('');
            setAddContactSearchResults([]);
            setAddContactSelectedId(null);
            setAddContactName('');
            setAddContactEmail('');
            return;
        }
        setAddContactSearchTerm('');
        setAddContactDebouncedSearchTerm('');
        setAddContactSearchResults([]);
        setAddContactSelectedId(null);
        setAddContactName('');
        setAddContactEmail('');
    }, [addContactForPhone]);

    useEffect(() => {
        if (!addContactForPhone) return;
        const t = setTimeout(() => setAddContactDebouncedSearchTerm(addContactSearchTerm), 350);
        return () => clearTimeout(t);
    }, [addContactForPhone, addContactSearchTerm]);

    useEffect(() => {
        setAddContactName('');
        setAddContactEmail('');
    }, [addContactSelectedId]);

    useEffect(() => {
        if (!addContactForPhone) return;
        const term = addContactDebouncedSearchTerm.trim();
        if (term.length === 0) {
            setAddContactSearchResults([]);
            setAddContactSearchLoading(false);
            return;
        }
        const ac = new AbortController();
        setAddContactSearchLoading(true);
        getCustomersPaginated({ searchTerm: term }, 1, 20, { signal: ac.signal })
            .then((res) => {
                setAddContactSearchResults(res.customers || []);
                setAddContactSelectedId(null);
            })
            .catch((err) => {
                if (err?.name !== 'AbortError') setAddContactSearchResults([]);
            })
            .finally(() => {
                if (!ac.signal.aborted) setAddContactSearchLoading(false);
            });
        return () => ac.abort();
    }, [addContactForPhone, addContactDebouncedSearchTerm]);

    useEffect(() => {
        if (addContactForPhone && addContactSearchInputRef.current) {
            const t = setTimeout(() => addContactSearchInputRef.current?.focus(), 100);
            return () => clearTimeout(t);
        }
    }, [addContactForPhone]);

    const fetchRelevantOrders = React.useCallback(() => {
        const customerIds = [...new Set(Object.values(phoneMatches).flat().map(m => m.customerId))];
        if (customerIds.length === 0) {
            setRelevantOrdersByCustomer({});
            return;
        }
        getRelevantOrdersForCustomers(customerIds)
            .then(setRelevantOrdersByCustomer)
            .catch(() => setRelevantOrdersByCustomer({}));
    }, [phoneMatches]);

    useEffect(() => {
        fetchRelevantOrders();
    }, [fetchRelevantOrders]);

    // Refetch relevant orders when user returns to the tab (e.g. after editing orders elsewhere)
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                const customerIds = [...new Set(Object.values(phoneMatches).flat().map(m => m.customerId))];
                if (customerIds.length > 0) {
                    getRelevantOrdersForCustomers(customerIds)
                        .then(setRelevantOrdersByCustomer)
                        .catch(() => {});
                }
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [phoneMatches]);

    useEffect(() => {
        if (!openCustomerDropdownLogId && !openOrdersDropdownLogId) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const inCustomer = customerDropdownRef.current?.contains(target);
            const inOrders = ordersDropdownRef.current?.contains(target);
            if (!inCustomer && !inOrders) {
                setOpenCustomerDropdownLogId(null);
                setOpenOrdersDropdownLogId(null);
                setOrdersDropdownAnchor(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openCustomerDropdownLogId, openOrdersDropdownLogId]);

    useEffect(() => {
        if (!playingLog) {
            setPlayingAudioUrl(null);
            setPlayingAudioLoading(false);
            return;
        }
        if (playingLog.hasStoredRecording) {
            setPlayingAudioUrl(null);
            setPlayingAudioLoading(true);
            let cancelled = false;
            getCallLogRecordingBlob(playingLog.uniqueId)
                .then((blob) => {
                    if (cancelled) return;
                    setPlayingAudioUrl(URL.createObjectURL(blob));
                })
                .catch(() => {
                    if (!cancelled) setPlayingAudioUrl(null);
                })
                .finally(() => {
                    if (!cancelled) setPlayingAudioLoading(false);
                });
            return () => {
                cancelled = true;
            };
        }
        setPlayingAudioUrl(playingLog.file || null);
        setPlayingAudioLoading(false);
    }, [playingLog]);

    const handleSync = async () => {
        if (!syncStartDate || !syncEndDate) {
            setSyncError('נא לבחור תאריך התחלה ותאריך סיום');
            return;
        }

        setSyncLoading(true);
        setSyncError(null);
        setSyncSuccess(null);

        try {
            const result = await syncCallLogs(syncStartDate, syncEndDate);
            setSyncSuccess(result.message);
            setCurrentPage(1);
            getCallLogsPaginated(
                {
                    searchTerm: debouncedSearchTerm || undefined,
                    startDate: statsStartDate || undefined,
                    endDate: statsEndDate || undefined,
                    ...agentFilter,
                },
                1,
                pageSize
            )
                .then((r) => {
                    setLogs(r.logs);
                    setTotalCount(r.totalCount);
                })
                .catch(() => {});
            // Auto-close modal after 2 seconds
            setTimeout(() => {
                setShowSyncModal(false);
                setSyncStartDate('');
                setSyncEndDate('');
                setSyncSuccess(null);
            }, 2000);
        } catch (err) {
            setSyncError(err instanceof Error ? err.message : String(err));
        } finally {
            setSyncLoading(false);
        }
    };

    // Set default date range (last 30 days)
    useEffect(() => {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        setSyncEndDate(today.toISOString().split('T')[0]);
        setSyncStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
    }, []);

    const webhookUrl = getWebhookCallsUrl();
    const handleCopyWebhook = async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            setWebhookCopied(true);
            setTimeout(() => setWebhookCopied(false), 2000);
        } catch {
            setWebhookCopied(false);
        }
    };

    if (error && logs.length === 0) {
        return (
            <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center" dir="rtl">
                <p className="text-red-800 font-semibold">שגיאה בטעינת לוג השיחות</p>
                <p className="text-red-600 mt-2">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700">
                    <PhoneIcon className="h-6 w-6" />
                    <h2 className="text-lg font-semibold">לוג שיחות מרכזייה</h2>
                </div>
                <button
                    type="button"
                    onClick={() => setShowSyncModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition"
                >
                    <ImportIcon className="h-5 w-5" />
                    סנכרן היסטוריה מהמרכזיה
                </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700 mb-2">
                    הגדרת המרכזיה: הזן את הכתובת הבאה בשדה Webhook URL במערכת המרכזיה
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 min-w-0 text-sm text-slate-800 bg-white border border-slate-200 rounded px-3 py-2 font-mono break-all">
                        {webhookUrl}
                    </code>
                    <button
                        type="button"
                        onClick={handleCopyWebhook}
                        className="inline-flex items-center gap-1.5 shrink-0 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                    >
                        <CopyIcon className="h-4 w-4" />
                        {webhookCopied ? 'הועתק!' : 'העתק'}
                    </button>
                </div>
            </div>

            {error && logs.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-red-800 text-sm">
                    {error}
                </div>
            )}

            {/* Chart: calls over time (incoming / outgoing) - same range as tab */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">שיחות לאורך תקופה (נכנס / יוצא)</h3>
                {chartLoading ? (
                    <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm">טוען גרף...</div>
                ) : !chartStartDate || !chartEndDate ? (
                    <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm">בחר טווח תאריכים להצגת גרף</div>
                ) : chartData.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm">אין שיחות בטווח הנבחר</div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                tickFormatter={(value) => {
                                    if (chartGranularity === 'hour') {
                                        const m = value.match(/(\d{4}-\d{2}-\d{2})T(\d{2})/);
                                        return m ? `${m[2]}:00` : value;
                                    }
                                    if (chartGranularity === 'day' && value.length >= 10) {
                                        const d = new Date(value + 'T12:00:00');
                                        return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
                                    }
                                    if (chartGranularity === 'month' && value.length >= 7) {
                                        const d = new Date(value + '-01T12:00:00');
                                        return d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });
                                    }
                                    if (chartGranularity === 'week') return value;
                                    return value;
                                }}
                            />
                            <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{ textAlign: 'right', direction: 'rtl', padding: '8px 12px' }}
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const formatLabel = (value: string) => {
                                        if (chartGranularity === 'hour') return `שעה: ${value}`;
                                        if (chartGranularity === 'day') return new Date(value + 'T12:00:00').toLocaleDateString('he-IL');
                                        if (chartGranularity === 'month') return new Date(value + '-01').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
                                        return value;
                                    };
                                    const inc = payload.find((p) => p.name === 'incoming')?.value ?? 0;
                                    const out = payload.find((p) => p.name === 'outgoing')?.value ?? 0;
                                    const total = Number(inc) + Number(out);
                                    return (
                                        <div className="bg-white border border-slate-200 rounded-lg shadow-lg text-sm">
                                            <p className="font-medium text-slate-800 border-b border-slate-100 px-2 py-1">{formatLabel(String(label))}</p>
                                            <div className="px-2 py-1.5 space-y-0.5">
                                                <div className="text-emerald-700">נכנס: {inc} שיחות</div>
                                                <div className="text-violet-700">יוצא: {out} שיחות</div>
                                                <div className="text-slate-700 font-medium pt-1 border-t border-slate-100 mt-1">סה״כ: {total} שיחות</div>
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <Legend wrapperStyle={{ direction: 'rtl' }} formatter={(label) => (label === 'incoming' ? 'נכנס' : 'יוצא')} />
                            <Line type="monotone" dataKey="incoming" name="incoming" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            <Line type="monotone" dataKey="outgoing" name="outgoing" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Summary stats: date range + agent filter + cards */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">טווח תאריכים:</span>
                    <button
                        type="button"
                        onClick={() => { setDatePreset('all'); setCurrentPage(1); }}
                        title="סיכום וגרף מוגבלים ל־12 חודשים אחרונים"
                        className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                            datePreset === 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        הכל
                    </button>
                    {(['today', '7d', '30d', 'month', 'prevMonth', 'year'] as const).map((p) => (
                        <button
                            key={p}
                            type="button"
                            title={
                                p === 'today' ? 'שיחות מהיום בלבד' :
                                p === '7d' ? 'שיחות מ־7 הימים האחרונים (כולל היום)' :
                                p === '30d' ? 'שיחות מ־30 הימים האחרונים (כולל היום)' :
                                p === 'month' ? 'שיחות מתחילת החודש הנוכחי עד היום' :
                                p === 'prevMonth' ? 'שיחות מהחודש שעבר (כולו)' :
                                'שיחות מתחילת השנה עד היום'
                            }
                            onClick={() => { setDatePreset(p); setCurrentPage(1); }}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                                datePreset === p
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                            {p === 'today' && 'היום'}
                            {p === '7d' && '7 ימים'}
                            {p === '30d' && '30 יום'}
                            {p === 'month' && 'החודש'}
                            {p === 'prevMonth' && 'החודש שעבר'}
                            {p === 'year' && 'השנה'}
                        </button>
                    ))}
                    <button
                        type="button"
                        title="בחר תאריך התחלה ותאריך סיום"
                        onClick={() => { setDatePreset('custom'); setCurrentPage(1); }}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                            datePreset === 'custom' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        מותאם אישית
                    </button>
                    {datePreset === 'custom' && (
                        <span className="flex items-center gap-2 text-sm">
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="px-2 py-1.5 border border-slate-300 rounded focus:ring-primary focus:border-primary"
                            />
                            <span>עד</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="px-2 py-1.5 border border-slate-300 rounded focus:ring-primary focus:border-primary"
                            />
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="text-sm text-slate-600">לפי נציג/שלוחה:</label>
                    <select
                        value={statsCallee}
                        onChange={(e) => { setStatsCallee(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-primary focus:border-primary text-sm min-w-[180px]"
                    >
                        <option value="">הכל</option>
                        {agents.map((a) => (
                            <option key={a.value} value={a.value}>
                                {a.label}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => {
                            setInferLoading(true);
                            inferCallLogDirection()
                                .then((r) => {
                                    setRefreshKey((k) => k + 1);
                                    if (r.updated > 0) setCurrentPage(1);
                                })
                                .finally(() => setInferLoading(false));
                        }}
                        disabled={inferLoading}
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        title="חשב מחדש נכנס/יוצא לשיחות עם כיוון לא מסווג (לפי מספרי נציגים)"
                    >
                        {inferLoading ? 'מחשב...' : 'חשב מחדש כיוון'}
                    </button>
                </div>
                {statsLoading ? (
                    <p className="text-sm text-slate-500">טוען סיכום...</p>
                ) : stats ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                            <p className="text-xs text-slate-500 mb-0.5">סה&quot;כ שיחות</p>
                            <p className="text-lg font-semibold text-slate-800">{stats.totalCalls}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                            <p className="text-xs text-slate-500 mb-0.5">נכנסות</p>
                            <p className="text-lg font-semibold text-slate-800">{stats.incomingCount}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                            <p className="text-xs text-slate-500 mb-0.5">יוצאות</p>
                            <p className="text-lg font-semibold text-slate-800">{stats.outgoingCount}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                            <p className="text-xs text-slate-500 mb-0.5">לא נענו</p>
                            <p className="text-lg font-semibold text-slate-800">{stats.unansweredCount}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                            <p className="text-xs text-slate-500 mb-0.5">זמן שיחה מצטבר</p>
                            <p className="text-lg font-semibold text-slate-800">{formatDuration(stats.totalDurationSeconds)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                            <p className="text-xs text-slate-500 mb-0.5">זמן שיחות נכנסות</p>
                            <p className="text-lg font-semibold text-slate-800">{formatDuration(stats.totalDurationIncoming)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                            <p className="text-xs text-slate-500 mb-0.5">זמן שיחות יוצאות</p>
                            <p className="text-lg font-semibold text-slate-800">{formatDuration(stats.totalDurationOutgoing)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3" title="שיחות שהמרכזיה לא שלחה עבורן כיוון (נכנס/יוצא)">
                            <p className="text-xs text-slate-500 mb-0.5">זמן לא מסווג</p>
                            <p className="text-lg font-semibold text-slate-800">{formatDuration(stats.totalDurationUnknown ?? 0)}</p>
                        </div>
                        {/* Average duration row */}
                        {(() => {
                            const answeredCount = stats.totalCalls - stats.unansweredCount;
                            const avgAll = answeredCount > 0 ? Math.round(stats.totalDurationSeconds / answeredCount) : 0;
                            const avgIn = stats.incomingCount > 0 ? Math.round(stats.totalDurationIncoming / stats.incomingCount) : 0;
                            const avgOut = stats.outgoingCount > 0 ? Math.round(stats.totalDurationOutgoing / stats.outgoingCount) : 0;
                            return (
                                <>
                                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-8 border-t-2 border-slate-300">
                                        <p className="text-xs font-medium text-slate-600 mb-1">זמן שיחה ממוצע</p>
                                    </div>
                                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                                        <p className="text-xs text-slate-500 mb-0.5">זמן ממוצע (כללי)</p>
                                        <p className="text-lg font-semibold text-slate-800">{avgAll ? formatDuration(avgAll) : '—'}</p>
                                    </div>
                                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                                        <p className="text-xs text-slate-500 mb-0.5">זמן ממוצע נכנס</p>
                                        <p className="text-lg font-semibold text-slate-800">{avgIn ? formatDuration(avgIn) : '—'}</p>
                                    </div>
                                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                                        <p className="text-xs text-slate-500 mb-0.5">זמן ממוצע יוצא</p>
                                        <p className="text-lg font-semibold text-slate-800">{avgOut ? formatDuration(avgOut) : '—'}</p>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                    חיפוש (מתקשר, נציג):
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1);
                        }}
                        placeholder="מספר או טקסט..."
                        className="w-48 px-3 py-2 border border-slate-300 rounded-lg focus:ring-primary focus:border-primary text-sm"
                    />
                </label>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-start">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תאריך ושעה</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">כיוון</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">לקוח</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">מתקשר</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider" title="המספר שהלקוח חייג אליו (קו)">לאיזה מספר חייג</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">נציג</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">משך</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider" title="זמן עד מענה – כמה שניות צלצלה השיחה עד שנענתה">זמן מענה</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider" title="משך השיחה מרגע המענה עד סיום – זמן הדיבור בפועל">דיבור בפועל</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">מי ניתק</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סטטוס</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">פעולה</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {loading && logs.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                                        טוען לוג שיחות...
                                    </td>
                                </tr>
                            ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                        {formatDateTime(log.startDate)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                        {log.direction === 'incoming' ? 'נכנס' : log.direction === 'outgoing' ? 'יוצא' : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-700 max-w-[220px] align-top">
                                        {(() => {
                                            const phone = log.caller || log.callee || '';
                                            const callerNorm = normalizePhone(log.caller || '');
                                            const calleeNorm = normalizePhone(log.callee || '');
                                            const matches = phoneMatches[callerNorm] || phoneMatches[calleeNorm];
                                            const supplierList = supplierMatches[callerNorm] || supplierMatches[calleeNorm] || [];
                                            const hasPhone = (phone || '').replace(/\D/g, '').length >= 6;
                                            const canOpen = onNavigateToPage && setSelectedCustomerId;
                                            const canNewOrder = !!onNewOrderWithCustomer;
                                            const canNewOrderFromPhone = hasPhone && !!onNewOrderWithPhone;
                                            const canNewCustomerFromPhone = hasPhone && !!onNewCustomerWithPhone;

                                            const supplierBlock = supplierList.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1 mb-1">
                                                    {supplierList.map((s) => (
                                                        <span key={s.supplierId} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200" title={s.contactName ? `מתקשר מזוהה כספק – איש קשר: ${s.contactName}` : 'מתקשר מזוהה כספק'}>
                                                            {formatSupplierDisplay(s)}
                                                        </span>
                                                    ))}
                                                </div>
                                            );

                                            if (!matches || matches.length === 0) {
                                                if (supplierList.length > 0) {
                                                    return (
                                                        <div className="inline-flex flex-col gap-1">
                                                            {supplierBlock}
                                                            {hasPhone && (
                                                                <span className="inline-flex flex-col gap-0.5">
                                                                    <span className="inline-flex flex-wrap items-center gap-1">
                                                                        {canNewCustomerFromPhone && (
                                                                            <button type="button" onClick={() => onNewCustomerWithPhone!(phone)} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200">לקוח חדש</button>
                                                                        )}
                                                                        {canNewOrderFromPhone && (
                                                                            <button type="button" onClick={() => onNewOrderWithPhone!(phone)} className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20">הזמנה חדשה</button>
                                                                        )}
                                                                        <button type="button" onClick={() => setAddContactForPhone(phone)} className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300">שייך ללקוח</button>
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500" title="אם המספר שייך לאיש קשר של לקוח קיים, בחר שייך ללקוח או עדכן את כרטיס הלקוח">ייתכן איש קשר – הוסף את המספר בכרטיס הלקוח</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                if (!hasPhone) return '—';
                                                return (
                                                    <span className="inline-flex flex-col gap-0.5">
                                                        <span className="inline-flex flex-wrap items-center gap-1">
                                                            {canNewCustomerFromPhone && (
                                                                <button type="button" onClick={() => onNewCustomerWithPhone!(phone)} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200">לקוח חדש</button>
                                                            )}
                                                            {canNewOrderFromPhone && (
                                                                <button type="button" onClick={() => onNewOrderWithPhone!(phone)} className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20">הזמנה חדשה</button>
                                                            )}
                                                            <button type="button" onClick={() => setAddContactForPhone(phone)} className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300">שייך ללקוח</button>
                                                            {!canNewCustomerFromPhone && !canNewOrderFromPhone && '—'}
                                                        </span>
                                                        {(canNewCustomerFromPhone || canNewOrderFromPhone) && (
                                                            <span className="text-[10px] text-slate-500" title="אם המספר שייך לאיש קשר של לקוח קיים, בחר שייך ללקוח או עדכן את כרטיס הלקוח">ייתכן איש קשר – הוסף את המספר בכרטיס הלקוח</span>
                                                        )}
                                                    </span>
                                                );
                                            }
                                            if (matches.length === 1) {
                                                const m = matches[0];
                                                const orders = relevantOrdersByCustomer[m.customerId] || [];
                                                const ordersOpen = openOrdersDropdownLogId === log.id;
                                                return (
                                                    <div className="inline-flex flex-col gap-1 max-w-full">
                                                        {supplierBlock}
                                                        <div className="inline-flex flex-wrap items-center gap-1">
                                                        {canOpen ? (
                                                            <button type="button" onClick={() => { setSelectedCustomerId(m.customerId); onNavigateToPage!('Customers'); }} className="text-primary hover:underline truncate text-start" title={formatCustomerDisplay(m)}>{formatCustomerDisplay(m)}</button>
                                                        ) : (
                                                            <span className="truncate" title={formatCustomerDisplay(m)}>{formatCustomerDisplay(m)}</span>
                                                        )}
                                                        {canNewOrder && (
                                                            <button type="button" onClick={() => onNewOrderWithCustomer(m.customerId)} className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 shrink-0">הזמנה חדשה</button>
                                                        )}
                                                        {orders.length > 0 && (
                                                            <div className="relative inline-block shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        if (ordersOpen) {
                                                                            setOpenOrdersDropdownLogId(null);
                                                                            setOrdersDropdownAnchor(null);
                                                                        } else {
                                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                            setOrdersDropdownAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, customerId: m.customerId });
                                                                            setOpenOrdersDropdownLogId(log.id);
                                                                        }
                                                                    }}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
                                                                    title="הזמנות רלוונטיות"
                                                                >
                                                                    {orders.length === 1 ? 'הזמנה 1' : `${orders.length} הזמנות`}
                                                                    <span className="rtl:rotate-180" aria-hidden>▼</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            const isOpen = openCustomerDropdownLogId === log.id;
                                            return (
                                                <div className="inline-flex flex-col gap-1 w-full">
                                                    {supplierBlock}
                                                <div ref={isOpen ? customerDropdownRef : undefined} className="relative inline-block w-full">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenCustomerDropdownLogId(isOpen ? null : log.id)}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium min-w-0 max-w-full"
                                                        title={`${matches.length} לקוחות מתאימים`}
                                                    >
                                                        <span className="truncate">{matches.length} לקוחות</span>
                                                        <span className="flex-shrink-0 rtl:rotate-180" aria-hidden>▼</span>
                                                    </button>
                                                    {isOpen && (
                                                        <div className="absolute top-full right-0 mt-1 z-50 min-w-[260px] max-h-[320px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                                                            {matches.map((m) => {
                                                                    const orders = relevantOrdersByCustomer[m.customerId] || [];
                                                                    const ordersKey = `${log.id}-${m.customerId}`;
                                                                    const ordersOpen = openOrdersDropdownLogId === ordersKey;
                                                                    return (
                                                                        <div key={m.customerId} className="px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                                                            <div className="text-xs text-slate-800 truncate" title={formatCustomerDisplay(m)}>{formatCustomerDisplay(m)}</div>
                                                                            <span className="flex flex-wrap items-center gap-1 mt-1">
                                                                                {canOpen && (
                                                                                    <button type="button" onClick={() => { setSelectedCustomerId(m.customerId); onNavigateToPage!('Customers'); setOpenCustomerDropdownLogId(null); }} className="text-xs text-primary hover:underline">פתח לקוח</button>
                                                                                )}
                                                                                {canNewOrder && (
                                                                                    <button type="button" onClick={() => { onNewOrderWithCustomer(m.customerId); setOpenCustomerDropdownLogId(null); }} className="text-xs text-primary hover:underline">הזמנה חדשה</button>
                                                                                )}
                                                                                {orders.length > 0 && (
                                                                                    <div className="relative inline-block">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => {
                                                                                                if (ordersOpen) {
                                                                                                    setOpenOrdersDropdownLogId(null);
                                                                                                    setOrdersDropdownAnchor(null);
                                                                                                } else {
                                                                                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                                                    setOrdersDropdownAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, customerId: m.customerId });
                                                                                                    setOpenOrdersDropdownLogId(ordersKey);
                                                                                                }
                                                                                            }}
                                                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                                                        >
                                                                                            {orders.length === 1 ? '1 הזמנה' : `${orders.length} הזמנות`} ▼
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                        </div>
                                                    )}
                                                </div>
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                                        {log.caller || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600" title="המספר שהלקוח חייג אליו">
                                        {log.dialedNumber || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                        {log.forward != null
                                            ? `הפניה${log.forward ? ` (${log.forward})` : ''}`
                                            : [log.callee, log.calleeName].filter(Boolean).join(' ') || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                        {formatDuration(log.durationSeconds)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600" title="משך השיחה מרגע המענה עד סיום – זמן הדיבור בפועל">
                                        {isAnswered(log.status) && log.answerSeconds != null ? formatDuration(Math.max(0, log.durationSeconds - log.answerSeconds)) : '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600" title={log.answerSeconds == null && isAnswered(log.status) ? 'המרכזיה לא שלחה זמן מענה. ודא שה-webhook כולל שדה answer_sec / answer_time.' : 'זמן עד מענה – כמה שניות צלצלה השיחה עד שנענתה'}>
                                        {log.answerSeconds != null ? `${log.answerSeconds} sec` : '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                        {log.hangupReason
                                            ? (log.hangupReason.toUpperCase() === 'CALLER' ? 'מתקשר' : log.hangupReason.toUpperCase() === 'CALLEE' ? 'נציג' : log.hangupReason)
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                isAnswered(log.status)
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-red-100 text-red-800'
                                            }`}
                                        >
                                            {log.status || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {log.file || log.hasStoredRecording ? (
                                            <button
                                                type="button"
                                                onClick={() => setPlayingLog(log)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition"
                                            >
                                                <PlayIcon className="h-4 w-4" />
                                                השמעה
                                            </button>
                                        ) : (
                                            <span className="text-slate-400 text-sm">אין הקלטה</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                            )}
                        </tbody>
                    </table>
                </div>
                {!loading && logs.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="font-semibold">אין לוג שיחות</p>
                        <p className="text-sm mt-1">הגדר Webhook URL במרכזיה או סנכרן היסטוריה כדי לקבל שיחות.</p>
                    </div>
                )}
                {totalCount > 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 bg-white px-4 py-3 border-t border-slate-200">
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-slate-600">
                                מציג {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} מתוך {totalCount} שיחות
                            </span>
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                שורות לעמוד:
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
                            </label>
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
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1 || loading}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                קודם
                            </button>
                            <span className="px-3 py-1 text-sm text-slate-600">
                                עמוד {currentPage} מתוך {Math.ceil(totalCount / pageSize) || 1}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(totalCount / pageSize) || 1, p + 1))}
                                disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                הבא
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize) || 1)}
                                disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                אחרון
                            </button>
                        </div>
                    </div>
                )}
                {loading && logs.length > 0 && (
                    <div className="px-4 py-2 text-center text-slate-500 text-sm border-t border-slate-200">טוען...</div>
                )}
            </div>

            {ordersDropdownAnchor && createPortal(
                <div
                    ref={ordersDropdownRef}
                    dir="rtl"
                    className="fixed z-[9999] min-w-[260px] max-w-[min(320px,100vw)] max-h-[320px] overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1"
                    style={{ top: ordersDropdownAnchor.top + ordersDropdownAnchor.height + 8, left: ordersDropdownAnchor.left }}
                >
                    {(relevantOrdersByCustomer[ordersDropdownAnchor.customerId] || []).map((ord) => (
                        <div key={ord.id} className="px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-800 truncate" title={`${ord.orderNumber} – ${ord.orderStatus}`}>{ord.orderNumber} ({ord.orderStatus})</span>
                            {onNavigateToOrder && (
                                <button type="button" onClick={() => { onNavigateToOrder(ord.id); setOpenOrdersDropdownLogId(null); setOrdersDropdownAnchor(null); }} className="text-xs text-primary hover:underline shrink-0">פתח</button>
                            )}
                        </div>
                    ))}
                </div>,
                document.body
            )}

            {addContactForPhone && (
                <Modal
                    title="שייך מספר כאדם קשר ללקוח"
                    onClose={() => { setAddContactForPhone(null); setAddContactSelectedId(null); }}
                    size="md"
                >
                    <div className="space-y-3 text-start">
                        <p className="text-xs text-slate-500">
                            משויך למספר: <strong dir="ltr" className="text-slate-700">{addContactForPhone}</strong>
                        </p>
                        <div>
                            <label className="sr-only">חיפוש לקוח</label>
                            <input
                                ref={addContactSearchInputRef}
                                type="text"
                                value={addContactSearchTerm}
                                onChange={(e) => setAddContactSearchTerm(e.target.value)}
                                placeholder="חיפוש לפי שם לקוח, ח.פ, איש קשר, טלפון או אימייל..."
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                aria-label="חיפוש לקוחות"
                            />
                        </div>
                        <div className="min-h-[120px] max-h-60 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50/50">
                            {addContactSearchLoading ? (
                                <p className="p-4 text-center text-sm text-slate-500">טוען...</p>
                            ) : addContactDebouncedSearchTerm.trim().length === 0 ? (
                                <p className="p-4 text-center text-sm text-slate-500">הקלידו לחיפוש לקוח (שם, ח.פ, טלפון או אימייל)</p>
                            ) : addContactSearchResults.length === 0 ? (
                                <p className="p-4 text-center text-sm text-slate-500">לא נמצאו לקוחות התואמים את החיפוש</p>
                            ) : (
                                <ul className="divide-y divide-slate-200">
                                    {addContactSearchResults.map((c) => (
                                        <li key={c.id}>
                                            <button
                                                type="button"
                                                onClick={() => setAddContactSelectedId(c.id)}
                                                className={`w-full px-3 py-2 text-right text-sm transition-colors ${addContactSelectedId === c.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-white text-slate-800'}`}
                                            >
                                                <div className="font-medium">{c.name}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">
                                                    {c.businessId ? `ח.פ ${c.businessId}` : '—'}
                                                </div>
                                                <CustomerSyncBadges customer={c} compact />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {addContactSelectedId && (
                            <div className="space-y-2 border-t border-slate-200 pt-3">
                                <p className="text-xs font-medium text-slate-600">פרטי איש הקשר (אופציונלי)</p>
                                <input
                                    type="text"
                                    value={addContactName}
                                    onChange={(e) => setAddContactName(e.target.value)}
                                    placeholder="שם איש קשר (אופציונלי)"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                    aria-label="שם איש קשר"
                                />
                                <input
                                    type="email"
                                    value={addContactEmail}
                                    onChange={(e) => setAddContactEmail(e.target.value)}
                                    placeholder="אימייל (אופציונלי)"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                    aria-label="אימייל איש קשר"
                                />
                            </div>
                        )}
                        <button
                            type="button"
                            disabled={!addContactSelectedId || addContactSaving}
                            onClick={async () => {
                                if (!addContactSelectedId || !addContactForPhone) return;
                                setAddContactSaving(true);
                                try {
                                    const customer = await getCustomerById(addContactSelectedId);
                                    if (!customer) {
                                        alert('הלקוח לא נמצא.');
                                        return;
                                    }
                                    const newContact: Contact = {
                                        id: `cont_${Date.now()}`,
                                        name: addContactName.trim(),
                                        email: addContactEmail.trim(),
                                        phone: addContactForPhone,
                                        role: 'איש קשר',
                                        isBillingContact: false,
                                        isDefault: (customer.contacts || []).length === 0,
                                    };
                                    await updateCustomer({
                                        ...customer,
                                        contacts: [...(customer.contacts || []), newContact],
                                    });
                                    const phones = [...new Set(logs.flatMap((log) => [log.caller, log.callee].filter(Boolean).map(String)))];
                                    await matchPhones(phones).then(setPhoneMatches);
                                    await matchSupplierPhones(phones).then(setSupplierMatches);
                                    setAddContactForPhone(null);
                                    setAddContactSelectedId(null);
                                    setAddContactName('');
                                    setAddContactEmail('');
                                } catch (e) {
                                    console.error(e);
                                    alert('שגיאה בהוספת איש הקשר. נסה שוב.');
                                } finally {
                                    setAddContactSaving(false);
                                }
                            }}
                            className="w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {addContactSaving ? 'מוסיף...' : 'הוסף כאדם קשר'}
                        </button>
                    </div>
                </Modal>
            )}

            {playingLog && (
                <Modal
                    title="השמעת הקלטה"
                    onClose={() => {
                        if (playingAudioUrl?.startsWith('blob:')) {
                            URL.revokeObjectURL(playingAudioUrl);
                        }
                        setPlayingLog(null);
                        setPlayingAudioUrl(null);
                        setPlayingAudioLoading(false);
                    }}
                    size="lg"
                >
                    <div className="space-y-4 text-start">
                        <p className="text-sm text-slate-600">
                            שיחה מ־{formatDateTime(playingLog.startDate)} • {playingLog.caller} → {playingLog.callee}
                        </p>
                        {playingAudioLoading && (
                            <p className="text-sm text-slate-500">טוען הקלטה...</p>
                        )}
                        {playingAudioUrl && !playingAudioLoading && (
                            <audio
                                key={playingLog.uniqueId}
                                src={playingAudioUrl}
                                controls
                                className="w-full"
                            />
                        )}
                    </div>
                </Modal>
            )}

            {showSyncModal && (
                <Modal
                    title="סנכרון היסטוריית שיחות מהמרכזיה"
                    onClose={() => {
                        setShowSyncModal(false);
                        setSyncError(null);
                        setSyncSuccess(null);
                    }}
                    size="lg"
                >
                    <div className="space-y-4 text-start">
                        <p className="text-sm text-slate-600">
                            בחר טווח תאריכים לסנכרון שיחות מהמרכזיה. השיחות יישמרו במערכת ויופיעו בטבלה.
                        </p>
                        <p className="text-xs text-slate-500">
                            נדרש להגדיר במערכת השרת: MASTERPBX_TOKEN_ID (קבל את ה-Token ממערכת המרכזיה → הגדרות API).
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    תאריך התחלה
                                </label>
                                <input
                                    type="date"
                                    value={syncStartDate}
                                    onChange={(e) => setSyncStartDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-primary focus:border-primary"
                                    max={syncEndDate || undefined}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    תאריך סיום
                                </label>
                                <input
                                    type="date"
                                    value={syncEndDate}
                                    onChange={(e) => setSyncEndDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-primary focus:border-primary"
                                    min={syncStartDate || undefined}
                                    max={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                        </div>

                        {syncError && (
                            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                                <p className="text-sm text-red-800">{syncError}</p>
                            </div>
                        )}

                        {syncSuccess && (
                            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                                <p className="text-sm text-green-800">{syncSuccess}</p>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowSyncModal(false);
                                    setSyncError(null);
                                    setSyncSuccess(null);
                                }}
                                className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                                disabled={syncLoading}
                            >
                                ביטול
                            </button>
                            <button
                                type="button"
                                onClick={handleSync}
                                disabled={syncLoading || !syncStartDate || !syncEndDate}
                                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {syncLoading ? 'מסנכרן...' : 'סנכרן'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
    </svg>
);

export default CallCenterPage;
