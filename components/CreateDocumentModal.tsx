import React, { useState, useMemo, useEffect } from 'react';
import { Order, Customer, PaymentMethod } from '../types';
import Modal from './Modal';
import { PlusIcon, DeleteIcon } from './icons';

type GreenInvoiceDocumentType = 'invoice' | 'receipt' | 'invoice_receipt' | 'credit_invoice' | 'estimate' | 'work_order' | 'delivery_note' | 'transaction_account';

export interface ReceiptPaymentItem {
    id: string;
    amount: number;
    date: Date;
    method: PaymentMethod;
    reference?: string;
    repaymentDate?: Date;
}

interface CreateDocumentModalProps {
    order: Order;
    customer: Customer;
    onClose: () => void;
    onCreate: (documentType: GreenInvoiceDocumentType, method: 'api' | 'window', paymentsOverride?: ReceiptPaymentItem[]) => void;
    /** יתרת המסמך להנפקת קבלה (יתרה לתשלום) — להצגה וברירת מחדל לסכום תקבול */
    balanceDue?: number;
    /** 'full' = כל האפשרויות. 'from-document' = תעודת משלוח, חשבון עסקה, קבלה (מתוך חשבונית/קבלה). 'from-estimate' = הזמנה עבודה, חשבון עסקה, חשבונית מס, חשבונית מס/קבלה, קבלה (מתוך הצעת מחיר) */
    mode?: 'full' | 'from-document';
    /** כאשר mode === 'from-document': סוג המסמך שממנו נפתח (estimate → FROM_ESTIMATE, אחרת → FROM_DOCUMENT) */
    fromDocumentType?: 'invoice' | 'receipt' | 'credit' | 'estimate';
    /** כאשר mode === 'from-document': מזהה המסמך שממנו נפתח (לקבלה מתוך חשבונית ספציפית) */
    sourceDocumentId?: string;
    /** מצב טעינה - משבית את הכפתור בזמן יצירת מסמך */
    isLoading?: boolean;
}

// + הראשי — אין קבלה מתוך חשבונית (רק מתוך + של חשבונית קיימת)
const FULL_TYPES: { value: GreenInvoiceDocumentType; label: string; description: string; disabled?: boolean }[] = [
    { value: 'estimate', label: 'הצעת מחיר', description: 'יצירת הצעת מחיר (טיוטה) - ניתן להמיר לחשבונית מאוחר יותר' },
    { value: 'invoice', label: 'חשבונית מס', description: 'יצירת חשבונית מס רגילה' },
    { value: 'invoice_receipt', label: 'חשבונית מס / קבלה', description: 'מסמך משולב של חשבונית מס וקבלה' },
    { value: 'credit_invoice', label: 'חשבונית זיכוי', description: 'יצירת חשבונית זיכוי מתוך חשבונית קיימת', disabled: false }
];

/** מתוך חשבונית/קבלה: תעודת משלוח, חשבון עסקה, קבלה (כמו + בחשבונית ירוקה) */
const FROM_DOCUMENT_TYPES: { value: GreenInvoiceDocumentType; label: string; description: string; disabled?: boolean }[] = [
    { value: 'delivery_note', label: 'תעודת משלוח', description: 'הנפקת תעודת משלוח' },
    { value: 'transaction_account', label: 'חשבון עסקה', description: 'הנפקת חשבון עסקה' },
    { value: 'receipt', label: 'קבלה', description: 'הנפקת קבלה מתוך חשבונית קיימת', disabled: false }
];

/** מתוך הצעת מחיר: הזמנה עבודה, חשבון עסקה, חשבונית מס, חשבונית מס/קבלה, קבלה (כמו + בחשבונית ירוקה) */
const FROM_ESTIMATE_TYPES: { value: GreenInvoiceDocumentType; label: string; description: string; disabled?: boolean }[] = [
    { value: 'work_order', label: 'הזמנה עבודה', description: 'הנפקת הזמנת עבודה מהצעת מחיר' },
    { value: 'transaction_account', label: 'חשבון עסקה', description: 'הנפקת חשבון עסקה' },
    { value: 'invoice', label: 'חשבונית מס', description: 'הנפקת חשבונית מס' },
    { value: 'invoice_receipt', label: 'חשבונית מס / קבלה', description: 'הנפקת חשבונית מס וקבלה' },
    { value: 'receipt', label: 'קבלה', description: 'הנפקת קבלה' }
];

const CreateDocumentModal: React.FC<CreateDocumentModalProps> = ({ order, customer, onClose, onCreate, mode = 'full', fromDocumentType, sourceDocumentId, balanceDue = 0, isLoading = false }) => {
    const [selectedType, setSelectedType] = useState<GreenInvoiceDocumentType | ''>('');
    const [selectedMethod, setSelectedMethod] = useState<'api' | 'window'>('api');
    const [receiptPayments, setReceiptPayments] = useState<ReceiptPaymentItem[]>([]);

    const fromEstimate = mode === 'from-document' && fromDocumentType === 'estimate';
    const documentTypes = mode === 'from-document'
        ? (fromEstimate ? FROM_ESTIMATE_TYPES : FROM_DOCUMENT_TYPES)
        : FULL_TYPES;
    const resolvedTypes = documentTypes.map((t) => {
        if (fromEstimate) return { ...t, disabled: false };
        return {
            ...t,
            disabled: t.disabled ?? (t.value === 'credit_invoice' ? !order.greenInvoiceId : false)
        };
    });

    const isReceiptOrInvoiceReceipt = selectedType === 'receipt' || selectedType === 'invoice_receipt';
    // קבלה מתוך חשבונית או חשבונית מס/קבלה מהכפתור הראשי — מציגים טופס פרטי תקבול
    const showReceiptPaymentsForm =
        (mode === 'full' && selectedType === 'invoice_receipt') ||
        (mode === 'from-document' && fromDocumentType === 'invoice' && selectedType === 'receipt' && !!sourceDocumentId);

    useEffect(() => {
        if (!showReceiptPaymentsForm) {
            setReceiptPayments([]);
            return;
        }
        if (receiptPayments.length === 0) {
            const defaultAmount = balanceDue > 0 ? balanceDue : 1;
            setReceiptPayments([{ id: `rp_${Date.now()}`, amount: defaultAmount, date: new Date(), method: PaymentMethod.BANK_TRANSFER, reference: '', repaymentDate: undefined }]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only add when entering form with empty
    }, [showReceiptPaymentsForm, balanceDue]);
    const receiptsTotal = useMemo(() => receiptPayments.reduce((s, p) => s + (p.amount || 0), 0), [receiptPayments]);
    const receiptsRemaining = Math.max(0, balanceDue - receiptsTotal);

    const addReceiptPayment = () => {
        const defaultAmount = receiptsRemaining > 0.01 ? receiptsRemaining : balanceDue > 0 ? balanceDue : 0;
        setReceiptPayments((prev) => [
            ...prev,
            {
                id: `rp_${Date.now()}`,
                amount: defaultAmount,
                date: new Date(),
                method: PaymentMethod.BANK_TRANSFER,
                reference: '',
                repaymentDate: undefined
            }
        ]);
    };

    const updateReceiptPayment = (id: string, patch: Partial<ReceiptPaymentItem>) => {
        setReceiptPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    };

    const removeReceiptPayment = (id: string) => {
        setReceiptPayments((prev) => prev.filter((p) => p.id !== id));
    };

    const handleCreate = () => {
        if (selectedType && selectedType !== '') {
            // קבלה / חשבונית מס/קבלה — אם מילאו פרטי תקבול: שליחה ישירה (API). אחרת: פתיחת חלון.
            const useApiWithPayments = showReceiptPaymentsForm && receiptPayments.length > 0 && receiptPayments.some(p => (p.amount || 0) > 0);
            const useWindowForReceipt = (selectedType === 'receipt' || selectedType === 'invoice_receipt') && !useApiWithPayments;
            const method = useApiWithPayments ? 'api' : (useWindowForReceipt ? 'window' : (mode === 'from-document' ? 'api' : selectedMethod));
            const override = useApiWithPayments ? receiptPayments : undefined;
            onCreate(selectedType as GreenInvoiceDocumentType, method, override);
        }
    };

    return (
        <Modal title="צור מסמך חשבונאי בחשבונית ירוקה" onClose={onClose} size="lg">
            <div className="space-y-6">
                {/* Document Type Selection */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-3">
                        בחר סוג מסמך:
                    </label>
                    <div className="space-y-2">
                        {resolvedTypes.map((type) => (
                            <label
                                key={type.value}
                                className={`flex items-start p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                    selectedType === type.value
                                        ? 'border-primary bg-primary/5'
                                        : type.disabled
                                        ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                                        : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="documentType"
                                    value={type.value}
                                    checked={selectedType === type.value}
                                    onChange={(e) => setSelectedType(e.target.value as GreenInvoiceDocumentType)}
                                    disabled={type.disabled}
                                    className="mt-1 me-3 h-4 w-4 text-primary focus:ring-primary"
                                />
                                <div className="flex-1">
                                    <div className="font-medium text-slate-800">{type.label}</div>
                                    <div className="text-sm text-slate-500 mt-1">{type.description}</div>
                                    {type.disabled && (
                                        <div className="text-xs text-orange-600 mt-1">
                                            נדרשת חשבונית קיימת
                                        </div>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Creation Method Selection — רק במצב full; קבלה/חשבונית+קבלה תמיד פותחים חלון */}
                {selectedType && mode === 'full' && !isReceiptOrInvoiceReceipt && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">
                            בחר שיטת יצירה:
                        </label>
                        <div className="space-y-2">
                            <label
                                className={`flex items-start p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                    selectedMethod === 'api'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="creationMethod"
                                    value="api"
                                    checked={selectedMethod === 'api'}
                                    onChange={() => setSelectedMethod('api')}
                                    className="mt-1 me-3 h-4 w-4 text-primary focus:ring-primary"
                                />
                                <div className="flex-1">
                                    <div className="font-medium text-slate-800">שליחה ישירה</div>
                                    <div className="text-sm text-slate-500 mt-1">
                                        יצירה אוטומטית דרך API - המסמך ייווצר מיד בחשבונית ירוקה
                                    </div>
                                </div>
                            </label>
                            <label
                                className={`flex items-start p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                    selectedMethod === 'window'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="creationMethod"
                                    value="window"
                                    checked={selectedMethod === 'window'}
                                    onChange={() => setSelectedMethod('window')}
                                    className="mt-1 me-3 h-4 w-4 text-primary focus:ring-primary"
                                />
                                <div className="flex-1">
                                    <div className="font-medium text-slate-800">פתיחת חלון לעריכה</div>
                                    <div className="text-sm text-slate-500 mt-1">
                                        יצירת טיוטה ממולאת עם פריטי ההזמנה, הלקוח וכל פרטי ההזמנה — נפתחת בחשבונית ירוקה מוכנה לשיגור. ערוך אם צריך ולחץ &quot;הפקת מסמך&quot; כשמוכן.
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                {/* פרטי תקבולים — קבלה/חשבונית+קבלה ב"שליחה ישירה" */}
                {showReceiptPaymentsForm && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                        <div className="font-medium text-emerald-900 mb-2">פרטי תקבולים</div>
                        <p className="text-sm text-emerald-800 mb-3">
                            יתרת המסמך: <strong>₪{balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                            {receiptPayments.length > 0 && (
                                <> — סה״כ תקבולים: <strong>₪{receiptsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                {receiptsRemaining > 0.01 && <> (יתרה: ₪{receiptsRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</>}
                                </>
                            )}
                        </p>
                        <div className="space-y-2 mb-3">
                            {receiptPayments.map((p) => (
                                <div key={p.id} className="flex flex-wrap items-center gap-2 p-2 bg-white rounded border border-emerald-100">
                                    <input type="number" value={p.amount || ''} onChange={(e) => updateReceiptPayment(p.id, { amount: parseFloat(e.target.value) || 0 })} className="w-20 text-sm border-slate-300 rounded px-2 py-1" placeholder="סכום" />
                                    <input type="date" value={p.date ? new Date(p.date).toISOString().split('T')[0] : ''} onChange={(e) => updateReceiptPayment(p.id, { date: new Date(e.target.value) })} className="w-32 text-sm border-slate-300 rounded px-2 py-1" />
                                    <select value={p.method} onChange={(e) => updateReceiptPayment(p.id, { method: e.target.value as PaymentMethod })} className="text-sm border-slate-300 rounded px-2 py-1 bg-white">
                                        {Object.values(PaymentMethod).map((m) => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <input type="text" value={p.reference || ''} onChange={(e) => updateReceiptPayment(p.id, { reference: e.target.value })} className="w-24 text-sm border-slate-300 rounded px-2 py-1" placeholder={p.method === PaymentMethod.CHECK ? 'מס׳ צ׳ק' : 'אסמכתא'} />
                                    {p.method === PaymentMethod.CHECK && (
                                        <input type="date" value={p.repaymentDate ? new Date(p.repaymentDate).toISOString().split('T')[0] : ''} onChange={(e) => updateReceiptPayment(p.id, { repaymentDate: new Date(e.target.value) })} className="w-32 text-sm border-slate-300 rounded px-2 py-1" placeholder="פירעון" />
                                    )}
                                    <button type="button" onClick={() => removeReceiptPayment(p.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="הסר"><DeleteIcon className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={addReceiptPayment} className="flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-300 rounded px-3 py-1.5 hover:bg-emerald-50">
                            <PlusIcon className="w-4 h-4" /> הוסף תשלום
                        </button>
                        <p className="text-xs text-emerald-700 mt-3 pt-3 border-t border-emerald-200">
                            <strong>כרטיס אשראי + מסך סליקה:</strong> מחק את שורת התקבול למעלה ולחץ &quot;צור מסמך&quot; — ייפתח חלון חשבונית ירוקה שם תוכל ללחוץ &quot;לחיוב באשראי&quot; → &quot;לחיוב הלקוח&quot; → מסך הסליקה.
                        </p>
                    </div>
                )}

                {/* הערה: קבלה/חשבונית+קבלה — פתיחת חלון (ממלאים בחשבונית ירוקה) */}
                {selectedType && isReceiptOrInvoiceReceipt && !showReceiptPaymentsForm && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="text-sm text-blue-800">
                            <p className="font-medium mb-1">פתיחת חלון לעריכה</p>
                            <p className="mb-2">ממלאים פרטי תקבולים <strong>בחשבונית ירוקה</strong> אחרי פתיחת הטיוטה — פירוט תקבולים (העברה, שיק, מזומן) או &quot;לחיוב באשראי&quot; → &quot;לחיוב הלקוח&quot; → <strong>מסך הסליקה</strong>.</p>
                            <p className="text-xs text-blue-700">חיוב באשראי עם עמוד הסליקה זמין רק מתוך המסמך בחשבונית ירוקה.</p>
                        </div>
                    </div>
                )}

                {/* Order Info */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-600">
                        <div><strong>הזמנה:</strong> {order.orderNumber}</div>
                        <div><strong>לקוח:</strong> {customer.name}</div>
                        {order.description && (
                            <div><strong>תיאור:</strong> {order.description}</div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300"
                    >
                        ביטול
                    </button>
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={!selectedType || isLoading}
                        className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                יוצר...
                            </>
                        ) : (
                            'צור מסמך'
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CreateDocumentModal;
