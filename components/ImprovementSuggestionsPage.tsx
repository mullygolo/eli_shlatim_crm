import React, { useState, useEffect, useCallback } from 'react';
import { Page, ImprovementSuggestion, ImprovementSuggestionType, ImprovementSuggestionStatus, ImprovementSuggestionPriority, Attachment } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getImprovementSuggestions, createImprovementSuggestion, updateImprovementSuggestion, voteImprovementSuggestion } from '../services/mongoService';
import { LightbulbIcon, PlusIcon, EditIcon, CheckCircleIcon, DownloadIcon } from './icons';

const PAGE_LABELS: Record<Page, string> = {
    Dashboard: 'לוח בקרה',
    Orders: 'לוח הזמנות',
    Customers: 'לקוחות',
    Suppliers: 'ספקים',
    Employees: 'עובדים',
    Deals: 'עסקאות',
    Transactions: 'תנועות כספיות',
    Timesheets: 'גיליונות שעות',
    Quotes: 'הצעות מחיר',
    Reports: 'תשלום לספקים',
    Settings: 'הגדרות מערכת',
    Finance: 'דוחות / תקציב',
    Attendance: 'נוכחות ושכר',
    PriceList: 'מחירון',
    CallCenter: 'מרכזייה',
    ImprovementSuggestions: 'הצעות ייעול',
};

const TYPE_LABELS: Record<ImprovementSuggestionType, string> = {
    BUG: 'באג',
    IMPROVEMENT: 'שיפור',
    OTHER: 'אחר',
};

const STATUS_LABELS: Record<ImprovementSuggestionStatus, string> = {
    NEW: 'חדש',
    IN_PROGRESS: 'בטיפול',
    DONE: 'טופל',
};

const PRIORITY_LABELS: Record<ImprovementSuggestionPriority, string> = {
    LOW: 'נמוך',
    MEDIUM: 'בינוני',
    HIGH: 'גבוה',
};

const MAX_IMAGES = 5;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

interface ImprovementSuggestionsPageProps {
    currentPage: Page;
}

export default function ImprovementSuggestionsPage({ currentPage }: ImprovementSuggestionsPageProps) {
    const { user } = useAuth();
    const [suggestions, setSuggestions] = useState<ImprovementSuggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState<ImprovementSuggestionType | ''>('');
    const [statusFilter, setStatusFilter] = useState<ImprovementSuggestionStatus | ''>('');
    const [form, setForm] = useState({
        type: 'IMPROVEMENT' as ImprovementSuggestionType,
        title: '',
        description: '',
        pageContext: PAGE_LABELS[currentPage] || '',
        priority: '' as ImprovementSuggestionPriority | '',
        attachments: [] as Attachment[],
    });
    const [submitting, setSubmitting] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [adminEditId, setAdminEditId] = useState<string | null>(null);
    const [adminStatus, setAdminStatus] = useState<ImprovementSuggestionStatus>('NEW');
    const [adminComment, setAdminComment] = useState('');
    const [votingId, setVotingId] = useState<string | null>(null);
    const [viewingImages, setViewingImages] = useState<{ list: Attachment[]; index: number } | null>(null);
    const [lightboxZoom, setLightboxZoom] = useState(1);
    const [lightboxRotate, setLightboxRotate] = useState(0);

    const loadSuggestions = useCallback(async () => {
        setLoading(true);
        try {
            const filters = (typeFilter || statusFilter) ? { type: typeFilter || undefined, status: statusFilter || undefined } : undefined;
            const list = await getImprovementSuggestions(filters);
            setSuggestions(list);
        } catch (e) {
            console.error('Failed to load suggestions', e);
        } finally {
            setLoading(false);
        }
    }, [typeFilter, statusFilter]);

    useEffect(() => {
        loadSuggestions();
    }, [loadSuggestions]);

    useEffect(() => {
        setForm(prev => ({ ...prev, pageContext: PAGE_LABELS[currentPage] || prev.pageContext }));
    }, [currentPage]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        e.target.value = '';
        if (form.attachments.length + files.length > MAX_IMAGES) {
            alert(`ניתן להעלות עד ${MAX_IMAGES} תמונות.`);
            return;
        }
        const newAttachments: Attachment[] = [];
        let rejected = false;
        files.forEach(file => {
            if (file.size > MAX_FILE_SIZE_BYTES) {
                rejected = true;
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result && typeof ev.target.result === 'string') {
                    const type = file.type || (file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? 'image/jpeg' : 'image/png');
                    newAttachments.push({
                        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                        fileName: file.name,
                        dataUrl: ev.target.result,
                        type,
                    });
                    if (newAttachments.length === files.length) {
                        setForm(prev => ({ ...prev, attachments: [...prev.attachments, ...newAttachments].slice(0, MAX_IMAGES) }));
                    }
                }
            };
            reader.readAsDataURL(file);
        });
        if (rejected) alert('קובץ אחד או יותר גדול מ־2MB ולא הועלה.');
    };

    const removeAttachment = (id: string) => {
        setForm(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !form.title.trim()) return;
        setSubmitting(true);
        try {
            const suggestion: ImprovementSuggestion = {
                id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                type: form.type,
                title: form.title.trim(),
                description: form.description.trim(),
                pageContext: form.pageContext.trim() || undefined,
                priority: form.priority || undefined,
                status: 'NEW',
                attachments: form.attachments.length ? form.attachments : undefined,
                authorId: user.id,
                authorName: user.name || user.email || 'משתמש',
                createdAt: new Date(),
                voteCount: 0,
                votedBy: [],
            };
            await createImprovementSuggestion(suggestion);
            setForm({ type: 'IMPROVEMENT', title: '', description: '', pageContext: PAGE_LABELS[currentPage] || '', priority: '', attachments: [] });
            loadSuggestions();
        } catch (err) {
            console.error('Failed to create suggestion', err);
            alert('שמירת ההצעה נכשלה. נסה שוב.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAdminSave = async (id: string) => {
        try {
            await updateImprovementSuggestion(id, { status: adminStatus, adminComment: adminComment.trim() || undefined });
            setAdminEditId(null);
            loadSuggestions();
        } catch (err) {
            console.error('Failed to update suggestion', err);
        }
    };

    const handleVote = async (id: string) => {
        if (!user) return;
        setVotingId(id);
        try {
            await voteImprovementSuggestion(id, user.id);
            loadSuggestions();
        } catch (err) {
            console.error('Failed to vote', err);
        } finally {
            setVotingId(null);
        }
    };

    const openImageLightbox = (list: Attachment[], index: number) => (e: React.MouseEvent) => {
        e.stopPropagation();
        setViewingImages({ list, index });
    };

    useEffect(() => {
        setLightboxZoom(1);
        setLightboxRotate(0);
    }, [viewingImages?.index, viewingImages?.list]);

    useEffect(() => {
        if (!viewingImages) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setViewingImages(null);
            if (e.key === 'ArrowRight') {
                setViewingImages(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
            }
            if (e.key === 'ArrowLeft') {
                setViewingImages(prev => prev && prev.index < prev.list.length - 1 ? { ...prev, index: prev.index + 1 } : prev);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [viewingImages]);

    const lightboxZoomIn = () => setLightboxZoom(z => Math.min(z + 0.5, 5));
    const lightboxZoomOut = () => setLightboxZoom(z => Math.max(z - 0.5, 0.25));
    const lightboxZoomReset = () => setLightboxZoom(1);
    const lightboxRotate90 = () => setLightboxRotate(r => (r + 90) % 360);
    const lightboxDownload = (att: Attachment) => {
        const a = document.createElement('a');
        a.href = att.dataUrl;
        a.download = att.fileName || 'image';
        a.click();
    };

    const isAdmin = user?.roleType === 'ADMIN';

    return (
        <div className="space-y-6 pb-10" dir="rtl">
            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/50">
                    <div className="bg-amber-100 p-2 rounded-lg">
                        <LightbulbIcon className="h-5 w-5 text-amber-600" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800">הצעות ייעול</h1>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4 border-b border-slate-100">
                    <div className="flex flex-wrap gap-2">
                        {(['BUG', 'IMPROVEMENT', 'OTHER'] as const).map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, type: t }))}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    form.type === t
                                        ? t === 'BUG'
                                            ? 'bg-red-100 text-red-800'
                                            : t === 'IMPROVEMENT'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-slate-200 text-slate-800'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {TYPE_LABELS[t]}
                            </button>
                        ))}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">כותרת</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="תקציר קצר"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="פרט את הבעיה או ההצעה..."
                            rows={3}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-primary resize-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">איפה במערכת (אופציונלי)</label>
                        <input
                            type="text"
                            value={form.pageContext}
                            onChange={e => setForm(prev => ({ ...prev, pageContext: e.target.value }))}
                            placeholder="למשל: לוח הזמנות, דף לקוח"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">עדיפות (אופציונלי)</label>
                        <div className="flex gap-2">
                            {(['LOW', 'MEDIUM', 'HIGH'] as const).map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setForm(prev => ({ ...prev, priority: form.priority === p ? '' : p }))}
                                    className={`px-2 py-1 rounded text-sm ${form.priority === p ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}
                                >
                                    {PRIORITY_LABELS[p]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">תמונות (עד {MAX_IMAGES}, עד 2MB לכל תמונה)</label>
                        <div className="flex flex-wrap gap-2 items-center">
                            {form.attachments.map(att => (
                                <div key={att.id} className="relative group">
                                    <img src={att.dataUrl} alt={att.fileName} className="w-20 h-20 object-cover rounded border border-slate-200" />
                                    <button
                                        type="button"
                                        onClick={() => removeAttachment(att.id)}
                                        className="absolute top-0 left-0 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            {form.attachments.length < MAX_IMAGES && (
                                <label className="w-20 h-20 border-2 border-dashed border-slate-300 rounded flex items-center justify-center cursor-pointer hover:border-primary hover:bg-slate-50">
                                    <PlusIcon className="h-6 w-6 text-slate-400" />
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
                                </label>
                            )}
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={submitting || !form.title.trim() || !user}
                        className="px-4 py-2 bg-primary text-white rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? 'שולח...' : 'שלח הצעה'}
                    </button>
                </form>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">סינון:</span>
                    <select
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value as ImprovementSuggestionType | '')}
                        className="rounded border border-slate-300 text-sm px-2 py-1"
                    >
                        <option value="">כל הסוגים</option>
                        {(['BUG', 'IMPROVEMENT', 'OTHER'] as const).map(t => (
                            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                        ))}
                    </select>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as ImprovementSuggestionStatus | '')}
                        className="rounded border border-slate-300 text-sm px-2 py-1"
                    >
                        <option value="">כל הסטטוסים</option>
                        {(['NEW', 'IN_PROGRESS', 'DONE'] as const).map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                    </select>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
                    {loading ? (
                        <p className="text-center text-slate-500 py-8">טוען...</p>
                    ) : suggestions.length === 0 ? (
                        <p className="text-center text-slate-400 py-8">אין הצעות לסינון זה.</p>
                    ) : (
                        suggestions.map(s => {
                            const created = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
                            const expanded = expandedId === s.id;
                            const isVoted = user && (s.votedBy || []).includes(user.id);
                            const voteCount = s.voteCount ?? 0;

                            return (
                                <div key={s.id} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/30">
                                    <div
                                        className="p-4 cursor-pointer hover:bg-slate-50/50"
                                        onClick={() => setExpandedId(expanded ? null : s.id)}
                                    >
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span
                                                className={`text-xs font-bold px-2 py-0.5 rounded ${
                                                    s.type === 'BUG' ? 'bg-red-100 text-red-800' : s.type === 'IMPROVEMENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                                                }`}
                                            >
                                                {TYPE_LABELS[s.type]}
                                            </span>
                                            <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                                                {STATUS_LABELS[s.status]}
                                            </span>
                                            {s.priority && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                                    {PRIORITY_LABELS[s.priority]}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-semibold text-slate-800">{s.title}</h3>
                                        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{s.description}</p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                            <span>{s.authorName}</span>
                                            <span>·</span>
                                            <span>{created.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                            {s.pageContext && (
                                                <>
                                                    <span>·</span>
                                                    <span>{s.pageContext}</span>
                                                </>
                                            )}
                                            {voteCount > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span className="font-medium text-primary">{voteCount} גם נתקלו</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {expanded && (
                                        <div className="border-t border-slate-200 p-4 bg-white space-y-3">
                                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.description}</p>
                                            {s.attachments && s.attachments.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {s.attachments.map((att, idx) => (
                                                        <button
                                                            key={att.id}
                                                            type="button"
                                                            onClick={openImageLightbox(s.attachments!, idx)}
                                                            className="block rounded-xl overflow-hidden border-2 border-slate-200 hover:border-primary hover:shadow-lg hover:scale-[1.02] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                                                        >
                                                            <img src={att.dataUrl} alt={att.fileName} className="w-32 h-32 object-cover" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleVote(s.id); }}
                                                    disabled={!user || isVoted || votingId === s.id}
                                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <CheckCircleIcon className="h-4 w-4" />
                                                    {isVoted ? `גם נתקלתי (${voteCount})` : votingId === s.id ? '...' : voteCount ? `אני גם נתקלתי (${voteCount})` : 'אני גם נתקלתי'}
                                                </button>
                                                {isAdmin && (
                                                    <>
                                                        {adminEditId !== s.id ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setAdminEditId(s.id); setAdminStatus(s.status); setAdminComment(s.adminComment || ''); }}
                                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-slate-200 text-slate-700 hover:bg-slate-300"
                                                            >
                                                                <EditIcon className="h-4 w-4" />
                                                                עדכן סטטוס
                                                            </button>
                                                        ) : (
                                                            <div className="flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                <select
                                                                    value={adminStatus}
                                                                    onChange={e => setAdminStatus(e.target.value as ImprovementSuggestionStatus)}
                                                                    className="rounded border border-slate-300 text-sm px-2 py-1"
                                                                >
                                                                    {(['NEW', 'IN_PROGRESS', 'DONE'] as const).map(st => (
                                                                        <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                                                                    ))}
                                                                </select>
                                                                <input
                                                                    type="text"
                                                                    value={adminComment}
                                                                    onChange={e => setAdminComment(e.target.value)}
                                                                    placeholder="תגובת מנהל (אופציונלי)"
                                                                    className="rounded border border-slate-300 text-sm px-2 py-1 min-w-[180px]"
                                                                />
                                                                <button type="button" onClick={() => handleAdminSave(s.id)} className="px-2 py-1 bg-primary text-white rounded text-sm">שמור</button>
                                                                <button type="button" onClick={() => setAdminEditId(null)} className="px-2 py-1 bg-slate-200 rounded text-sm">ביטול</button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            {s.adminComment && (
                                                <div className="text-sm text-slate-600 bg-slate-50 rounded p-2 border border-slate-100">
                                                    <span className="font-medium text-slate-700">תגובת מנהל: </span>
                                                    {s.adminComment}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Lightbox לתמונות – זום, רוטציה, הורדה */}
            {viewingImages && (
                <div
                    className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm transition-opacity duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-label="צפייה בתמונה"
                    onClick={() => setViewingImages(null)}
                >
                    {/* שורת כלים עליונה */}
                    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-3 bg-black/40 border-b border-white/10" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setViewingImages(null)}
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                                aria-label="סגור"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            <span className="text-white/80 text-sm ms-2 truncate max-w-[200px]" title={viewingImages.list[viewingImages.index].fileName}>
                                {viewingImages.list[viewingImages.index].fileName}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={lightboxZoomOut}
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label="הקטן"
                                disabled={lightboxZoom <= 0.25}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                                </svg>
                            </button>
                            <span className="text-white/90 text-sm font-medium min-w-[3rem] text-center tabular-nums">{Math.round(lightboxZoom * 100)}%</span>
                            <button
                                type="button"
                                onClick={lightboxZoomIn}
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label="הגדל"
                                disabled={lightboxZoom >= 5}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={lightboxZoomReset}
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                                aria-label="איפוס זום"
                                title="100%"
                            >
                                <span className="text-xs font-bold">100%</span>
                            </button>
                            <div className="w-px h-6 bg-white/20" />
                            <button
                                type="button"
                                onClick={lightboxRotate90}
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                                aria-label="סיבוב 90°"
                                title="סובב 90°"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => lightboxDownload(viewingImages.list[viewingImages.index])}
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                                aria-label="הורד"
                                title="הורד תמונה"
                            >
                                <DownloadIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* אזור התמונה עם גלגלת לזום */}
                    <div
                        className="flex-1 flex items-center justify-center overflow-auto p-4 min-h-0"
                        onClick={e => e.stopPropagation()}
                        onWheel={(e) => {
                            e.stopPropagation();
                            if (e.deltaY < 0) lightboxZoomIn();
                            else if (e.deltaY > 0) lightboxZoomOut();
                        }}
                    >
                        {viewingImages.list.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setViewingImages(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : null)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-30 disabled:pointer-events-none"
                                    aria-label="תמונה קודמת"
                                    disabled={viewingImages.index === 0}
                                >
                                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewingImages(prev => prev && prev.index < prev.list.length - 1 ? { ...prev, index: prev.index + 1 } : null)}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-30 disabled:pointer-events-none"
                                    aria-label="תמונה הבאה"
                                    disabled={viewingImages.index === viewingImages.list.length - 1}
                                >
                                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </>
                        )}

                        <div className="flex flex-col items-center justify-center">
                            <img
                                src={viewingImages.list[viewingImages.index].dataUrl}
                                alt={viewingImages.list[viewingImages.index].fileName}
                                className="max-w-full max-h-[70vh] w-auto h-auto object-contain rounded-lg shadow-2xl transition-transform duration-150 select-none"
                                style={{ transform: `scale(${lightboxZoom}) rotate(${lightboxRotate}deg)` }}
                                onClick={e => e.stopPropagation()}
                                draggable={false}
                            />
                            <div className="mt-3 flex items-center gap-3 text-white/80 text-sm">
                                {viewingImages.list.length > 1 && (
                                    <span className="font-medium tabular-nums">
                                        {viewingImages.index + 1} / {viewingImages.list.length}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
