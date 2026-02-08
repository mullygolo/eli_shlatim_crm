import React, { useState, useEffect } from 'react';
import { Order } from '../types';
import { DownloadIcon, PlusIcon } from './icons';

type DocumentInfoType = 'invoice' | 'invoice_receipt' | 'receipt' | 'credit' | 'estimate';

interface DocumentViewerProps {
    order: Order;
    onDownload?: (documentId: string, type: DocumentInfoType) => void;
    onOpenInGreenInvoice?: (documentId: string, type: DocumentInfoType) => void;
    /** פתיחת מודל: 'full' = כל הסוגים. 'from-document' + fromDocumentType + sourceDocumentId = אופציות לפי סוג המסמך */
    onOpenCreateModal?: (mode: 'full' | 'from-document', fromDocumentType?: 'invoice' | 'receipt' | 'credit' | 'estimate', sourceDocumentId?: string) => void;
    onCancelDocument?: (documentId: string, type: DocumentInfoType) => void;
    /** false = כפתור ביטול מסמך מושבת (למשתמש שאינו מנהל) */
    canCancelDocument?: boolean;
    /** שיוך מסמך מחשבונית ירוקה ידנית */
    onLinkDocument?: (documentId: string) => Promise<void>;
    /** מזהה הלקוח בחשבונית ירוקה — להצגת רשימת מסמכים לבחירה */
    customerGreenInvoiceClientId?: string;
}

interface DocumentInfo {
    id: string;
    type: DocumentInfoType;
    label: string;
    status?: 'opened' | 'closed' | 'canceled' | 'draft' | 'unavailable';
    statusLabel?: string;
    /** תאריך בלבד (תאריך המסמך) — תאימות לאחור */
    date?: string;
    /** timestamp במילישניות למיון לפי תאריך ושעת יצירה */
    createdAtTimestamp?: number;
    /** תאריך המסמך (להצגה) */
    documentDateDisplay?: string;
    /** הופק ב־ תאריך + שעה (להצגה) */
    issuedAtDisplay?: string;
    amount?: number;
    currency?: string;
    number?: string;
    /** כותרת המסמך (תיאור) */
    description?: string;
    /** אמצעי תשלום אם קיים */
    paymentMethod?: string;
    /** למסמכי צ'ק: מספר צ'ק ותאריך פירעון (לדוחות כספיים) */
    chequeReference?: string;
    chequeRepaymentDate?: string;
    signed?: boolean;
    cancellable?: boolean;
    url?: string;
}

const apiTypeFromDoc = (t: DocumentInfoType): 'invoice' | 'receipt' | 'credit_invoice' | 'estimate' =>
    t === 'credit' ? 'credit_invoice' : t === 'invoice_receipt' ? 'invoice' : t;

const PAYMENT_TYPE_LABELS: Record<number, string> = {
    1: 'מזומן',
    2: 'צ\'ק',
    3: 'כרטיס אשראי',
    4: 'העברה בנקאית',
    10: 'Bit/PayBox',
    11: 'אחר'
};

function paymentMethodFromRaw(raw: any): string | undefined {
    const payments = raw?.payment;
    if (!Array.isArray(payments) || payments.length === 0) return undefined;
    const t = payments[0]?.type;
    if (t == null) return undefined;
    return PAYMENT_TYPE_LABELS[Number(t)] ?? 'אחר';
}

function chequeDetailsFromRaw(raw: any): { reference?: string; repaymentDate?: string } {
    const payments = raw?.payment;
    if (!Array.isArray(payments) || payments.length === 0) return {};
    const p = payments.find((x: any) => Number(x.type) === 2);
    if (!p) return {};
    const reference = p.chequeNum ? String(p.chequeNum).trim() : undefined;
    const repaymentDate = (p.dueDate || p.date) ? String(p.dueDate || p.date).slice(0, 10) : undefined;
    return { reference, repaymentDate };
}

/** מחזיר timestamp למיון + מחרוזות להצגה: תאריך המסמך, הופק ב־ (תאריך + שעה) */
function parseDocumentDates(raw: any): { createdAtTimestamp: number; dateStr: string; documentDateDisplay?: string; issuedAtDisplay?: string } {
    const creationDate = raw?.creationDate ?? raw?.documentDate;
    const documentDate = raw?.documentDate ?? raw?.creationDate;
    const toMs = (v: unknown): number => {
        if (v == null) return 0;
        if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
        const d = new Date(String(v));
        return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    const createdAtTimestamp = toMs(creationDate) || toMs(documentDate);
    const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const dateTimeOpts: Intl.DateTimeFormatOptions = { ...dateOpts, hour: '2-digit', minute: '2-digit' };
    const dateStr = createdAtTimestamp
        ? new Date(createdAtTimestamp).toLocaleDateString('he-IL', dateOpts)
        : '';
    const documentDateDisplay = documentDate
        ? new Date(toMs(documentDate)).toLocaleDateString('he-IL', dateOpts)
        : dateStr;
    const issuedAtDisplay = createdAtTimestamp
        ? new Date(createdAtTimestamp).toLocaleString('he-IL', dateTimeOpts)
        : undefined;
    return { createdAtTimestamp, dateStr, documentDateDisplay: documentDateDisplay || undefined, issuedAtDisplay };
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
    order, 
    onDownload, 
    onOpenInGreenInvoice,
    onOpenCreateModal,
    onCancelDocument,
    canCancelDocument = true,
    onLinkDocument,
    customerGreenInvoiceClientId
}) => {
    const [documents, setDocuments] = useState<DocumentInfo[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [previewDoc, setPreviewDoc] = useState<{ id: string; type: DocumentInfoType; label: string; blobUrl: string } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [linkDocId, setLinkDocId] = useState('');
    const [linkLoading, setLinkLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [customerDocs, setCustomerDocs] = useState<Array<{ id: string; type: number; number?: string; description?: string; amount?: number; date?: string }>>([]);
    const [loadingCustomerDocs, setLoadingCustomerDocs] = useState(false);

    // מסמכים שאפשר לשייך — ללא מסמכים שכבר משויכים להזמנה (מונע כפילות)
    const docsAvailableToLink = customerDocs.filter(d => !documents.some(doc => doc.id === d.id));

    // Fetch document details from API - stored IDs, OrderDocumentLinks, and search
    useEffect(() => {
        const fetchDocumentDetails = async () => {
            const docs: DocumentInfo[] = [];
            const docIdsSeen = new Set<string>();
            setLoading(true);

            try {
                // Linked documents from OrderDocumentLink (includes documentType for fallback when raw fetch fails)
                const linkTypeToLabel: Record<string, string> = { invoice: 'חשבונית מס', receipt: 'קבלה', credit_invoice: 'חשבונית זיכוי', invoice_receipt: 'חשבונית מס + קבלה', estimate: 'הצעת מחיר' };
                const linkTypeToDocType: Record<string, DocumentInfoType> = { invoice: 'invoice', receipt: 'receipt', credit_invoice: 'credit', invoice_receipt: 'invoice_receipt', estimate: 'estimate' };
                let linkedDocs: Array<{ id: string; type: DocumentInfoType; label: string }> = [];
                if (order.id) {
                    try {
                        const r = await fetch(`/api/green-invoice/orders/${order.id}/document-links`, {
                            headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
                        });
                        if (r.ok) {
                            const { links } = await r.json();
                            linkedDocs = (links || [])
                                .filter((l: any) => l.documentId)
                                .map((l: any) => {
                                    const linkType = l.documentType || 'invoice';
                                    return { id: l.documentId, type: linkTypeToDocType[linkType] || 'invoice', label: linkTypeToLabel[linkType] || 'מסמך משויך' };
                                });
                        }
                    } catch { /* ignore */ }
                }

                const storedIds = new Set([order.greenInvoiceId, order.greenInvoiceReceiptId, order.greenInvoiceCreditId, order.greenInvoiceEstimateId].filter(Boolean));
                const documentIds: Array<{ id: string; type: DocumentInfoType; label: string }> = [
                    { id: order.greenInvoiceId, type: 'invoice', label: 'חשבונית מס' },
                    { id: order.greenInvoiceReceiptId, type: 'receipt', label: 'קבלה' },
                    { id: order.greenInvoiceCreditId, type: 'credit', label: 'חשבונית זיכוי' },
                    { id: order.greenInvoiceEstimateId, type: 'estimate', label: 'הצעת מחיר' }
                ].filter((doc): doc is { id: string; type: DocumentInfoType; label: string } => !!doc.id).concat(
                    linkedDocs.filter(ld => !storedIds.has(ld.id))
                );

                for (const doc of documentIds) {
                    try {
                        const response = await fetch(`/api/green-invoice/documents/${doc.id}/raw`, {
                            headers: {
                                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                            }
                        });
                        
                        if (response.ok) {
                            const rawDoc = await response.json();
                            const status = rawDoc.status;
                            const statusLabel = status === 0 ? 'פתוח' : 
                                              status === 1 ? 'סגור' : 
                                              status === 2 ? 'סגור ידנית' : 
                                              status === 3 ? 'מבטל מסמך אחר' : 
                                              status === 4 ? 'מבוטל' : 'לא ידוע';
                            const dates = parseDocumentDates(rawDoc);
                            const payMethod = paymentMethodFromRaw(rawDoc);
                            const chequeDetails = chequeDetailsFromRaw(rawDoc);
                            // Infer type & label from raw doc (305=invoice, 320=invoice_receipt, 400=receipt, 330=credit, 10=estimate)
                            const rawType = rawDoc.type;
                            const inferredType: DocumentInfoType = rawType === 320 ? 'invoice_receipt' : rawType === 400 ? 'receipt' : rawType === 330 ? 'credit' : rawType === 10 ? 'estimate' : rawType === 305 ? 'invoice' : doc.type;
                            const inferredLabel = rawType === 320 ? 'חשבונית מס + קבלה' : rawType === 400 ? 'קבלה' : rawType === 330 ? 'חשבונית זיכוי' : rawType === 10 ? 'הצעת מחיר' : rawType === 305 ? 'חשבונית מס' : doc.label;
                            docs.push({
                                id: doc.id,
                                type: inferredType,
                                label: inferredLabel,
                                status: status === 0 ? 'opened' : status === 1 || status === 2 ? 'closed' : status === 4 ? 'canceled' : 'draft',
                                statusLabel,
                                date: dates.dateStr,
                                createdAtTimestamp: dates.createdAtTimestamp,
                                documentDateDisplay: dates.documentDateDisplay,
                                issuedAtDisplay: dates.issuedAtDisplay,
                                amount: rawDoc.amount ?? rawDoc.total,
                                currency: rawDoc.currency || 'ILS',
                                number: rawDoc.number?.toString() || rawDoc.short_code,
                                description: rawDoc.description || undefined,
                                paymentMethod: payMethod,
                                chequeReference: chequeDetails.reference,
                                chequeRepaymentDate: chequeDetails.repaymentDate,
                                signed: rawDoc.signed,
                                cancellable: rawDoc.cancellable !== false,
                                url: rawDoc.url?.he || rawDoc.url?.origin
                            });
                            docIdsSeen.add(doc.id);
                        } else {
                            docs.push({
                                id: doc.id,
                                type: doc.type,
                                label: doc.label,
                                status: 'unavailable',
                                statusLabel: 'לא נטען',
                                number: undefined,
                                date: undefined,
                                createdAtTimestamp: 0,
                                description: undefined,
                                amount: undefined,
                                paymentMethod: undefined
                            });
                            docIdsSeen.add(doc.id);
                        }
                    } catch (error) {
                        console.error(`Error fetching document ${doc.id}:`, error);
                        docs.push({
                            id: doc.id,
                            type: doc.type,
                            label: doc.label,
                            status: 'unavailable',
                            statusLabel: 'לא נטען',
                            number: undefined,
                            date: undefined,
                            createdAtTimestamp: 0,
                            description: undefined,
                            amount: undefined,
                            paymentMethod: undefined
                        });
                        docIdsSeen.add(doc.id);
                    }
                }

                // Second: Search for all documents by order number (to find documents not stored in order)
                if (order.orderNumber) {
                    try {
                        const searchResponse = await fetch(`/api/green-invoice/documents/search/${order.orderNumber}`, {
                            headers: {
                                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                            }
                        });
                        
                        if (searchResponse.ok) {
                            const foundDocuments = await searchResponse.json();
                            
                            for (const foundDoc of foundDocuments) {
                                // Skip if we already have this document
                                if (docIdsSeen.has(foundDoc.id)) {
                                    continue;
                                }
                                
                                // Determine document type from the document data
                                let docType: DocumentInfoType = 'invoice';
                                let docLabel = 'מסמך';
                                
                                if (foundDoc.type === 10) {
                                    docType = 'estimate';
                                    docLabel = 'הצעת מחיר';
                                } else if (foundDoc.type === 305) {
                                    docType = 'invoice';
                                    docLabel = 'חשבונית מס';
                                } else if (foundDoc.type === 320) {
                                    docType = 'invoice_receipt';
                                    docLabel = 'חשבונית מס + קבלה';
                                } else if (foundDoc.type === 400) {
                                    docType = 'receipt';
                                    docLabel = 'קבלה';
                                } else if (foundDoc.type === 330) {
                                    docType = 'credit';
                                    docLabel = 'חשבונית זיכוי';
                                }
                                
                                const status = foundDoc.status;
                                const statusLabel = status === 0 ? 'פתוח' : 
                                                  status === 1 ? 'סגור' : 
                                                  status === 2 ? 'סגור ידנית' : 
                                                  status === 3 ? 'מבטל מסמך אחר' : 
                                                  status === 4 ? 'מבוטל' : 'לא ידוע';
                                
                                const dates = parseDocumentDates(foundDoc);
                                const payMethod = paymentMethodFromRaw(foundDoc);
                                const chequeDetails = chequeDetailsFromRaw(foundDoc);
                                docs.push({
                                    id: foundDoc.id,
                                    type: docType,
                                    label: docLabel,
                                    status: status === 0 ? 'opened' : status === 1 || status === 2 ? 'closed' : status === 4 ? 'canceled' : 'draft',
                                    statusLabel,
                                    date: dates.dateStr,
                                    createdAtTimestamp: dates.createdAtTimestamp,
                                    documentDateDisplay: dates.documentDateDisplay,
                                    issuedAtDisplay: dates.issuedAtDisplay,
                                    amount: foundDoc.amount ?? foundDoc.total,
                                    currency: foundDoc.currency || 'ILS',
                                    number: foundDoc.number?.toString() || foundDoc.short_code,
                                    description: foundDoc.description || undefined,
                                    paymentMethod: payMethod,
                                    chequeReference: chequeDetails.reference,
                                    chequeRepaymentDate: chequeDetails.repaymentDate,
                                    signed: foundDoc.signed,
                                    cancellable: foundDoc.cancellable !== false,
                                    url: foundDoc.url?.he || foundDoc.url?.origin
                                });
                                docIdsSeen.add(foundDoc.id);
                            }
                        }
                    } catch (error) {
                        console.error('Error searching documents by order number:', error);
                        // Continue even if search fails
                    }
                }
            } catch (error) {
                console.error('Error fetching documents:', error);
            } finally {
                setLoading(false);
            }

            // מיון מהחדש לישן לפי תאריך ושעת יצירה/הנפקה
            docs.sort((a, b) => (b.createdAtTimestamp ?? 0) - (a.createdAtTimestamp ?? 0));
            setDocuments(docs);
        };

        // Always fetch documents if order has orderNumber (for search) or has any stored document IDs
        if (order.orderNumber || order.greenInvoiceId || order.greenInvoiceReceiptId || order.greenInvoiceCreditId || order.greenInvoiceEstimateId) {
            fetchDocumentDetails();
        }
    }, [order.id, order.orderNumber, order.greenInvoiceId, order.greenInvoiceReceiptId, order.greenInvoiceCreditId, order.greenInvoiceEstimateId, refreshTrigger]);

    // Fetch customer documents when opening link form
    useEffect(() => {
        if (!showLinkForm || !customerGreenInvoiceClientId || !onLinkDocument) return;
        setLoadingCustomerDocs(true);
        fetch(`/api/green-invoice/documents/by-client/${customerGreenInvoiceClientId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
        })
            .then(r => r.ok ? r.json() : { documents: [] })
            .then(data => setCustomerDocs(data.documents || []))
            .catch(() => setCustomerDocs([]))
            .finally(() => setLoadingCustomerDocs(false));
    }, [showLinkForm, customerGreenInvoiceClientId, onLinkDocument]);

    const docTypeLabel = (t: number) => {
        if (t === 10) return 'הצעת מחיר';
        if (t === 305) return 'חשבונית מס';
        if (t === 320) return 'חשבונית מס+קבלה';
        if (t === 330) return 'חשבונית זיכוי';
        if (t === 400) return 'קבלה';
        if (t === 200) return 'תעודת משלוח';
        if (t === 300) return 'חשבון עסקה';
        return 'מסמך';
    };

    const handleQuickView = async (doc: DocumentInfo) => {
        setPreviewLoading(true);
        setPreviewDoc({ id: doc.id, type: doc.type, label: doc.label, blobUrl: '' });
        try {
            const token = localStorage.getItem('authToken');
            const apiType = apiTypeFromDoc(doc.type);
            const res = await fetch(`/api/green-invoice/documents/${doc.id}/view?type=${apiType}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) throw new Error('Failed to load PDF');
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            setPreviewDoc((p) => p ? { ...p, blobUrl } : null);
        } catch (e) {
            console.error('Quick view error:', e);
            setPreviewDoc(null);
            if (onOpenInGreenInvoice) onOpenInGreenInvoice(doc.id, doc.type);
        } finally {
            setPreviewLoading(false);
        }
    };

    const closePreview = () => {
        setPreviewDoc((p) => {
            if (p?.blobUrl) URL.revokeObjectURL(p.blobUrl);
            return null;
        });
    };

    useEffect(() => {
        if (!previewDoc) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreview(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [previewDoc]);

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'opened': return 'bg-blue-100 text-blue-800';
            case 'closed': return 'bg-green-100 text-green-800';
            case 'canceled': return 'bg-red-100 text-red-800';
            case 'draft': return 'bg-yellow-100 text-yellow-800';
            case 'unavailable': return 'bg-slate-100 text-slate-600';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    if (loading) {
        return (
            <div className="text-center text-slate-400 text-sm py-4">
                טוען מסמכים...
            </div>
        );
    }

    if (documents.length === 0) {
        return (
            <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">מסמכים חשבונאיים:</h4>
                <div className="flex items-center gap-1">
                    {onLinkDocument && (
                        <button
                            type="button"
                            onClick={() => setShowLinkForm(!showLinkForm)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors text-xs font-medium"
                            title="שייך מסמך מחשבונית ירוקה"
                        >
                            שייך מסמך
                        </button>
                    )}
                    {onOpenCreateModal && (
                        <button
                            type="button"
                            onClick={() => onOpenCreateModal('full')}
                            className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
                            title="צור מסמך חדש"
                        >
                            <PlusIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>
            {onLinkDocument && showLinkForm && (
                <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
                    {customerGreenInvoiceClientId && (
                        <div>
                            <label className="block text-xs font-bold text-emerald-800 mb-1">בחר מסמך מרשימת הלקוח</label>
                            {loadingCustomerDocs ? (
                                <div className="text-sm text-slate-500 py-2">טוען מסמכים...</div>
                            ) : docsAvailableToLink.length > 0 ? (
                                <select
                                    value={linkDocId}
                                    onChange={e => setLinkDocId(e.target.value)}
                                    className="w-full text-sm border border-emerald-300 rounded px-2 py-1.5 bg-white"
                                >
                                    <option value="">-- בחר מסמך --</option>
                                    {docsAvailableToLink.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {docTypeLabel(Number(d.type))} #{d.number ?? d.id} — ₪{(d.amount ?? d.total ?? 0).toLocaleString()} — {(d.description || '').slice(0, 40)}
                                        </option>
                                    ))}
                                </select>
                            ) : customerDocs.length > 0 ? (
                                <div className="text-xs text-amber-700">כל המסמכים כבר משויכים להזמנה</div>
                            ) : (
                                <div className="text-xs text-slate-500">לא נמצאו מסמכים או שהלקוח לא משויך בחשבונית ירוקה</div>
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="text"
                            value={linkDocId}
                            onChange={e => setLinkDocId(e.target.value)}
                            placeholder="או הזן מזהה מסמך ידנית"
                            className="flex-1 min-w-[120px] text-sm border border-emerald-300 rounded px-2 py-1.5"
                        />
                        <button
                            type="button"
                            onClick={async () => {
                                const id = linkDocId.trim();
                                if (!id) return;
                                setLinkLoading(true);
                                try {
                                    await onLinkDocument(id);
                                    setLinkDocId('');
                                    setShowLinkForm(false);
                                    setRefreshTrigger(t => t + 1);
                                } finally {
                                    setLinkLoading(false);
                                }
                            }}
                            disabled={!linkDocId.trim() || linkLoading}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {linkLoading ? 'משייך...' : 'שייך'}
                        </button>
                    </div>
                </div>
            )}
            <div className="text-center text-slate-400 text-sm py-4">
                אין מסמכים חשבונאיים מקושרים להזמנה זו
            </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">מסמכים חשבונאיים:</h4>
                <div className="flex items-center gap-1">
                    {onLinkDocument && (
                        <button
                            type="button"
                            onClick={() => setShowLinkForm(!showLinkForm)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors text-xs font-medium"
                            title="שייך מסמך מחשבונית ירוקה"
                        >
                            שייך מסמך
                        </button>
                    )}
                    {onOpenCreateModal && (
                        <button
                            type="button"
                            onClick={() => onOpenCreateModal('full')}
                            className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors"
                            title="צור מסמך חדש"
                        >
                            <PlusIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>
            {onLinkDocument && showLinkForm && (
                <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
                    {customerGreenInvoiceClientId && (
                        <div>
                            <label className="block text-xs font-bold text-emerald-800 mb-1">בחר מסמך מרשימת הלקוח</label>
                            {loadingCustomerDocs ? (
                                <div className="text-sm text-slate-500 py-2">טוען מסמכים...</div>
                            ) : docsAvailableToLink.length > 0 ? (
                                <select
                                    value={linkDocId}
                                    onChange={e => setLinkDocId(e.target.value)}
                                    className="w-full text-sm border border-emerald-300 rounded px-2 py-1.5 bg-white"
                                >
                                    <option value="">-- בחר מסמך --</option>
                                    {docsAvailableToLink.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {docTypeLabel(Number(d.type))} #{d.number ?? d.id} — ₪{(d.amount ?? d.total ?? 0).toLocaleString()} — {(d.description || '').slice(0, 40)}
                                        </option>
                                    ))}
                                </select>
                            ) : customerDocs.length > 0 ? (
                                <div className="text-xs text-amber-700">כל המסמכים כבר משויכים להזמנה</div>
                            ) : (
                                <div className="text-xs text-slate-500">לא נמצאו מסמכים או שהלקוח לא משויך בחשבונית ירוקה</div>
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="text"
                            value={linkDocId}
                            onChange={e => setLinkDocId(e.target.value)}
                            placeholder="או הזן מזהה מסמך ידנית"
                            className="flex-1 min-w-[120px] text-sm border border-emerald-300 rounded px-2 py-1.5"
                        />
                        <button
                            type="button"
                            onClick={async () => {
                                const id = linkDocId.trim();
                                if (!id) return;
                                setLinkLoading(true);
                                try {
                                    await onLinkDocument(id);
                                    setLinkDocId('');
                                    setShowLinkForm(false);
                                    setRefreshTrigger(t => t + 1);
                                } finally {
                                    setLinkLoading(false);
                                }
                            }}
                            disabled={!linkDocId.trim() || linkLoading}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {linkLoading ? 'משייך...' : 'שייך'}
                        </button>
                    </div>
                </div>
            )}
            {previewDoc && (
                <div className="fixed inset-0 z-50 flex flex-col bg-black/70" role="dialog" aria-modal="true" aria-label="מבט מהיר במסמך">
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-800 text-white shrink-0">
                        <span className="font-medium">{previewDoc.label}</span>
                        <button
                            type="button"
                            onClick={closePreview}
                            className="p-2 rounded hover:bg-slate-600 transition-colors"
                            aria-label="סגור"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"> <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /> </svg>
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 p-2 flex items-center justify-center">
                        {previewLoading || !previewDoc.blobUrl ? (
                            <div className="text-white flex flex-col items-center gap-3">
                                <svg className="animate-spin h-10 w-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span>טוען מסמך...</span>
                            </div>
                        ) : (
                            <iframe
                                src={previewDoc.blobUrl}
                                title={previewDoc.label}
                                className="w-full h-full rounded-lg bg-white"
                            />
                        )}
                    </div>
                </div>
            )}
            {documents.map((doc) => (
                <div
                    key={doc.id}
                    className="p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                >
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <div className="font-medium text-slate-800">{doc.label}</div>
                                {doc.statusLabel && (
                                    <span
                                        className={`text-xs px-2 py-1 rounded font-medium ${getStatusColor(doc.status)}`}
                                        title={doc.statusLabel === 'לא נטען' || doc.statusLabel === 'טיוטה' ? 'פרטי המסמך לא נטענו מחשבונית ירוקה. ייתכן בעיית הרשאות או שהמסמך לא זמין. נסה לפתוח בחשבונית ירוקה.' : undefined}
                                    >
                                        {doc.statusLabel}
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                                {doc.number != null && doc.number !== '' && (
                                    <div><span className="font-medium text-slate-500">מספר מסמך:</span> {doc.number}</div>
                                )}
                                {(doc.documentDateDisplay ?? doc.date) != null && (doc.documentDateDisplay ?? doc.date) !== '' && (
                                    <div><span className="font-medium text-slate-500">תאריך המסמך:</span> {doc.documentDateDisplay ?? doc.date}</div>
                                )}
                                {doc.issuedAtDisplay != null && doc.issuedAtDisplay !== '' && (
                                    <div><span className="font-medium text-slate-500">הופק ב־</span> {doc.issuedAtDisplay}</div>
                                )}
                                {doc.description != null && doc.description !== '' && (
                                    <div className="col-span-2"><span className="font-medium text-slate-500">כותרת:</span> {doc.description}</div>
                                )}
                                {doc.amount != null && (
                                    <div><span className="font-medium text-slate-500">סכום:</span> {doc.amount.toLocaleString('he-IL')} {doc.currency || '₪'}</div>
                                )}
                                {doc.paymentMethod != null && doc.paymentMethod !== '' && (
                                    <div><span className="font-medium text-slate-500">אמצעי תשלום:</span> {doc.paymentMethod}</div>
                                )}
                                {doc.paymentMethod === 'צ\'ק' && (doc.chequeReference != null || doc.chequeRepaymentDate != null) && (
                                    <div className="col-span-2 text-xs font-bold text-indigo-700">
                                        {doc.chequeReference != null && <span>מס׳ צ׳ק: {doc.chequeReference}</span>}
                                        {doc.chequeReference != null && doc.chequeRepaymentDate != null && ' · '}
                                        {doc.chequeRepaymentDate != null && <span>פירעון: {new Date(doc.chequeRepaymentDate).toLocaleDateString('he-IL')}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            {/* Quick View Button */}
                            <button
                                type="button"
                                onClick={() => handleQuickView(doc)}
                                className="p-2 text-primary hover:bg-primary/10 rounded-md transition-colors"
                                title="מבט מהיר"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                </svg>
                            </button>
                            {/* Download Button */}
                            {onDownload && (
                                <button
                                    type="button"
                                    onClick={() => onDownload(doc.id, doc.type)}
                                    className="p-2 text-primary hover:bg-primary/10 rounded-md transition-colors"
                                    title="הורד PDF"
                                >
                                    <DownloadIcon className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2 pt-3 border-t border-slate-200 flex-wrap">
                        {onOpenInGreenInvoice && (
                            <button
                                type="button"
                                onClick={() => onOpenInGreenInvoice(doc.id, doc.type)}
                                className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-indigo-700 transition-colors"
                            >
                                פתח בחשבונית ירוקה
                            </button>
                        )}
                        {onOpenCreateModal && (doc.type === 'estimate' || doc.type === 'invoice' || doc.type === 'invoice_receipt') && (
                            <button
                                type="button"
                                onClick={() => onOpenCreateModal('from-document', doc.type === 'invoice_receipt' ? 'invoice' : doc.type, doc.id)}
                                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-1"
                                title={doc.type === 'estimate' ? 'הנפקה מהצעת מחיר (הזמנה עבודה, חשבון עסקה, חשבונית מס, חשבונית מס/קבלה, קבלה)' : 'הנפקה מחשבונית (תעודת משלוח, חשבון עסקה, קבלה)'}
                            >
                                <PlusIcon className="w-4 h-4" /> הנפקה
                            </button>
                        )}
                        {onCancelDocument && doc.cancellable && (doc.type === 'invoice' || doc.type === 'invoice_receipt' || doc.type === 'receipt') && (
                            <button
                                type="button"
                                disabled={!canCancelDocument}
                                onClick={() => {
                                    if (!canCancelDocument) return;
                                    const msg = doc.type === 'invoice'
                                        ? 'האם אתה בטוח שברצונך לבטל את המסמך? פעולה זו תיצור חשבונית זיכוי.'
                                        : doc.type === 'invoice_receipt'
                                        ? 'האם אתה בטוח שברצונך לבטל את המסמך? ייפתח חלון חשבונית ירוקה ליצירת חשבונית זיכוי וקבלה שלילית.'
                                        : 'האם אתה בטוח שברצונך לבטל את הקבלה? ייפתח חלון חשבונית ירוקה ליצירת קבלה שלילית.';
                                    if (window.confirm(msg)) {
                                        onCancelDocument(doc.id, doc.type);
                                    }
                                }}
                                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={!canCancelDocument ? 'ביטול מסמך – למנהל בלבד' : doc.type === 'invoice' ? 'ביטול מסמך (יצירת חשבונית זיכוי)' : doc.type === 'invoice_receipt' ? 'ביטול מסמך (חשבונית זיכוי + קבלה שלילית)' : 'ביטול קבלה (הפקת קבלה שלילית)'}
                            >
                                ביטול
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default DocumentViewer;
