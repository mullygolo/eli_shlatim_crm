import React, { useState, useEffect } from 'react';
import { Order } from '../types';
import { DownloadIcon, PlusIcon } from './icons';

interface DocumentViewerProps {
    order: Order;
    onDownload?: (documentId: string, type: 'invoice' | 'receipt' | 'credit' | 'estimate') => void;
    onOpenInGreenInvoice?: (documentId: string, type: 'invoice' | 'receipt' | 'credit' | 'estimate') => void;
    /** פתיחת מודל: 'full' = כל הסוגים. 'from-document' + fromDocumentType = אופציות לפי סוג המסמך (הצעת מחיר vs חשבונית/קבלה) */
    onOpenCreateModal?: (mode: 'full' | 'from-document', fromDocumentType?: 'invoice' | 'receipt' | 'credit' | 'estimate') => void;
    onCancelDocument?: (documentId: string, type: 'invoice' | 'receipt' | 'credit' | 'estimate') => void;
}

interface DocumentInfo {
    id: string;
    type: 'invoice' | 'receipt' | 'credit' | 'estimate';
    label: string;
    status?: 'opened' | 'closed' | 'canceled' | 'draft';
    statusLabel?: string;
    date?: string;
    amount?: number;
    currency?: string;
    number?: string;
    /** כותרת המסמך (תיאור) */
    description?: string;
    /** אמצעי תשלום אם קיים */
    paymentMethod?: string;
    signed?: boolean;
    cancellable?: boolean;
    url?: string;
}

const apiTypeFromDoc = (t: 'invoice' | 'receipt' | 'credit' | 'estimate') =>
    t === 'credit' ? 'credit_invoice' : t;

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

const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
    order, 
    onDownload, 
    onOpenInGreenInvoice,
    onOpenCreateModal,
    onCancelDocument
}) => {
    const [documents, setDocuments] = useState<DocumentInfo[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [previewDoc, setPreviewDoc] = useState<{ id: string; type: 'invoice' | 'receipt' | 'credit' | 'estimate'; label: string; blobUrl: string } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Fetch document details from API - both by ID and by order number search
    useEffect(() => {
        const fetchDocumentDetails = async () => {
            const docs: DocumentInfo[] = [];
            const docIdsSeen = new Set<string>(); // Track seen document IDs to avoid duplicates
            setLoading(true);

            try {
                // First: Fetch documents by their stored IDs
                const documentIds = [
                    { id: order.greenInvoiceId, type: 'invoice' as const, label: 'חשבונית מס' },
                    { id: order.greenInvoiceReceiptId, type: 'receipt' as const, label: 'קבלה' },
                    { id: order.greenInvoiceCreditId, type: 'credit' as const, label: 'חשבונית זיכוי' },
                    { id: order.greenInvoiceEstimateId, type: 'estimate' as const, label: 'הצעת מחיר' }
                ].filter(doc => doc.id);

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
                            const creationDate = rawDoc.creationDate ?? rawDoc.documentDate;
                            const dateStr = typeof creationDate === 'number'
                                ? new Date(creationDate * 1000).toLocaleDateString('he-IL')
                                : creationDate
                                    ? new Date(creationDate).toLocaleDateString('he-IL')
                                    : undefined;
                            const payMethod = paymentMethodFromRaw(rawDoc);
                            docs.push({
                                id: doc.id,
                                type: doc.type,
                                label: doc.label,
                                status: status === 0 ? 'opened' : status === 1 || status === 2 ? 'closed' : status === 4 ? 'canceled' : 'draft',
                                statusLabel,
                                date: dateStr,
                                amount: rawDoc.amount ?? rawDoc.total,
                                currency: rawDoc.currency || 'ILS',
                                number: rawDoc.number?.toString() || rawDoc.short_code,
                                description: rawDoc.description || undefined,
                                paymentMethod: payMethod,
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
                                status: 'draft',
                                statusLabel: 'טיוטה',
                                number: undefined,
                                date: undefined,
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
                            status: 'draft',
                            statusLabel: 'טיוטה',
                            number: undefined,
                            date: undefined,
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
                                let docType: 'invoice' | 'receipt' | 'credit' | 'estimate' = 'invoice';
                                let docLabel = 'מסמך';
                                
                                if (foundDoc.type === 10) {
                                    docType = 'estimate';
                                    docLabel = 'הצעת מחיר';
                                } else if (foundDoc.type === 305) {
                                    docType = 'invoice';
                                    docLabel = 'חשבונית מס';
                                } else if (foundDoc.type === 320) {
                                    docType = 'invoice';
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
                                
                                const creationDate = foundDoc.creationDate ?? foundDoc.documentDate;
                                const dateStr = typeof creationDate === 'number'
                                    ? new Date(creationDate * 1000).toLocaleDateString('he-IL')
                                    : creationDate
                                        ? new Date(creationDate).toLocaleDateString('he-IL')
                                        : undefined;
                                const payMethod = paymentMethodFromRaw(foundDoc);
                                docs.push({
                                    id: foundDoc.id,
                                    type: docType,
                                    label: docLabel,
                                    status: status === 0 ? 'opened' : status === 1 || status === 2 ? 'closed' : status === 4 ? 'canceled' : 'draft',
                                    statusLabel,
                                    date: dateStr,
                                    amount: foundDoc.amount ?? foundDoc.total,
                                    currency: foundDoc.currency || 'ILS',
                                    number: foundDoc.number?.toString() || foundDoc.short_code,
                                    description: foundDoc.description || undefined,
                                    paymentMethod: payMethod,
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

            setDocuments(docs);
        };

        // Always fetch documents if order has orderNumber (for search) or has any stored document IDs
        if (order.orderNumber || order.greenInvoiceId || order.greenInvoiceReceiptId || order.greenInvoiceCreditId || order.greenInvoiceEstimateId) {
            fetchDocumentDetails();
        }
    }, [order.orderNumber, order.greenInvoiceId, order.greenInvoiceReceiptId, order.greenInvoiceCreditId, order.greenInvoiceEstimateId]);

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
            <div className="text-center text-slate-400 text-sm py-4">
                אין מסמכים חשבונאיים מקושרים להזמנה זו
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">מסמכים חשבונאיים:</h4>
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
                                        title={doc.statusLabel === 'טיוטה' ? 'פרטי המסמך לא נטענו – ייתכן טיוטה או שגיאה. נסה לפתוח בחשבונית ירוקה.' : undefined}
                                    >
                                        {doc.statusLabel}
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                                {doc.number != null && doc.number !== '' && (
                                    <div><span className="font-medium text-slate-500">מספר מסמך:</span> {doc.number}</div>
                                )}
                                {doc.date != null && doc.date !== '' && (
                                    <div><span className="font-medium text-slate-500">תאריך יצירה:</span> {doc.date}</div>
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
                        {onOpenCreateModal && (
                            <button
                                type="button"
                                onClick={() => onOpenCreateModal('from-document', doc.type)}
                                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-1"
                                title={doc.type === 'estimate' ? 'הנפקה מהצעת מחיר (הזמנה עבודה, חשבון עסקה, חשבונית מס, קבלה)' : 'הנפקה (תעודת משלוח, חשבון עסקה, קבלה)'}
                            >
                                <PlusIcon className="w-4 h-4" /> הנפקה
                            </button>
                        )}
                        {onCancelDocument && doc.cancellable && doc.type === 'invoice' && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm('האם אתה בטוח שברצונך לבטל את המסמך? פעולה זו תיצור חשבונית זיכוי.')) {
                                        onCancelDocument(doc.id, doc.type);
                                    }
                                }}
                                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                                title="ביטול מסמך (יצירת חשבונית זיכוי)"
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
