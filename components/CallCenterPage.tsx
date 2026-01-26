import React, { useState, useEffect } from 'react';
import { CallLog } from '../types';
import { PhoneIcon } from './icons';
import Modal from './Modal';
import { getCallLogs } from '../services/mongoService';

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

const CallCenterPage: React.FC = () => {
    const [logs, setLogs] = useState<CallLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [playingLog, setPlayingLog] = useState<CallLog | null>(null);

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
            <div className="flex items-center gap-2 text-slate-700">
                <PhoneIcon className="h-6 w-6" />
                <h2 className="text-lg font-semibold">לוג שיחות מרכזייה</h2>
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
                                        {log.file ? (
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
                    onClose={() => setPlayingLog(null)}
                    size="lg"
                >
                    <div className="space-y-4 text-start">
                        <p className="text-sm text-slate-600">
                            שיחה מ־{formatDateTime(playingLog.startDate)} • {playingLog.caller} → {playingLog.callee}
                        </p>
                        <audio
                            key={playingLog.id}
                            src={playingLog.file}
                            controls
                            className="w-full"
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
};

const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
    </svg>
);

export default CallCenterPage;
