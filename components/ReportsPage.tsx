
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Order, Supplier, SupplierPayment, PaymentMethod, Attachment, LineItem, AdditionalService, OrderStatusConfiguration, TransactionStatus, TimelineEvent } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, DownloadIcon } from './icons';
import Modal from './Modal';
import { useAuth } from '../contexts/AuthContext';
import { getPayableItems } from '../services/mongoService';

// --- Helpers & Logic ---

interface PayableItem {
    uniqueId: string; // orderId + itemIndex + type
    supplierId: string;
    supplierName: string;
    orderId: string;
    orderNumber: string;
    orderDescription: string;
    itemDescription: string;
    cost: number; // Net Cost
    costGross: number; // Cost + VAT
    paidAmount: number;
    remainingAmount: number; // Gross - Paid
    orderDate: Date;
    dueDate: Date; // Calculated or Custom
    isCustomDueDate: boolean;
    status: 'שולם' | 'שולם חלקית' | 'איחור' | 'לתשלום החודש' | 'צפוי' | 'ממתין לסיום';
    timeStatus: 'איחור' | 'לתשלום החודש' | 'צפוי' | 'ממתין לסיום'; // Status based purely on time/logic, ignoring partial payments
    payments: SupplierPayment[];
    
    // Helper to locate the item in the original structure
    itemType: 'lineItem' | 'additionalService';
    itemIndex: number;
}

interface SupplierGroup {
    supplierName: string;
    totalDue: number; // Gross Total
    totalDueNet: number; // Net Total
    totalPaid: number;
    items: PayableItem[];
    isUnassigned?: boolean;
}

interface MonthlyGroup {
    monthYearKey: string; // "YYYY-MM"
    label: string; // "ינואר 2024"
    totalDue: number; // Gross Total
    totalDueNet: number; // Net Total
    totalPaid: number;
    items: PayableItem[];
    suppliers: {
        [supplierId: string]: SupplierGroup;
    };
}

// New Interface for Payment Log Grouping
interface GroupedPaymentTransaction {
    id: string; // synthetic ID
    supplierId: string;
    supplierName: string;
    date: Date;
    method: PaymentMethod;
    reference: string;
    totalAmount: number;
    notes?: string;
    attachment?: Attachment;
    sourceLinks: { 
        orderId: string;
        itemType: 'lineItem' | 'additionalService';
        itemIndex: number;
        paymentId: string;
    }[];
    itemsCovered: {
        uniqueId: string;
        orderId: string;
        orderNumber: string;
        orderDescription: string;
        itemDescription: string;
        amountPaid: number;
        itemRemaining: number;
        isItemPaidOff: boolean;
    }[];
}

// Helper to ensure date is a Date object
const ensureDate = (date: Date | string): Date => {
    if (date instanceof Date) return date;
    if (typeof date === 'string') return new Date(date);
    return new Date();
};

const calculateDueDate = (orderDate: Date | string, paymentTerms: string, customDueDate?: Date | string): Date => {
    if (customDueDate) return ensureDate(customDueDate);

    const orderDateObj = ensureDate(orderDate);
    const endOfMonth = new Date(orderDateObj.getFullYear(), orderDateObj.getMonth() + 1, 0);

    if (paymentTerms.startsWith('שוטף ')) {
        const days = parseInt(paymentTerms.split(' ')[1], 10);
        endOfMonth.setDate(endOfMonth.getDate() + days);
        return endOfMonth;
    }
    switch (paymentTerms) {
        case 'שוטף':
            return endOfMonth;
        case 'תשלום מיידי':
        case 'עם סיום העבודה': // For calculations, assume "now" if not passed specifically, but logic handles status separately
            return orderDateObj;
        default:
            // Handle simple days like "30"
            const days = parseInt(paymentTerms.replace(/\D/g, ''), 10) || 0;
            if (days > 0) {
                 const dueDate = new Date(orderDate);
                 dueDate.setDate(dueDate.getDate() + days);
                 return dueDate;
            }
            return orderDateObj;
    }
};

const exportToCSV = (filename: string, rows: any[][]) => {
    const processRow = (row: any[]) => {
        return row.map(val => {
            if (val === null || val === undefined) return '';
            let result = val.toString();
            if (val instanceof Date) result = val.toLocaleString('he-IL');
            result = result.replace(/"/g, '""');
            if (result.search(/("|,|\n)/g) >= 0) result = `"${result}"`;
            return result;
        }).join(',');
    };

    const csvContent = '\uFEFF' + rows.map(processRow).join('\n'); // Add BOM for Hebrew Excel support
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// --- Components ---

const StatCard: React.FC<{ title: string; value: string; color?: string }> = ({ title, value, color = "text-slate-900" }) => (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 text-start">
        <h3 className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</h3>
        <p className={`text-2xl md:text-3xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
);

const SmartSupplierSelect: React.FC<{
    suppliers: Supplier[];
    selectedId: string;
    onChange: (id: string) => void;
    hasUnassigned?: boolean;
}> = ({ suppliers, selectedId, onChange, hasUnassigned }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Sync search term with selection
    useEffect(() => {
        if (selectedId === 'all') {
            setSearchTerm('כל הספקים');
        } else if (selectedId === 'unassigned') {
            setSearchTerm('עלויות ללא ספק');
        } else {
            const s = suppliers.find(s => s.id === selectedId);
            setSearchTerm(s ? s.name : '');
        }
    }, [selectedId, suppliers]);

    const sortedSuppliers = useMemo(() => {
        return [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'he'));
    }, [suppliers]);

    const filteredSuppliers = useMemo(() => {
        if (!searchTerm || searchTerm === 'כל הספקים') return sortedSuppliers;
        return sortedSuppliers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [sortedSuppliers, searchTerm]);

    return (
        <div className="relative w-48" ref={wrapperRef}>
            <label className="block text-xs font-bold text-slate-500 mb-1">ספק:</label>
            <div className="relative">
                <input
                    type="text"
                    className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:ring-primary focus:border-primary cursor-pointer truncate pr-8"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                        if (e.target.value === '') onChange('all');
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        if (searchTerm === 'כל הספקים') setSearchTerm('');
                    }}
                    placeholder="בחר ספק..."
                />
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {isOpen && (
                <ul className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm custom-scrollbar border border-slate-200">
                    <li
                        className="text-gray-900 cursor-pointer select-none relative py-2 pl-3 pr-4 hover:bg-indigo-50 border-b border-slate-100"
                        onClick={() => {
                            onChange('all');
                            setSearchTerm('כל הספקים');
                            setIsOpen(false);
                        }}
                    >
                        <span className="font-bold block truncate">כל הספקים</span>
                    </li>
                    {hasUnassigned && (
                        <li
                            className={`text-rose-600 cursor-pointer select-none relative py-2 pl-3 pr-4 hover:bg-rose-50 border-b border-slate-100 ${selectedId === 'unassigned' ? 'bg-rose-50 font-bold' : ''}`}
                            onClick={() => {
                                onChange('unassigned');
                                setIsOpen(false);
                            }}
                        >
                            <span className="block truncate">⚠️ עלויות ללא ספק</span>
                        </li>
                    )}
                    {filteredSuppliers.length === 0 ? (
                        <li className="text-gray-500 select-none relative py-2 pl-3 pr-9">לא נמצאו תוצאות</li>
                    ) : (
                        filteredSuppliers.map((supplier) => (
                            <li
                                key={supplier.id}
                                className={`text-gray-900 cursor-pointer select-none relative py-2 pl-3 pr-4 hover:bg-indigo-50 ${selectedId === supplier.id ? 'bg-indigo-50 text-primary' : ''}`}
                                onClick={() => {
                                    onChange(supplier.id);
                                    setSearchTerm(supplier.name);
                                    setIsOpen(false);
                                }}
                            >
                                <span className={`block truncate ${selectedId === supplier.id ? 'font-semibold' : 'font-normal'}`}>
                                    {supplier.name}
                                </span>
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
};

const PaymentManagementModal: React.FC<{
    item: PayableItem | null;
    selectedItems?: PayableItem[]; // New prop for bulk payment
    orders: Order[];
    setOrders: (orders: Order[]) => void;
    onClose: () => void;
    onPaymentUpdated?: () => void; // Callback after payment updates
}> = ({ item, selectedItems, orders, setOrders, onClose, onPaymentUpdated }) => {
    // If selectedItems is present, we are in bulk mode. Otherwise single item mode.
    const isBulk = !!selectedItems && selectedItems.length > 0;
    const itemsToPay = isBulk ? selectedItems! : (item ? [item] : []);
    
    // Default to Full Remaining (Gross)
    const totalRemaining = itemsToPay.reduce((sum, i) => sum + i.remainingAmount, 0);
    const supplierName = itemsToPay[0]?.supplierName || '';

    const [amount, setAmount] = useState<number>(totalRemaining);
    // Date Issued (Transaction Date)
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    // Repayment Date (Check Maturity)
    const [repaymentDate, setRepaymentDate] = useState<string>(''); 

    const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    
    // Only for single item:
    const [overrideDate, setOverrideDate] = useState<string>(item ? ensureDate(item.dueDate).toISOString().split('T')[0] : '');
    const [attachment, setAttachment] = useState<Attachment | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<'new' | 'history' | 'settings'>('new');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setAttachment({
                        id: `att_${Date.now()}`,
                        fileName: file.name,
                        dataUrl: event.target.result as string,
                        type: file.type,
                    });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSavePayment = () => {
        if (method === PaymentMethod.CHECK) {
            if (!reference) {
                alert("חובה להזין מספר צ'ק בשדה אסמכתא");
                return;
            }
            if (!repaymentDate) {
                alert("חובה להזין תאריך פירעון עבור צ'ק");
                return;
            }
        }

        const newOrders = [...orders];
        const paymentIdBase = `sp_${Date.now()}`;
        
        let amountToDistribute = Number(amount);

        itemsToPay.forEach((targetItem, idx) => {
            if (amountToDistribute <= 0.01) return;

            const amountForThisItem = Math.min(targetItem.remainingAmount, amountToDistribute);
            
            // Deduct from pool
            amountToDistribute -= amountForThisItem;

            const newPayment: SupplierPayment = {
                id: `${paymentIdBase}_${idx}`,
                amount: amountForThisItem,
                date: new Date(date), // Date Issued
                repaymentDate: method === PaymentMethod.CHECK ? new Date(repaymentDate) : undefined, // Check Maturity
                method,
                reference,
                notes: isBulk ? `תשלום מרוכז. ${notes}` : notes,
                attachment, // Same attachment linked to all
                status: 'PENDING' // Default status for new check
            };

            const orderIndex = newOrders.findIndex(o => o.id === targetItem.orderId);
            if (orderIndex === -1) return;

            const order = { ...newOrders[orderIndex] };
            
            if (targetItem.itemType === 'lineItem') {
                 const newItems = [...order.lineItems];
                 const tItem = { ...newItems[targetItem.itemIndex] };
                 tItem.supplierPayments = [...(tItem.supplierPayments || []), newPayment];
                 newItems[targetItem.itemIndex] = tItem;
                 order.lineItems = newItems;
            } else {
                 const newServices = [...order.additionalServices];
                 const tService = { ...newServices[targetItem.itemIndex] };
                 tService.supplierPayments = [...(tService.supplierPayments || []), newPayment];
                 newServices[targetItem.itemIndex] = tService;
                 order.additionalServices = newServices;
            }
            
            // Log to Timeline
            const timelineEvent: any = { 
                id: `tl_pay_${Date.now()}_${idx}`,
                timestamp: new Date(),
                user: 'מערכת',
                type: 'LOG',
                content: `תשלום ספק בסך ₪${newPayment.amount.toLocaleString()} נרשם עבור ${targetItem.itemDescription}.`
            };
            order.timeline = [timelineEvent, ...order.timeline];
            newOrders[orderIndex] = order;
        });

        setOrders(newOrders);
        if (onPaymentUpdated) {
            onPaymentUpdated();
        }
        onClose();
    };

    const handleUpdateDueDate = () => {
        if (isBulk || !item) return; // Only for single item

         const newOrders = [...orders];
        const orderIndex = newOrders.findIndex(o => o.id === item.orderId);
        if (orderIndex === -1) return;

        const order = { ...newOrders[orderIndex] };
         const newDateObj = new Date(overrideDate);

        if (item.itemType === 'lineItem') {
             const newItems = [...order.lineItems];
             const targetItem = { ...newItems[item.itemIndex] };
             targetItem.customDueDate = newDateObj;
             newItems[item.itemIndex] = targetItem;
             order.lineItems = newItems;
        } else {
             const newServices = [...order.additionalServices];
             const targetService = { ...newServices[item.itemIndex] };
             targetService.customDueDate = newDateObj;
             newServices[item.itemIndex] = targetService;
             order.additionalServices = newServices;
        }
        newOrders[orderIndex] = order;
        setOrders(newOrders);
        if (onPaymentUpdated) {
            onPaymentUpdated();
        }
        alert("תאריך יעד לתשלום עודכן בהצלחה");
    };

    return (
        <Modal title={isBulk ? `תשלום מרוכז - ${supplierName}` : `ניהול תשלום - ${item?.supplierName}`} onClose={onClose} size="xl">
            {!isBulk && (
                <div className="mb-4 border-b border-slate-200">
                     <nav className="-mb-px flex space-x-6 space-x-reverse">
                        <button onClick={() => setActiveTab('new')} className={`pb-2 border-b-2 font-medium text-sm ${activeTab === 'new' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>תשלום חדש</button>
                        <button onClick={() => setActiveTab('history')} className={`pb-2 border-b-2 font-medium text-sm ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>היסטוריה ({item?.payments.length})</button>
                        <button onClick={() => setActiveTab('settings')} className={`pb-2 border-b-2 font-medium text-sm ${activeTab === 'settings' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>שינוי תאריכים</button>
                    </nav>
                </div>
            )}

            {activeTab === 'new' && (
                <div className="space-y-4 text-start">
                    <div className="bg-slate-50 p-3 rounded border border-slate-200 mb-4">
                        {isBulk ? (
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-slate-800">נבחרו {itemsToPay.length} פריטים לתשלום</p>
                                    <p className="text-xs text-slate-500">ספק: {supplierName}</p>
                                </div>
                                <div className="text-left">
                                    <span className="block text-xs text-slate-500">סה"כ לתשלום</span>
                                    <span className="text-xl font-bold text-red-600">₪{totalRemaining.toLocaleString()} (ברוטו)</span>
                                    <span className="block text-sm text-slate-600">₪{itemsToPay.reduce((sum, i) => sum + (i.costGross > 0 ? i.cost * (i.remainingAmount / i.costGross) : 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} (נטו)</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-slate-600">עבור: <strong>{item?.orderNumber}</strong> - {item?.itemDescription}</p>
                                <div className="flex flex-col gap-1 mt-2 bg-white p-2 rounded border border-slate-200">
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>עלות (נטו):</span>
                                        <span>₪{item?.cost.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-bold text-slate-700">
                                        <span>עלות (כולל מע"מ):</span>
                                        <span>₪{item?.costGross.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-1 mt-1 text-sm">
                                        <span>שולם עד כה:</span>
                                        <span className="text-green-600">₪{item?.paidAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm font-bold text-red-600">
                                        <span>יתרה לתשלום:</span>
                                        <span>₪{item?.remainingAmount.toLocaleString()}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">סכום לתשלום</label>
                            <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">אמצעי תשלום</label>
                            <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">תאריך ביצוע/מסירה</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">
                                אסמכתא {method === PaymentMethod.CHECK && <span className="text-red-500">*</span>}
                            </label>
                            <input 
                                type="text" 
                                value={reference} 
                                onChange={e => setReference(e.target.value)} 
                                placeholder={method === PaymentMethod.CHECK ? "הזן מספר צ'ק (חובה)" : "מס' צ'ק / אישור העברה"} 
                                className={`mt-1 block w-full rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm ${method === PaymentMethod.CHECK && !reference ? 'border-red-300' : 'border-slate-300'}`} 
                            />
                        </div>
                    </div>
                    
                    {method === PaymentMethod.CHECK && (
                        <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                            <label className="block text-sm font-bold text-yellow-800">תאריך פירעון הצ'ק (מועד הגבייה מהבנק)</label>
                            <input type="date" value={repaymentDate} onChange={e => setRepaymentDate(e.target.value)} className="mt-1 block w-full rounded-md border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 sm:text-sm" required />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700">קובץ אסמכתא</label>
                        <input type="file" onChange={handleFileChange} className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                        {attachment && <p className="text-xs text-green-600 mt-1">קובץ נבחר: {attachment.fileName}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700">הערות</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>

                    <div className="flex justify-end pt-4">
                        <button onClick={handleSavePayment} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">
                            {isBulk ? 'בצע תשלום מרוכז' : 'שמור תשלום'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'history' && !isBulk && item && (
                <div className="space-y-3">
                    {item.payments.length === 0 ? (
                        <p className="text-slate-500 text-center py-4">אין היסטוריית תשלומים לפריט זה.</p>
                    ) : (
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">תאריך</th>
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">סכום</th>
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">שיטה</th>
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">סטטוס</th>
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">הערות</th>
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">קובץ</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {item.payments.map(p => (
                                    <tr key={p.id}>
                                        <td className="px-3 py-2 text-sm">
                                            {new Date(p.date).toLocaleDateString('he-IL')}
                                            {p.repaymentDate && <div className="text-xs text-slate-400">פירעון: {new Date(p.repaymentDate).toLocaleDateString('he-IL')}</div>}
                                        </td>
                                        <td className="px-3 py-2 text-sm font-semibold text-green-600">₪{p.amount.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-sm">{p.method}</td>
                                        <td className="px-3 py-2 text-sm">
                                            <span className={`text-xs px-2 py-0.5 rounded ${p.status === 'BOUNCED' || p.status === 'CANCELED' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                {p.status || 'שולם'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-sm max-w-xs truncate" title={p.notes}>{p.notes || '-'}</td>
                                        <td className="px-3 py-2 text-sm">
                                            {p.attachment ? (
                                                <a href={p.attachment.dataUrl} download={p.attachment.fileName} className="text-primary hover:underline text-xs">הורד</a>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {activeTab === 'settings' && !isBulk && item && (
                <div className="space-y-4 text-start">
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded text-sm text-yellow-800">
                        כאן ניתן לשנות ידנית את תאריך היעד לתשלום עבור פריט זה בלבד.<br/>
                        השינוי לא ישפיע על תאריך ההזמנה או על פריטים אחרים של אותו ספק.
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">תאריך הזמנה מקורי</label>
                        <input type="date" value={item.orderDate.toISOString().split('T')[0]} disabled className="mt-1 block w-full rounded-md border-slate-300 bg-slate-100 text-slate-500 sm:text-sm" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">תאריך יעד לתשלום (מחושב/ידני)</label>
                        <input type="date" value={overrideDate} onChange={e => setOverrideDate(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                    <div className="flex justify-end pt-4">
                         <button onClick={handleUpdateDueDate} className="px-4 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-900">עדכן תאריך יעד</button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

interface ReportsPageProps {
    orders: Order[];
    suppliers: Supplier[];
    onNavigateToOrder: (orderId: string) => void;
    setOrders?: React.Dispatch<React.SetStateAction<Order[]>>;
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number; // Added VAT rate
}

const REPORTS_VIEW_STORAGE_KEY = 'eli_reports_view';

function getReportsViewFromStorage(): Partial<{
    viewMode: 'forecast' | 'purchase_history' | 'payment_log';
    supplierFilterId: string;
    dateStart: string;
    dateEnd: string;
    showPaid: boolean;
    currentPage: number;
    pageSize: number;
}> {
    try {
        const s = sessionStorage.getItem(REPORTS_VIEW_STORAGE_KEY);
        if (s) return JSON.parse(s);
    } catch (_) {}
    return {};
}

function defaultDateStart(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
}

const ReportsPage: React.FC<ReportsPageProps> = ({ orders, suppliers, onNavigateToOrder, setOrders, statusConfigs, vatRate }) => {
    const { user } = useAuth();
    const isEmployee = user?.roleType === 'EMPLOYEE';

    const savedView = useRef(getReportsViewFromStorage()).current;

    // --- State ---
    const [viewMode, setViewMode] = useState<'forecast' | 'purchase_history' | 'payment_log'>(() => (savedView.viewMode === 'forecast' || savedView.viewMode === 'purchase_history' || savedView.viewMode === 'payment_log') ? savedView.viewMode : 'forecast');

    // Filters
    const [supplierFilterId, setSupplierFilterId] = useState<string>(() => savedView.supplierFilterId ?? 'all');
    const [dateStart, setDateStart] = useState<string>(() => savedView.dateStart ?? defaultDateStart());
    const [dateEnd, setDateEnd] = useState<string>(() => savedView.dateEnd ?? '');
    const [showPaid, setShowPaid] = useState(() => savedView.showPaid ?? false);

    // Expansion
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
    const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
    // For Payment Log
    const [expandedPaymentIds, setExpandedPaymentIds] = useState<Set<string>>(new Set());
    
    // Quick Edit State
    const [editingPaymentGroupId, setEditingPaymentGroupId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ reference: '', notes: '' });

    // Selection for Bulk Payment
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [selectedItemForPayment, setSelectedItemForPayment] = useState<PayableItem | null>(null); // Single payment
    const [isBulkPaymentModalOpen, setIsBulkPaymentModalOpen] = useState(false); // Bulk payment

    const canManagePayments = !!setOrders;

    // --- Data Processing ---
    // Load payable items from server-side API with filtering
    const [rawPayables, setRawPayables] = useState<PayableItem[]>([]);
    const [loadingPayables, setLoadingPayables] = useState(true);
    const [summaryStats, setSummaryStats] = useState({
        totalDebt: 0,
        overdueDebt: 0,
        thisMonthDue: 0,
        unassignedCount: 0
    });
    const [currentPage, setCurrentPage] = useState(() => typeof savedView.currentPage === 'number' && savedView.currentPage >= 1 ? savedView.currentPage : 1);
    const [pageSize, setPageSize] = useState(() => typeof savedView.pageSize === 'number' && savedView.pageSize >= 1 ? savedView.pageSize : 50);
    const [totalCount, setTotalCount] = useState(0);

    // Persist filters/view to sessionStorage so they survive navigation between pages
    useEffect(() => {
        try {
            sessionStorage.setItem(REPORTS_VIEW_STORAGE_KEY, JSON.stringify({
                viewMode,
                supplierFilterId,
                dateStart,
                dateEnd,
                showPaid,
                currentPage,
                pageSize,
            }));
        } catch (_) {}
    }, [viewMode, supplierFilterId, dateStart, dateEnd, showPaid, currentPage, pageSize]);
    
    // Refetch function to reload payable items after payment updates or filter changes
    const refetchPayables = async () => {
        try {
            setLoadingPayables(true);
            const filters = {
                supplierFilterId: supplierFilterId !== 'all' ? supplierFilterId : undefined,
                dateStart: dateStart || undefined,
                dateEnd: dateEnd || undefined,
                showPaid: showPaid || undefined,
                viewMode
            };
            
            const result = await getPayableItems(filters, currentPage, pageSize);
            
            // Convert date strings to Date objects
            const convertedPayables = result.items.map(item => ({
                ...item,
                orderDate: ensureDate(item.orderDate),
                dueDate: ensureDate(item.dueDate),
                payments: item.payments.map(p => ({
                    ...p,
                    date: ensureDate(p.date)
                }))
            }));
            
            setRawPayables(convertedPayables);
            setSummaryStats(result.summaryStats);
            setTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading payable items:', error);
        } finally {
            setLoadingPayables(false);
        }
    };
    
    // Load payable items when filters change
    useEffect(() => {
        refetchPayables();
    }, [supplierFilterId, dateStart, dateEnd, showPaid, viewMode, currentPage, pageSize]); // Refetch when filters or pagination change

    // --- Payment Log Grouping ---
    const groupedPayments = useMemo(() => {
        const groups = new Map<string, GroupedPaymentTransaction>();
        
        rawPayables.forEach(item => {
            if (item.payments && item.payments.length > 0) {
                item.payments.forEach(p => {
                    const paymentDate = ensureDate(p.date);
                    const dateStr = paymentDate.toISOString().split('T')[0];
                    const safeRef = p.reference || 'NO_REF';
                    // Group Key: Date + Supplier + Reference + Method
                    const key = `${dateStr}_${item.supplierId}_${safeRef}_${p.method}`;
                    
                    if (!groups.has(key)) {
                        groups.set(key, {
                            id: key,
                            supplierId: item.supplierId,
                            supplierName: item.supplierName,
                            date: paymentDate,
                            method: p.method,
                            reference: p.reference || '',
                            totalAmount: 0,
                            notes: p.notes, // Take first note
                            attachment: p.attachment, // Take first attachment
                            sourceLinks: [],
                            itemsCovered: []
                        });
                    }
                    
                    const group = groups.get(key)!;
                    
                    // Logic update: Ensure note is captured if present in any of the items in the group
                    if (!group.notes && p.notes) {
                        group.notes = p.notes;
                    }

                    group.totalAmount += p.amount;
                    
                    // Add source link for edit/update logic
                    group.sourceLinks.push({
                        orderId: item.orderId,
                        itemType: item.itemType,
                        itemIndex: item.itemIndex,
                        paymentId: p.id
                    });

                    group.itemsCovered.push({
                        uniqueId: item.uniqueId,
                        orderId: item.orderId,
                        orderNumber: item.orderNumber,
                        orderDescription: item.orderDescription, // Project/Context
                        itemDescription: item.itemDescription,
                        amountPaid: p.amount,
                        itemRemaining: item.remainingAmount,
                        isItemPaidOff: item.remainingAmount <= 0.1
                    });
                });
            }
        });

        // Convert map to array and sort by date descending
        let result = Array.from(groups.values());
        
        // Apply Filters to Payment Log as well
        if (supplierFilterId !== 'all') {
            result = result.filter(g => g.supplierId === supplierFilterId);
        }
        
        // Date filters for Log (based on payment date)
        const start = dateStart ? new Date(dateStart) : null;
        const end = dateEnd ? new Date(dateEnd) : null;
        if (start) start.setHours(0,0,0,0);
        if (end) end.setHours(23,59,59,999);

        result = result.filter(g => {
            if (start && g.date < start) return false;
            if (end && g.date > end) return false;
            return true;
        });

        return result.sort((a,b) => b.date.getTime() - a.date.getTime());
    }, [rawPayables, supplierFilterId, dateStart, dateEnd]);


    // --- Filtering Logic ---
    // Filtering is now done on the server, so filteredItems is just rawPayables
    // (which are already filtered by the server)
    const filteredItems = rawPayables;

    // --- Grouping Logic ---
    const groupedData = useMemo(() => {
        const groups: Record<string, MonthlyGroup> = {};
        const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const getMonthLabel = (date: Date) => date.toLocaleString('he-IL', { month: 'long', year: 'numeric' });

        filteredItems.forEach(item => {
            const keyDate = viewMode === 'forecast' ? item.dueDate : item.orderDate;
            const key = getMonthKey(keyDate);

            if (!groups[key]) {
                groups[key] = {
                    monthYearKey: key,
                    label: getMonthLabel(keyDate),
                    totalDue: 0,
                    totalDueNet: 0,
                    totalPaid: 0,
                    items: [],
                    suppliers: {}
                };
            }

            groups[key].totalDue += item.costGross; // Use Gross for totals
            groups[key].totalDueNet += item.cost;
            groups[key].totalPaid += item.paidAmount;
            groups[key].items.push(item);

            if (!groups[key].suppliers[item.supplierId]) {
                groups[key].suppliers[item.supplierId] = {
                    supplierName: item.supplierName,
                    totalDue: 0,
                    totalDueNet: 0,
                    totalPaid: 0,
                    items: [],
                    isUnassigned: item.supplierId === 'unassigned'
                };
            }
            
            groups[key].suppliers[item.supplierId].totalDue += item.costGross; // Use Gross for totals
            groups[key].suppliers[item.supplierId].totalDueNet += item.cost;
            groups[key].suppliers[item.supplierId].totalPaid += item.paidAmount;
            groups[key].suppliers[item.supplierId].items.push(item);
        });

        // Sort months: For forecast, we want overdue/current first (ascending).
        return Object.values(groups).sort((a, b) => a.monthYearKey.localeCompare(b.monthYearKey));
    }, [filteredItems, viewMode, supplierFilterId]);

    // --- Handlers ---

    const toggleMonth = (key: string) => {
        const newSet = new Set(expandedMonths);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setExpandedMonths(newSet);
    };

    const toggleSupplier = (key: string) => {
        const newSet = new Set(expandedSuppliers);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setExpandedSuppliers(newSet);
    };

    const togglePaymentGroup = (key: string) => {
        const newSet = new Set(expandedPaymentIds);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setExpandedPaymentIds(newSet);
    }

    // --- Selection Handlers ---
    const handleCheckboxChange = (itemId: string, supplierId: string) => {
        setSelectedItemIds(prev => {
            const newSet = new Set(prev);
            // Check if adding: allow only if same supplier as currently selected items (if any)
            if (!newSet.has(itemId)) {
                if (newSet.size > 0) {
                    // Check if current selection has mixed suppliers (shouldn't happen with UI logic, but safe guard)
                    const firstId = Array.from(newSet)[0];
                    const firstItem = rawPayables.find(i => i.uniqueId === firstId);
                    if (firstItem && firstItem.supplierId !== supplierId) {
                        alert("לא ניתן לבחור פריטים מספקים שונים לתשלום מרוכז.");
                        return prev;
                    }
                }
                newSet.add(itemId);
            } else {
                newSet.delete(itemId);
            }
            return newSet;
        });
    };

    const getSelectedItems = () => {
        return rawPayables.filter(i => selectedItemIds.has(i.uniqueId));
    };

    const openBulkPayment = () => {
        const selected = getSelectedItems();
        if (selected.length === 0) return;
        setIsBulkPaymentModalOpen(true);
    };

    // --- Payment Edit Handlers ---
    const startEditingGroup = (group: GroupedPaymentTransaction) => {
        setEditForm({ reference: group.reference, notes: group.notes || '' });
        setEditingPaymentGroupId(group.id);
    };

    const cancelEditingGroup = () => {
        setEditingPaymentGroupId(null);
    };

    const saveGroupEdit = (group: GroupedPaymentTransaction) => {
        if (!setOrders) return;
        
        // Clone orders to mutate
        const newOrders = [...orders];
        let hasChanges = false;

        // Iterate through all source links in the group and update them
        group.sourceLinks.forEach(link => {
            const orderIndex = newOrders.findIndex(o => o.id === link.orderId);
            if (orderIndex === -1) return;

            const order = { ...newOrders[orderIndex] };
            let updated = false;

            if (link.itemType === 'lineItem') {
                const newItems = [...order.lineItems];
                const item = { ...newItems[link.itemIndex] };
                if (item.supplierPayments) {
                    item.supplierPayments = item.supplierPayments.map(p => {
                        if (p.id === link.paymentId) {
                            updated = true;
                            return { ...p, reference: editForm.reference, notes: editForm.notes };
                        }
                        return p;
                    });
                    newItems[link.itemIndex] = item;
                    order.lineItems = newItems;
                }
            } else {
                const newServices = [...order.additionalServices];
                const service = { ...newServices[link.itemIndex] };
                if (service.supplierPayments) {
                    service.supplierPayments = service.supplierPayments.map(p => {
                        if (p.id === link.paymentId) {
                            updated = true;
                            return { ...p, reference: editForm.reference, notes: editForm.notes };
                        }
                        return p;
                    });
                    newServices[link.itemIndex] = service;
                    order.additionalServices = newServices;
                }
            }

            if (updated) {
                newOrders[orderIndex] = order;
                hasChanges = true;
            }
        });

        if (hasChanges) {
            setOrders(newOrders);
        }
        setEditingPaymentGroupId(null);
    };

    // --- Rollback Logic: Cancel Entire Transaction ---
    const handleCancelPaymentGroup = (group: GroupedPaymentTransaction) => {
        if (!setOrders) return;
        if (!window.confirm(`האם לבטל את העסקה על סך ₪${group.totalAmount.toLocaleString()}? פעולה זו תסיר את התשלום מכל הפריטים ותחזיר את החוב לספק.`)) {
            return;
        }

        // Use functional update to ensure we're working with latest state
        setOrders(prevOrders => {
            const newOrders = [...prevOrders];
            let ordersEffected = new Set<string>();

            group.sourceLinks.forEach(link => {
                const orderIndex = newOrders.findIndex(o => o.id === link.orderId);
                if (orderIndex === -1) return;

                const order = { ...newOrders[orderIndex] };
                ordersEffected.add(order.orderNumber);

                if (link.itemType === 'lineItem') {
                    const newItems = [...order.lineItems];
                    const item = { ...newItems[link.itemIndex] };
                    if (item.supplierPayments) {
                        item.supplierPayments = item.supplierPayments.filter(p => p.id !== link.paymentId);
                        newItems[link.itemIndex] = item;
                        order.lineItems = newItems;
                    }
                } else {
                    const newServices = [...order.additionalServices];
                    const service = { ...newServices[link.itemIndex] };
                    if (service.supplierPayments) {
                        service.supplierPayments = service.supplierPayments.filter(p => p.id !== link.paymentId);
                        newServices[link.itemIndex] = service;
                        order.additionalServices = newServices;
                    }
                }
                
                // Add cancellation event to timeline
                const cancelEvent: TimelineEvent = {
                    id: `tl_cancel_${Date.now()}_${link.paymentId}`,
                    timestamp: new Date(),
                    user: 'מערכת',
                    type: 'LOG',
                    content: `בוטל רישום תשלום ספק עקב ביטול עסקה ביומן תשלומים (אסמכתא: ${group.reference})`
                };
                order.timeline = [cancelEvent, ...order.timeline];
                
                newOrders[orderIndex] = order;
            });

            if (ordersEffected.size > 0) {
                // Show alert after state update completes
                setTimeout(() => {
                    alert(`העסקה בוטלה בהצלחה. הוסרו תשלומים מ-${ordersEffected.size} הזמנות.`);
                }, 0);
            }

            return newOrders;
        });
    };

    // Auto-expand current month + overdue
    useEffect(() => {
        const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        setExpandedMonths(prev => {
            const next = new Set(prev);
            groupedData.forEach(g => {
                if (g.monthYearKey <= nowKey) next.add(g.monthYearKey);
            });
            return next;
        });
    }, [groupedData.length]);

    // --- Summary Stats ---
    // Summary stats are now calculated on the server and returned with the API response
    const { totalDebt, overdueDebt, thisMonthDue, unassignedCount } = summaryStats;

    const selectedItems = getSelectedItems();
    const selectedItemsTotal = selectedItems.reduce((sum, i) => sum + i.remainingAmount, 0);
    const selectedItemsTotalNet = selectedItems.reduce((sum, i) => sum + (i.costGross > 0 ? i.cost * (i.remainingAmount / i.costGross) : 0), 0);

    const handleExport = () => {
        let filename = `report_${viewMode}_${new Date().toISOString().split('T')[0]}.csv`;
        let header: string[] = [];
        let rows: any[][] = [];

        if (viewMode === 'payment_log') {
            header = ["תאריך", "ספק", "שיטה", "אסמכתא", 'סה"כ שולם', "הערות"];
            rows = groupedPayments.map(g => [
                g.date.toLocaleDateString('he-IL'),
                g.supplierName,
                g.method,
                g.reference,
                g.totalAmount,
                g.notes || ''
            ]);
        } else {
            header = ["ספק", "הזמנה", "פריט", "תאריך הזמנה", "תאריך יעד", "עלות נטו", "עלות ברוטו", "שולם", "יתרה", "סטטוס"];
            rows = filteredItems.map(item => [
                item.supplierName,
                item.orderNumber,
                item.itemDescription,
                item.orderDate.toLocaleDateString('he-IL'),
                item.dueDate.toLocaleDateString('he-IL'),
                item.cost,
                item.costGross,
                item.paidAmount,
                item.remainingAmount,
                item.status
            ]);
        }

        exportToCSV(filename, [header, ...rows]);
    };

    return (
        <div className="space-y-6 pb-24 relative">
            {/* Stats Row - with and without VAT */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title='סה"כ חוב פתוח' value={`₪${totalDebt.toLocaleString()} (ברוטו) / ₪${(totalDebt / (1 + vatRate / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })} (נטו)`} />
                <StatCard title="תשלומים בפיגור" value={`₪${overdueDebt.toLocaleString()} (ברוטו) / ₪${(overdueDebt / (1 + vatRate / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })} (נטו)`} color="text-red-600" />
                <StatCard title="לתשלום החודש" value={`₪${thisMonthDue.toLocaleString()} (ברוטו) / ₪${(thisMonthDue / (1 + vatRate / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })} (נטו)`} color="text-orange-600" />
            </div>

            {unassignedCount > 0 && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-3">
                        <div className="bg-rose-100 p-2 rounded-full text-rose-600">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <div>
                            <h4 className="font-black text-rose-800">שים לב: נמצאו עלויות ללא ספק משויך</h4>
                            <p className="text-xs text-rose-600 font-bold">ישנם {unassignedCount} פריטים בהזמנות פעילות שלא הוגדר עבורם ספק לתשלום.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setSupplierFilterId('unassigned')}
                        className="bg-rose-600 text-white px-4 py-1.5 rounded-lg text-sm font-black hover:bg-rose-700 transition-all shadow-sm"
                    >
                        הצג עלויות
                    </button>
                </div>
            )}

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                <div className="flex flex-wrap gap-4 w-full md:w-auto">
                    {/* View Mode */}
                    <div className="flex bg-slate-100 rounded p-1">
                        <button onClick={() => setViewMode('forecast')} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${viewMode === 'forecast' ? 'bg-white shadow text-primary' : 'text-slate-600'}`}>תחזית תזרים</button>
                        <button onClick={() => setViewMode('purchase_history')} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${viewMode === 'purchase_history' ? 'bg-white shadow text-primary' : 'text-slate-600'}`}>היסטוריית רכש</button>
                        <button onClick={() => setViewMode('payment_log')} className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${viewMode === 'payment_log' ? 'bg-white shadow text-primary' : 'text-slate-600'}`}>יומן תשלומים</button>
                    </div>

                    {/* Supplier Select with Smart Search */}
                    <SmartSupplierSelect 
                        suppliers={suppliers} 
                        selectedId={supplierFilterId} 
                        onChange={(id) => setSupplierFilterId(id)}
                        hasUnassigned={unassignedCount > 0}
                    />

                    {/* Date Range */}
                    <div className="flex items-center gap-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">מ-:</label>
                            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="text-sm border border-slate-300 rounded px-2 py-1.5 w-32" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">עד:</label>
                            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="text-sm border border-slate-300 rounded px-2 py-1.5 w-32" />
                        </div>
                    </div>

                    {/* Show Paid Toggle (Only relevant for item views) */}
                    {viewMode !== 'payment_log' && (
                        <div className="flex items-center mt-4">
                            <input type="checkbox" id="showPaid" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary me-2" />
                            <label htmlFor="showPaid" className="text-sm text-slate-600 select-none">הצג שולמו</label>
                        </div>
                    )}
                </div>

                {/* Export Button */}
                <button onClick={handleExport} className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-md hover:bg-green-100 transition-colors border border-green-200 text-sm font-bold">
                    <DownloadIcon className="w-4 h-4" />
                    ייצוא נתונים
                </button>
            </div>

            {/* Content Area */}
            <div className="space-y-4">
                
                {/* PAYMENT LOG VIEW */}
                {viewMode === 'payment_log' ? (
                    groupedPayments.length === 0 ? (
                        <div className="text-center text-slate-500 py-10">לא נמצאו תשלומים בטווח התאריכים הנבחר.</div>
                    ) : (
                        <div className="space-y-3">
                            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-t-lg border-b border-slate-200 text-center">
                                <div className="col-span-2">תאריך</div>
                                <div className="col-span-2">ספק</div>
                                <div className="col-span-2">שיטה / אסמכתא</div>
                                <div className="col-span-2">סה"כ שולם</div>
                                <div className="col-span-3">הערות</div>
                                <div className="col-span-1">פרטים</div>
                            </div>
                            {groupedPayments.map(group => {
                                const isExpanded = expandedPaymentIds.has(group.id);
                                const isEditing = editingPaymentGroupId === group.id;
                                
                                // Financials Breakdown - use system VAT as fallback for log view baseline if needed, but really it's based on group total
                                const total = group.totalAmount;
                                const base = total / (1 + vatRate / 100);
                                const vat = total - base;

                                return (
                                    <div key={group.id} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden text-center">
                                        <div 
                                            className={`grid grid-cols-2 md:grid-cols-12 gap-4 px-4 py-3 items-center cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                            onClick={() => togglePaymentGroup(group.id)}
                                        >
                                            <div className="col-span-1 md:col-span-2 font-medium">{group.date.toLocaleDateString('he-IL')}</div>
                                            <div className="col-span-1 md:col-span-2 font-medium text-slate-800">{group.supplierName}</div>
                                            
                                            <div className="col-span-1 md:col-span-2 text-sm text-slate-600 flex flex-col justify-center">
                                                <span>{group.method}</span>
                                                {group.reference && <span className="font-mono text-xs text-slate-400">{group.reference}</span>}
                                            </div>
                                            
                                            <div className="col-span-1 md:col-span-2 font-bold text-green-700 text-lg">
                                                ₪{group.totalAmount.toLocaleString()} (ברוטו) / ₪{(group.totalAmount / (1 + vatRate / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })} (נטו)
                                            </div>
                                            
                                            <div className="hidden md:block md:col-span-3 text-xs text-slate-500 text-start truncate px-2" title={group.notes}>
                                                {group.notes || '-'}
                                            </div>
                                            
                                            <div className="col-span-2 md:col-span-1 flex justify-center text-xs text-slate-400">
                                                {isExpanded ? 'סגור' : 'פרטים'}
                                                <svg className={`w-4 h-4 ms-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                            </div>
                                        </div>
                                        
                                        {isExpanded && (
                                            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 text-start">
                                                
                                                {/* Header & Stats */}
                                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 pb-4 border-b border-slate-200">
                                                    <div className="flex gap-4 text-xs">
                                                        <div className="bg-white px-2 py-1 rounded border border-slate-200">
                                                            <span className="text-slate-500 block">בסיס (משוער)</span>
                                                            <span className="font-bold">₪{base.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                        </div>
                                                        <div className="bg-white px-2 py-1 rounded border border-slate-200">
                                                            <span className="text-slate-500 block">מע"מ (משוער)</span>
                                                            <span className="font-bold">₪{vat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                        </div>
                                                        <div className="bg-green-50 px-2 py-1 rounded border border-green-200 text-green-800">
                                                            <span className="block text-green-600">סה"כ שולם</span>
                                                            <span className="font-bold">₪{total.toLocaleString()}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        {group.attachment && (
                                                            <a 
                                                                href={group.attachment.dataUrl} 
                                                                download={group.attachment.fileName} 
                                                                className="flex items-center gap-1 text-xs bg-white border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 text-slate-700 font-medium"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414 5.656a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                                                צפה באסמכתא
                                                            </a>
                                                        )}
                                                        {canManagePayments && !isEditing && (
                                                            <>
                                                                <button 
                                                                    onClick={() => startEditingGroup(group)}
                                                                    className="flex items-center gap-1 text-xs bg-white border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 text-slate-700 font-medium"
                                                                >
                                                                    <EditIcon className="w-3 h-3"/>
                                                                    ערוך פרטים
                                                                </button>
                                                                {!isEmployee && (
                                                                    <button 
                                                                        onClick={() => handleCancelPaymentGroup(group)}
                                                                        className="flex items-center gap-1 text-xs bg-red-50 border border-red-200 px-3 py-1.5 rounded hover:bg-red-100 text-red-700 font-bold transition-all shadow-sm"
                                                                    >
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                                                        ביטול עסקה (Rollback)
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Edit Form */}
                                                {isEditing && (
                                                    <div className="bg-yellow-50 p-3 rounded border border-yellow-200 mb-4 flex flex-col md:flex-row gap-3 items-end">
                                                        <div className="flex-grow">
                                                            <label className="block text-xs font-bold text-slate-600 mb-1">אסמכתא</label>
                                                            <input 
                                                                type="text" 
                                                                value={editForm.reference} 
                                                                onChange={e => setEditForm({...editForm, reference: e.target.value})} 
                                                                className="w-full text-sm p-1.5 rounded border border-yellow-300"
                                                            />
                                                        </div>
                                                        <div className="flex-grow-[2]">
                                                            <label className="block text-xs font-bold text-slate-600 mb-1">הערות</label>
                                                            <input 
                                                                type="text" 
                                                                value={editForm.notes} 
                                                                onChange={e => setEditForm({...editForm, notes: e.target.value})} 
                                                                className="w-full text-sm p-1.5 rounded border border-yellow-300"
                                                            />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={cancelEditingGroup} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded text-xs hover:bg-slate-50">ביטול</button>
                                                            <button onClick={() => saveGroupEdit(group)} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 shadow-sm font-bold">שמור שינויים</button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Items Table */}
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full text-sm text-right">
                                                        <thead className="bg-slate-100 text-slate-500 font-medium text-xs">
                                                            <tr>
                                                                <th className="px-3 py-2">הזמנה</th>
                                                                <th className="px-3 py-2">פרויקט / לקוח</th>
                                                                <th className="px-3 py-2">פריט</th>
                                                                <th className="px-3 py-2">סכום שולם</th>
                                                                <th className="px-3 py-2">סטטוס יתרה</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200 bg-white">
                                                            {group.itemsCovered.map((item, i) => (
                                                                <tr key={i} className="hover:bg-slate-50">
                                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                                        <button onClick={() => onNavigateToOrder(item.orderId)} className="text-primary hover:underline font-bold font-mono">
                                                                            {item.orderNumber}
                                                                        </button>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-600 font-medium max-w-[150px] truncate" title={item.orderDescription}>
                                                                        {item.orderDescription}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">
                                                                        {item.itemDescription}
                                                                    </td>
                                                                    <td className="px-3 py-2 font-bold text-slate-800">
                                                                        ₪{item.amountPaid.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-xs">
                                                                        {item.isItemPaidOff ? (
                                                                            <span className="text-green-600 flex items-center gap-1 font-medium bg-green-50 px-2 py-0.5 rounded w-fit">
                                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                                סגור
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded border border-red-100 w-fit block">
                                                                                יתרה: ₪{item.itemRemaining.toLocaleString()}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {group.notes && !isEditing && (
                                                    <div className="mt-3 text-xs text-slate-500 bg-white p-2 rounded border border-slate-100">
                                                        <strong>הערות לתשלום:</strong> {group.notes}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    /* ITEM FORECAST / HISTORY VIEW (Existing Logic) */
                    <>
                        {groupedData.length === 0 && <div className="text-center text-slate-500 py-10">לא נמצאו נתונים להצגה.</div>}
                        
                        {groupedData.map(group => (
                            <div key={group.monthYearKey} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                                {/* Month Header */}
                                <div 
                                    onClick={() => toggleMonth(group.monthYearKey)}
                                    className="flex items-center justify-between p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`transform transition-transform ${expandedMonths.has(group.monthYearKey) ? 'rotate-180' : ''}`}>
                                            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </div>
                                        <h3 className="text-lg font-semibold text-slate-800">{group.label}</h3>
                                        <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{group.items.length} פריטים</span>
                                    </div>
                                    <div className="flex flex-wrap gap-4 md:gap-6 text-sm">
                                        <div className="hidden md:block">
                                            <span className="text-slate-500">סה"כ:</span>{' '}
                                            <span className="font-semibold">₪{group.totalDueNet.toLocaleString(undefined, { maximumFractionDigits: 0 })} (נטו) / ₪{group.totalDue.toLocaleString()} (ברוטו)</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">לתשלום:</span>{' '}
                                            <span className="font-bold text-red-600">
                                                ₪{(group.totalDue > 0 ? (group.totalDueNet * (group.totalDue - group.totalPaid) / group.totalDue).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0')} (נטו) / ₪{(group.totalDue - group.totalPaid).toLocaleString()} (ברוטו)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {expandedMonths.has(group.monthYearKey) && (
                                    <div className="p-4 pt-0">
                                        {/* Nested Supplier Groups */}
                                        {(Object.entries(group.suppliers) as [string, SupplierGroup][]).map(([sId, sGroup]) => {
                                            const sKey = `${group.monthYearKey}_${sId}`;
                                            const isSExpanded = expandedSuppliers.has(sKey);
                                            const isUnassigned = sId === 'unassigned';
                                            return (
                                                <div key={sId} className={`mt-2 border rounded border-slate-100 overflow-hidden ${isUnassigned ? 'border-rose-200 ring-1 ring-rose-50' : ''}`}>
                                                    <div 
                                                        onClick={() => toggleSupplier(sKey)}
                                                        className={`flex items-center justify-between p-3 bg-white hover:bg-slate-50 cursor-pointer ${isUnassigned ? 'bg-rose-50/30' : ''}`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`transform transition-transform ${isSExpanded ? 'rotate-180' : ''}`}>
                                                                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                            </div>
                                                            <span className={`font-bold ${isUnassigned ? 'text-rose-700 flex items-center gap-1' : 'text-slate-700'}`}>
                                                                {isUnassigned && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                                                                {sGroup.supplierName}
                                                            </span>
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${isUnassigned ? 'bg-rose-200 text-rose-800' : 'bg-slate-100'}`}>{sGroup.items.length}</span>
                                                        </div>
                                                        <div className={`text-sm font-bold ${isUnassigned ? 'text-rose-800' : 'text-red-600'}`}>
                                                            ₪{(sGroup.totalDue > 0 ? (sGroup.totalDueNet * (sGroup.totalDue - sGroup.totalPaid) / sGroup.totalDue).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0')} (נטו) / ₪{(sGroup.totalDue - sGroup.totalPaid).toLocaleString()} (ברוטו)
                                                        </div>
                                                    </div>
                                                    {isSExpanded && (
                                                        <div className={`overflow-x-auto ${isUnassigned ? 'bg-rose-50/20' : 'bg-slate-50/50'}`}>
                                                            <table className="min-w-full text-xs text-right">
                                                                <thead className={`${isUnassigned ? 'bg-rose-100/50 text-rose-600' : 'bg-slate-100 text-slate-500'} font-bold uppercase`}>
                                                                    <tr>
                                                                        {canManagePayments && <th className="px-4 py-2 w-8"></th>}
                                                                        <th className="px-4 py-2">הזמנה</th>
                                                                        <th className="px-4 py-2">פריט</th>
                                                                        <th className="px-4 py-2">{viewMode === 'forecast' ? 'תאריך יעד' : 'תאריך הזמנה'}</th>
                                                                        <th className="px-4 py-2">סה"כ (נטו)</th>
                                                                        <th className="px-4 py-2">סה"כ (ברוטו)</th>
                                                                        <th className="px-4 py-2">שולם</th>
                                                                        <th className="px-4 py-2">יתרה</th>
                                                                        <th className="px-4 py-2">סטטוס</th>
                                                                        {canManagePayments && <th className="px-4 py-2"></th>}
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {sGroup.items.map(item => (
                                                                        <tr key={item.uniqueId} className="hover:bg-white transition-colors">
                                                                            {canManagePayments && (
                                                                                <td className="px-4 py-2">
                                                                                    <input 
                                                                                        type="checkbox" 
                                                                                        checked={selectedItemIds.has(item.uniqueId)}
                                                                                        onChange={() => handleCheckboxChange(item.uniqueId, item.supplierId)}
                                                                                        className="h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary"
                                                                                    />
                                                                                </td>
                                                                            )}
                                                                            <td className="px-4 py-2">
                                                                                <button onClick={() => onNavigateToOrder(item.orderId)} className="text-primary hover:underline font-mono font-bold">
                                                                                    {item.orderNumber}
                                                                                </button>
                                                                            </td>
                                                                            <td className="px-4 py-2 text-slate-700 font-medium">{item.itemDescription}</td>
                                                                            <td className="px-4 py-2 text-slate-500">
                                                                                {(viewMode === 'forecast' ? item.dueDate : item.orderDate).toLocaleDateString('he-IL')}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-slate-600">₪{item.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                                            <td className="px-4 py-2 text-slate-700 font-medium">₪{item.costGross.toLocaleString()}</td>
                                                                            <td className="px-4 py-2 text-green-600 font-medium">₪{item.paidAmount.toLocaleString()}</td>
                                                                            <td className="px-4 py-2 font-bold text-red-600">₪{item.remainingAmount.toLocaleString()}</td>
                                                                            <td className="px-4 py-2">
                                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                                    item.status === 'שולם' ? 'bg-green-100 text-green-700' :
                                                                                    item.status === 'איחור' ? 'bg-red-100 text-red-700' :
                                                                                    'bg-slate-100 text-slate-700'
                                                                                }`}>
                                                                                    {item.status}
                                                                                </span>
                                                                            </td>
                                                                            {canManagePayments && (
                                                                                <td className="px-4 py-2 text-left">
                                                                                    <button 
                                                                                        onClick={() => setSelectedItemForPayment(item)}
                                                                                        className="text-[10px] font-bold text-primary hover:underline"
                                                                                    >
                                                                                        נהל תשלום
                                                                                    </button>
                                                                                </td>
                                                                            )}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </>
                )}
                
                {/* Pagination Controls */}
                {totalCount > 0 && (
                    <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200 rounded-b-lg">
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-slate-600">
                                מציג {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} מתוך {totalCount} פריטים
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-slate-600">שורות לעמוד:</label>
                                <select 
                                    value={pageSize} 
                                    onChange={(e) => {
                                        setPageSize(parseInt(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="text-sm border border-slate-300 rounded px-2 py-1 focus:ring-primary focus:border-primary"
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={200}>200</option>
                                    <option value={500}>500</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1 || loadingPayables}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ראשון
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1 || loadingPayables}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                קודם
                            </button>
                            <span className="px-3 py-1 text-sm text-slate-600">
                                עמוד {currentPage} מתוך {Math.ceil(totalCount / pageSize) || 1}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / pageSize) || 1, prev + 1))}
                                disabled={currentPage >= Math.ceil(totalCount / pageSize) || loadingPayables}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                הבא
                            </button>
                            <button
                                onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize) || 1)}
                                disabled={currentPage >= Math.ceil(totalCount / pageSize) || loadingPayables}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                אחרון
                            </button>
                        </div>
                    </div>
                )}
                
                {loadingPayables && (
                    <div className="mt-4 text-center text-slate-500 text-sm">טוען...</div>
                )}
            </div>

            {/* Sticky Bulk Action Bar */}
            {canManagePayments && selectedItemIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-8 border border-slate-700 animate-slideUp">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">פריטים שנבחרו ({selectedItemIds.size})</span>
                        <span className="text-xl font-black text-white">₪{selectedItemsTotal.toLocaleString()} (ברוטו)</span>
                        <span className="text-xs text-slate-400">₪{selectedItemsTotalNet.toLocaleString(undefined, { maximumFractionDigits: 0 })} (נטו)</span>
                    </div>
                    <div className="h-8 w-px bg-slate-700"></div>
                    <div className="flex gap-3">
                        <button onClick={() => setSelectedItemIds(new Set())} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">בטל בחירה</button>
                        <button onClick={openBulkPayment} className="px-6 py-2 bg-primary hover:bg-indigo-600 text-white rounded-lg font-black shadow-lg transition-all flex items-center gap-2">
                            <PlusIcon className="w-5 h-5"/>
                            בצע תשלום מרוכז
                        </button>
                    </div>
                </div>
            )}

            {/* Modals */}
            {selectedItemForPayment && (
                <PaymentManagementModal 
                    item={selectedItemForPayment} 
                    orders={orders} 
                    setOrders={setOrders!} 
                    onClose={() => setSelectedItemForPayment(null)}
                    onPaymentUpdated={refetchPayables}
                />
            )}

            {isBulkPaymentModalOpen && (
                <PaymentManagementModal 
                    item={null}
                    selectedItems={getSelectedItems()}
                    orders={orders}
                    setOrders={setOrders!}
                    onClose={() => setIsBulkPaymentModalOpen(false)}
                    onPaymentUpdated={refetchPayables}
                />
            )}
        </div>
    );
};

export default ReportsPage;
