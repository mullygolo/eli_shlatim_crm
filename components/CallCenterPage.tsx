import React, { useState, useEffect } from 'react';
import { CallLog } from '../types';
import { PhoneIcon, ImportIcon } from './icons';
import Modal from './Modal';
import { getCallLogs, syncCallLogs, getCallLogRecordingBlob } from '../services/mongoService';

const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatDateTime = (d: Date): string => {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleString('he-IL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
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

const CallCenterPage: React.FC = () => {
    const [logs, setLogs] = useState<CallLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [playingLog, setPlayingLog] = useState<CallLog | null>(null);
    const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
    const [playingAudioLoading, setPlayingAudioLoading] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncLoading, setSyncLoading] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
    const [syncStartDate, setSyncStartDate] = useState('');
    const [syncEndDate, setSyncEndDate] = useState('');
    const [webhookCopied, setWebhookCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getCallLogs()
            .then((data) => {
                if (!cancelled) {
                    setLogs(data);
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
    }, []);

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

    const loadLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getCallLogs();
            setLogs(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

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
            // Reload logs after sync
            await loadLogs();
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

    if (loading) {
        return (
            <div className="flex justify-center items-center py-16" dir="rtl">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                    <p className="text-slate-600">טוען לוג שיחות...</p>
                </div>
            </div>
        );
    }

    if (error) {
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

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-start">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תאריך ושעה</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">מתקשר</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">נציג</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">משך</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סטטוס</th>
                                <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">פעולה</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                                        {formatDateTime(log.startDate)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                                        {log.caller || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                        {log.callee || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                        {formatDuration(log.durationSeconds)}
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
                            ))}
                        </tbody>
                    </table>
                </div>
                {logs.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="font-semibold">אין לוג שיחות</p>
                        <p className="text-sm mt-1">הגדר Webhook URL במרכזיה כדי לקבל שיחות אוטומטית.</p>
                    </div>
                )}
            </div>

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
