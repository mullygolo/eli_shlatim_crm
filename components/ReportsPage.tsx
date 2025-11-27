
import React, { useState, useMemo, useEffect } from 'react';
import { Order, Supplier, SupplierPayment, PaymentMethod, Attachment, LineItem, AdditionalService, OrderStatusConfiguration } from '../types';
import { PlusIcon, EditIcon, DeleteIcon } from './icons';
import Modal from './Modal';

// --- Helpers & Logic ---

interface PayableItem {
    uniqueId: string; // orderId + itemIndex + type
    supplierId: string;
    supplierName: string;
    orderId: string;
    orderNumber: string;
    orderDescription: string;
    itemDescription: string;
    cost: number;
    paidAmount: number;
    remainingAmount: number;
    orderDate: Date;
    dueDate: Date; // Calculated or Custom
    isCustomDueDate: boolean;
    status: 'שולם' | 'שולם חלקית' | 'איחור' | 'לתשלום החודש' | 'צפוי';
    payments: SupplierPayment[];
    
    // Helper to locate the item in the original structure
    itemType: 'lineItem' | 'additionalService';
    itemIndex: number;
}

interface SupplierGroup {
    supplierName: string;
    totalDue: number;
    totalPaid: number;
    items: PayableItem[];
}

interface MonthlyGroup {
    monthYearKey: string; // "YYYY-MM"
    label: string; // "ינואר 2024"
    totalDue: number;
    totalPaid: number;
    items: PayableItem[];
    suppliers: {
        [supplierId: string]: SupplierGroup;
    };
}

const calculateDueDate = (orderDate: Date, paymentTerms: string, customDueDate?: Date): Date => {
    if (customDueDate) return new Date(customDueDate);

    const orderDateObj = new Date(orderDate);
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

// --- Components ---

const StatCard: React.FC<{ title: string; value: string; color?: string }> = ({ title, value, color = "text-slate-900" }) => (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 text-start">
        <h3 className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</h3>
        <p className={`text-2xl md:text-3xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
);

const PaymentManagementModal: React.FC<{
    item: PayableItem;
    orders: Order[];
    setOrders: (orders: Order[]) => void;
    onClose: () => void;
}> = ({ item, orders, setOrders, onClose }) => {
    const [amount, setAmount] = useState<number>(item.remainingAmount);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [overrideDate, setOverrideDate] = useState<string>(item.dueDate.toISOString().split('T')[0]);
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
        const newPayment: SupplierPayment = {
            id: `sp_${Date.now()}`,
            amount: Number(amount),
            date: new Date(date),
            method,
            reference,
            notes,
            attachment
        };

        const newOrders = [...orders];
        const orderIndex = newOrders.findIndex(o => o.id === item.orderId);
        if (orderIndex === -1) return;

        const order = { ...newOrders[orderIndex] };
        
        if (item.itemType === 'lineItem') {
             const newItems = [...order.lineItems];
             const targetItem = { ...newItems[item.itemIndex] };
             targetItem.supplierPayments = [...(targetItem.supplierPayments || []), newPayment];
             newItems[item.itemIndex] = targetItem;
             order.lineItems = newItems;
        } else {
             const newServices = [...order.additionalServices];
             const targetService = { ...newServices[item.itemIndex] };
             targetService.supplierPayments = [...(targetService.supplierPayments || []), newPayment];
             newServices[item.itemIndex] = targetService;
             order.additionalServices = newServices;
        }
        
        // Log to Timeline
        const timelineEvent: any = { 
            id: `tl_pay_${Date.now()}`,
            timestamp: new Date(),
            user: 'מערכת',
            type: 'LOG',
            content: `תשלום ספק בסך ₪${newPayment.amount.toLocaleString()} נרשם עבור ${item.itemDescription}. הערות: ${notes || '-'}`
        };
        order.timeline = [timelineEvent, ...order.timeline];

        newOrders[orderIndex] = order;
        setOrders(newOrders);
        onClose();
    };

    const handleUpdateDueDate = () => {
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
        alert("תאריך יעד לתשלום עודכן בהצלחה");
    };

    return (
        <Modal title={`ניהול תשלום - ${item.supplierName}`} onClose={onClose} size="xl">
            <div className="mb-4 border-b border-slate-200">
                 <nav className="-mb-px flex space-x-6 space-x-reverse">
                    <button onClick={() => setActiveTab('new')} className={`pb-2 border-b-2 font-medium text-sm ${activeTab === 'new' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>תשלום חדש</button>
                    <button onClick={() => setActiveTab('history')} className={`pb-2 border-b-2 font-medium text-sm ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>היסטוריה ({item.payments.length})</button>
                    <button onClick={() => setActiveTab('settings')} className={`pb-2 border-b-2 font-medium text-sm ${activeTab === 'settings' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>שינוי תאריכים</button>
                </nav>
            </div>

            {activeTab === 'new' && (
                <div className="space-y-4 text-start">
                    <div className="bg-slate-50 p-3 rounded border border-slate-200 mb-4">
                        <p className="text-sm text-slate-600">עבור: <strong>{item.orderNumber}</strong> - {item.itemDescription}</p>
                        <div className="flex justify-between mt-2">
                            <span>סה"כ עלות: ₪{item.cost.toLocaleString()}</span>
                            <span className="text-red-600 font-bold">יתרה לתשלום: ₪{item.remainingAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">סכום לתשלום</label>
                            <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">תאריך ביצוע</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">אמצעי תשלום</label>
                            <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">אסמכתא</label>
                            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="מס' צ'ק / אישור העברה" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                    </div>
                    
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
                        <button onClick={handleSavePayment} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור תשלום</button>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
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
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">אסמכתא</th>
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">הערות</th>
                                    <th className="px-3 py-2 text-start text-xs font-medium text-slate-500">קובץ</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {item.payments.map(p => (
                                    <tr key={p.id}>
                                        <td className="px-3 py-2 text-sm">{new Date(p.date).toLocaleDateString('he-IL')}</td>
                                        <td className="px-3 py-2 text-sm font-semibold text-green-600">₪{p.amount.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-sm">{p.method}</td>
                                        <td className="px-3 py-2 text-sm">{p.reference || '-'}</td>
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

            {activeTab === 'settings' && (
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
}

const ReportsPage: React.FC<ReportsPageProps> = ({ orders, suppliers, onNavigateToOrder, setOrders, statusConfigs }) => {
    const [viewMode, setViewMode] = useState<'forecast' | 'purchase_history'>('forecast');
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
    const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
    const [selectedItemForPayment, setSelectedItemForPayment] = useState<PayableItem | null>(null);

    const canManagePayments = !!setOrders;

    // --- Data Processing ---

    const rawPayables = useMemo((): PayableItem[] => {
        const items: PayableItem[] = [];
        const supplierMap = new Map<string, Supplier>(suppliers.map(s => [s.id, s]));
        const today = new Date();
        today.setHours(0,0,0,0);
        
        // Filter out non-deal orders based on dynamic status configuration
        const activeOrders = orders.filter(order => {
            const statusConfig = statusConfigs.find(c => c.label === order.orderStatus);
            // Default to true if config not found (to be safe), or use the flag
            return statusConfig ? statusConfig.isActiveDeal : true;
        });

        activeOrders.forEach(order => {
             const process = (costItem: LineItem | AdditionalService, type: 'lineItem' | 'additionalService', index: number) => {
                if (!costItem.cost || costItem.cost <= 0) return;
                
                const supplierId = costItem.supplierId || order.supplierId;
                if (!supplierId) return;
                const supplier = supplierMap.get(supplierId);
                if (!supplier) return;

                const dueDate = calculateDueDate(order.date, supplier.paymentTerms, costItem.customDueDate);
                
                // Calculate total cost for the item based on type
                let totalItemCost = costItem.cost;
                if (type === 'lineItem') {
                     const li = costItem as LineItem;
                     totalItemCost = li.cost * (li.quantity || 1);
                }

                // Calculate totals
                const payments = costItem.supplierPayments || [];
                const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
                const remainingAmount = totalItemCost - paidAmount;

                // Determine Status
                let status: PayableItem['status'] = 'צפוי';
                if (remainingAmount <= 0.1) { // Floating point tolerance
                    status = 'שולם';
                } else if (paidAmount > 0) {
                    status = 'שולם חלקית';
                } else {
                     const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                     const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                     
                     if (dueDate < today) {
                         status = 'איחור';
                     } else if (dueDate >= startOfMonth && dueDate <= endOfMonth) {
                         status = 'לתשלום החודש';
                     }
                }

                items.push({
                    uniqueId: `${order.id}_${type}_${index}`,
                    supplierId: supplier.id,
                    supplierName: supplier.name,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    orderDescription: order.description,
                    itemDescription: costItem.description,
                    cost: totalItemCost,
                    paidAmount,
                    remainingAmount: Math.max(0, remainingAmount),
                    orderDate: order.date,
                    dueDate,
                    isCustomDueDate: !!costItem.customDueDate,
                    status,
                    payments,
                    itemType: type,
                    itemIndex: index,
                });
             };

             order.lineItems.forEach((li, idx) => process(li, 'lineItem', idx));
             order.additionalServices.forEach((as, idx) => process(as, 'additionalService', idx));
        });
        return items;
    }, [orders, suppliers, statusConfigs]);

    const groupedData = useMemo(() => {
        const groups: Record<string, MonthlyGroup> = {};
        
        // Helper to get month key
        const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const getMonthLabel = (date: Date) => date.toLocaleString('he-IL', { month: 'long', year: 'numeric' });

        rawPayables.forEach(item => {
            // Determine grouping key based on View Mode
            const keyDate = viewMode === 'forecast' ? item.dueDate : item.orderDate;
            const key = getMonthKey(keyDate);

            if (!groups[key]) {
                groups[key] = {
                    monthYearKey: key,
                    label: getMonthLabel(keyDate),
                    totalDue: 0,
                    totalPaid: 0,
                    items: [],
                    suppliers: {}
                };
            }

            // Accumulate Month Totals
            groups[key].totalDue += item.cost;
            groups[key].totalPaid += item.paidAmount;
            groups[key].items.push(item);

            // Group by Supplier inside Month
            if (!groups[key].suppliers[item.supplierId]) {
                groups[key].suppliers[item.supplierId] = {
                    supplierName: item.supplierName,
                    totalDue: 0,
                    totalPaid: 0,
                    items: []
                };
            }
            
            groups[key].suppliers[item.supplierId].totalDue += item.cost;
            groups[key].suppliers[item.supplierId].totalPaid += item.paidAmount;
            groups[key].suppliers[item.supplierId].items.push(item);
        });

        // Sort months
        return Object.values(groups).sort((a, b) => a.monthYearKey.localeCompare(b.monthYearKey));
    }, [rawPayables, viewMode]);

    // --- Interactions ---

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

    // --- Summary Stats ---
    const totalDebt = rawPayables.reduce((sum, item) => sum + item.remainingAmount, 0);
    const overdueDebt = rawPayables.filter(i => i.status === 'איחור').reduce((sum, item) => sum + item.remainingAmount, 0);
    const thisMonthDue = rawPayables.filter(i => i.status === 'לתשלום החודש').reduce((sum, item) => sum + item.remainingAmount, 0);

    return (
        <div className="space-y-6 pb-20">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title='סה"כ חוב פתוח' value={`₪${totalDebt.toLocaleString()}`} />
                <StatCard title="תשלומים בפיגור" value={`₪${overdueDebt.toLocaleString()}`} color="text-red-600" />
                <StatCard title="לתשלום החודש" value={`₪${thisMonthDue.toLocaleString()}`} color="text-orange-600" />
            </div>

            {/* View Switcher */}
            <div className="flex justify-center mb-6">
                <div className="bg-white p-1 rounded-lg shadow border border-slate-200 flex">
                    <button
                        onClick={() => setViewMode('forecast')}
                        className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'forecast' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        תחזית תזרים (לפי תאריך תשלום)
                    </button>
                    <button
                        onClick={() => setViewMode('purchase_history')}
                        className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'purchase_history' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        היסטוריית רכש (לפי תאריך הזמנה)
                    </button>
                </div>
            </div>

            {/* Accordion List */}
            <div className="space-y-4">
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
                            <div className="flex gap-6 text-sm">
                                <div className="hidden md:block">
                                    <span className="text-slate-500">סה"כ:</span> <span className="font-semibold">₪{group.totalDue.toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">לתשלום:</span> <span className="font-bold text-red-600">₪{(group.totalDue - group.totalPaid).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Supplier List within Month */}
                        {expandedMonths.has(group.monthYearKey) && (
                            <div className="divide-y divide-slate-100">
                                {Object.values(group.suppliers).map((supplierGroup: SupplierGroup, idx) => {
                                    const uniqueSupplierKey = `${group.monthYearKey}-${idx}`; // Just for UI unique key
                                    const remainingForSupplier = supplierGroup.totalDue - supplierGroup.totalPaid;
                                    const isPaidOff = remainingForSupplier <= 1;

                                    return (
                                        <div key={idx} className="bg-white">
                                            {/* Supplier Header */}
                                            <div 
                                                onClick={() => toggleSupplier(uniqueSupplierKey)}
                                                className="flex items-center justify-between p-3 pl-6 pr-8 cursor-pointer hover:bg-slate-50"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={`transform transition-transform ${expandedSuppliers.has(uniqueSupplierKey) ? 'rotate-180' : ''}`}>
                                                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                    </div>
                                                    <span className="font-medium text-slate-700">{supplierGroup.supplierName}</span>
                                                    {isPaidOff && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">שולם</span>}
                                                </div>
                                                <div className="text-sm text-slate-600">
                                                    {isPaidOff ? (
                                                         <span className="text-green-600 font-medium">הכל שולם</span>
                                                    ) : (
                                                        <span>יתרה: <span className="font-semibold text-slate-900">₪{remainingForSupplier.toLocaleString()}</span></span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Items Table */}
                                            {expandedSuppliers.has(uniqueSupplierKey) && (
                                                <div className="bg-slate-50 p-3 pl-10 pr-6 border-t border-slate-100">
                                                    <table className="min-w-full text-xs md:text-sm">
                                                        <thead>
                                                            <tr className="text-slate-500 text-start">
                                                                <th className="pb-2 font-medium">הזמנה</th>
                                                                <th className="pb-2 font-medium">תיאור פריט</th>
                                                                <th className="pb-2 font-medium">תאריך הזמנה</th>
                                                                <th className="pb-2 font-medium">יעד לתשלום</th>
                                                                <th className="pb-2 font-medium">סכום</th>
                                                                <th className="pb-2 font-medium">יתרה</th>
                                                                <th className="pb-2 font-medium">סטטוס</th>
                                                                <th className="pb-2 font-medium">פעולות</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {supplierGroup.items.map(item => (
                                                                <tr key={item.uniqueId}>
                                                                    <td className="py-2">
                                                                        <button onClick={() => onNavigateToOrder(item.orderId)} className="text-primary hover:underline font-semibold">
                                                                            {item.orderNumber}
                                                                        </button>
                                                                    </td>
                                                                    <td className="py-2 text-slate-600">{item.itemDescription}</td>
                                                                    <td className="py-2">{item.orderDate.toLocaleDateString('he-IL')}</td>
                                                                    <td className="py-2">
                                                                        {item.dueDate.toLocaleDateString('he-IL')}
                                                                        {item.isCustomDueDate && <span className="text-xs text-orange-500 ms-1">(ידני)</span>}
                                                                    </td>
                                                                    <td className="py-2">₪{item.cost.toLocaleString()}</td>
                                                                    <td className="py-2 font-semibold text-slate-700">₪{item.remainingAmount.toLocaleString()}</td>
                                                                    <td className="py-2">
                                                                        <span className={`px-2 py-0.5 rounded text-xs ${
                                                                            item.status === 'שולם' ? 'bg-green-100 text-green-800' :
                                                                            item.status === 'איחור' ? 'bg-red-100 text-red-800' :
                                                                            item.status === 'לתשלום החודש' ? 'bg-orange-100 text-orange-800' :
                                                                            item.status === 'שולם חלקית' ? 'bg-blue-100 text-blue-800' :
                                                                            'bg-slate-200 text-slate-600'
                                                                        }`}>
                                                                            {item.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-2">
                                                                        {canManagePayments && (
                                                                            <button 
                                                                                onClick={() => setSelectedItemForPayment(item)}
                                                                                className="text-primary hover:bg-indigo-50 px-2 py-1 rounded transition-colors"
                                                                            >
                                                                                נהל תשלום
                                                                            </button>
                                                                        )}
                                                                    </td>
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
            </div>

            {selectedItemForPayment && canManagePayments && setOrders && (
                <PaymentManagementModal 
                    item={selectedItemForPayment} 
                    orders={orders} 
                    setOrders={setOrders} 
                    onClose={() => setSelectedItemForPayment(null)} 
                />
            )}
        </div>
    );
};

export default ReportsPage;
