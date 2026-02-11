import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Customer, Contact, Order, PaymentMethod, CustomerPayment, TimelineEvent, OrderStatusConfiguration, PaymentStatus } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, ImportIcon, WhatsAppIcon, EmailIcon, PhoneIcon, CashIcon } from './icons';
import Modal from './Modal';
import { CUSTOMER_CATEGORIES, PAYMENT_TERMS_OPTIONS } from '../constants';
import { calculateOrderTotals } from '../utils/calculations';
import * as mongoService from '../services/mongoService';
import { useViewTracker } from '../contexts/ViewTrackerContext';

// Added missing interface definition for CustomersPageProps
interface CustomersPageProps {
    customers: Customer[];
    setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
    setCustomersLocal: (updater: (prev: Customer[]) => Customer[]) => void;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
    onNavigateToOrder: (orderId: string) => void;
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
}

// Logical key for customer deduplication (must match server)
const customerLogicalKey = (c: Customer & { debt?: number }) =>
    (c.name || '').trim().toLowerCase() + '|' + (c.businessId || '').trim().toLowerCase();

// Helper to check for duplicates
const findDuplicateCustomer = (customers: Customer[], name: string, hp?: string, email?: string, phone?: string) => {
    return customers.find(c => {
        if (name && c.name.toLowerCase() === name.toLowerCase()) return true;
        if (hp && c.businessId === hp) return true;
        if (email || phone) {
            return c.contacts.some(contact => 
                (email && contact.email.toLowerCase() === email.toLowerCase()) ||
                (phone && contact.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))
            );
        }
        return false;
    });
};

// Visual badges: origin (from GI vs app) and sync status to Green Invoice
const fromGreenInvoice = (c: Customer) =>
    (c.notes || '').trim().startsWith('יובא מחשבונית ירוקה') ||
    (!!c.greenInvoiceClientId && (c.category || '').trim() === 'לקוח מ-חשבונית ירוקה');
const syncedToGreenInvoice = (c: Customer) => !!c.greenInvoiceClientId;

const formatCustomerCreatedAt = (d: Date | string | undefined): string => {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const CustomerSyncBadges: React.FC<{ customer: Customer; compact?: boolean }> = ({ customer, compact }) => {
    const fromGI = fromGreenInvoice(customer);
    const toGI = syncedToGreenInvoice(customer);
    const badge = (label: string, title: string, bg: string) => (
        <span key={label} title={title} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${bg}`}>
            {label}
        </span>
    );
    return (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mt-0.5' : 'mt-2'}`}>
            {fromGI ? badge('נוצר בחשבונית ירוקה', 'הלקוח נוצר בחשבונית ירוקה וסונכרן לתוכנה', 'bg-emerald-100 text-emerald-800') : badge('נוצר בתוכנה', 'הלקוח נוצר במערכת זו', 'bg-indigo-100 text-indigo-800')}
            {fromGI && toGI && badge('מסונכרן לתוכנה', 'הלקוח סונכרן ומופיע במערכת', 'bg-emerald-100 text-emerald-800')}
            {!fromGI && toGI && badge('מסונכרן לחשבונית ירוקה', 'הלקוח מקושר ומופיע בחשבונית ירוקה', 'bg-amber-100 text-amber-800')}
        </div>
    );
};

// Enhanced document linking with list selection, allocation editing, and validation
interface DocumentLinkingState {
    selectedDoc: { id: string; amount: number; type: number; description: string; date?: string } | null;
    allocations: Record<string, number>;
    manualDocId: string;
}

const DocumentLinkingSection: React.FC<{
    customer: Customer;
    orderData: Array<Order & { gross: number; paid: number; remaining: number }>;
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
    onClose: () => void;
}> = ({ customer, orderData, setOrders, addActivity, onClose }) => {
    const [state, setState] = useState<DocumentLinkingState>({ selectedDoc: null, allocations: {}, manualDocId: '' });
    const [customerDocs, setCustomerDocs] = useState<any[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [loadingLink, setLoadingLink] = useState(false);

    // Fetch customer documents from GreenInvoice
    useEffect(() => {
        if (!customer.greenInvoiceClientId) return;
        setLoadingDocs(true);
        fetch(`/api/green-invoice/documents/by-client/${customer.greenInvoiceClientId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
        })
            .then(r => r.ok ? r.json() : { documents: [] })
            .then(data => setCustomerDocs(data.documents || []))
            .catch(() => setCustomerDocs([]))
            .finally(() => setLoadingDocs(false));
    }, [customer.greenInvoiceClientId]);

    const docTypeLabel = (t: number) => {
        if (t === 10) return 'הצעת מחיר';
        if (t === 305) return 'חשבונית מס';
        if (t === 320) return 'חשבונית מס+קבלה';
        if (t === 330) return 'חשבונית זיכוי';
        if (t === 400) return 'קבלה';
        return 'מסמך';
    };

    const totalDebt = orderData.reduce((s, o) => s + o.remaining, 0);
    const allocatedTotal = Object.values(state.allocations).reduce((s, a) => s + a, 0);
    const docAmount = state.selectedDoc?.amount || 0;
    const overAllocated = allocatedTotal > docAmount + 0.01;

    // Auto-allocate when document is selected
    const handleSelectDoc = async (docId: string, fromList: boolean = true) => {
        if (!docId.trim()) return;
        try {
            const docRes = await fetch(`/api/green-invoice/documents/${docId}/raw`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
            });
            if (!docRes.ok) throw new Error('מסמך לא נמצא');
            const doc = await docRes.json();
            const docTotal = Number(doc.amount ?? doc.total ?? 0);
            if (docTotal <= 0) throw new Error('סכום המסמך לא תקין');
            
            // Auto-allocate FIFO
            let remainingToAlloc = Math.min(docTotal, totalDebt);
            const allocations: Record<string, number> = {};
            orderData.forEach(o => {
                if (remainingToAlloc <= 0.01) allocations[o.id] = 0;
                else {
                    const amt = Math.min(o.remaining, remainingToAlloc);
                    allocations[o.id] = Number(amt.toFixed(2));
                    remainingToAlloc -= amt;
                }
            });
            
            setState({
                selectedDoc: { id: doc.id, amount: docTotal, type: doc.type, description: doc.description || doc.desc || '', date: doc.date },
                allocations,
                manualDocId: fromList ? '' : docId
            });
        } catch (e: any) {
            alert(e.message || 'שגיאה בטעינת מסמך');
        }
    };

    const handleAllocationChange = (orderId: string, value: string) => {
        const val = Math.max(0, parseFloat(value) || 0);
        setState(prev => ({ ...prev, allocations: { ...prev.allocations, [orderId]: val } }));
    };

    const handleLink = async () => {
        if (!state.selectedDoc || orderData.length === 0 || overAllocated) return;
        setLoadingLink(true);
        try {
            const res = await fetch('/api/green-invoice/documents/link-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ documentId: state.selectedDoc.id, allocations: state.allocations })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'שגיאה בשיוך');
            if (data.updatedOrders?.length) {
                setOrders(prev => prev.map(o => {
                    const u = data.updatedOrders.find((uo: Order) => uo.id === o.id);
                    return u || o;
                }));
            }
            const linkedCount = Object.values(state.allocations).filter(a => a > 0).length;
            addActivity(`שויך מסמך חשבונית ירוקה (${docTypeLabel(state.selectedDoc.type)}) ל־${linkedCount} הזמנות`);
            setState({ selectedDoc: null, allocations: {}, manualDocId: '' });
            onClose();
        } catch (e: any) {
            alert(e.message || 'שגיאה בשיוך מסמך');
        } finally {
            setLoadingLink(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Document Selection */}
            {!state.selectedDoc && (
                <>
                    {customer.greenInvoiceClientId && (
                        <div>
                            <label className="block text-xs font-bold text-emerald-800 mb-2">בחר מסמך מרשימת הלקוח</label>
                            {loadingDocs ? (
                                <div className="text-sm text-slate-500 py-2">טוען מסמכים...</div>
                            ) : customerDocs.length > 0 ? (
                                <div className="max-h-48 overflow-y-auto border border-emerald-200 rounded-lg bg-white">
                                    {customerDocs.map(doc => (
                                        <button
                                            key={doc.id}
                                            type="button"
                                            onClick={() => handleSelectDoc(doc.id, true)}
                                            className="w-full text-right p-2 hover:bg-emerald-50 border-b last:border-0 transition-colors"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <div className="text-xs font-bold text-slate-700">{docTypeLabel(doc.type)}</div>
                                                    <div className="text-[10px] text-slate-500 line-clamp-1">{doc.description || doc.desc || 'ללא תיאור'}</div>
                                                </div>
                                                <div className="text-sm font-black text-emerald-700">₪{Number(doc.amount || doc.total || 0).toLocaleString()}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500 py-2">אין מסמכים זמינים</div>
                            )}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-emerald-800 mb-1">או הזן מזהה מסמך ידנית</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={state.manualDocId}
                                onChange={e => setState(prev => ({ ...prev, manualDocId: e.target.value }))}
                                placeholder="מזהה מסמך (ID)"
                                className="flex-1 text-sm border border-emerald-300 rounded px-2 py-1.5"
                            />
                            <button
                                type="button"
                                onClick={() => handleSelectDoc(state.manualDocId, false)}
                                disabled={!state.manualDocId.trim()}
                                className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-50"
                            >
                                טען
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Selected Document & Allocations */}
            {state.selectedDoc && (
                <div className="space-y-3">
                    <div className="bg-emerald-100 border border-emerald-300 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <div className="text-sm font-bold text-emerald-900">{docTypeLabel(state.selectedDoc.type)}</div>
                                <div className="text-[10px] text-emerald-700 line-clamp-1">{state.selectedDoc.description || 'ללא תיאור'}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setState({ selectedDoc: null, allocations: {}, manualDocId: '' })}
                                className="text-emerald-600 hover:text-emerald-800 text-xs"
                            >
                                ✕ שנה
                            </button>
                        </div>
                        <div className="text-xl font-black text-emerald-800">₪{docAmount.toLocaleString()}</div>
                        {state.selectedDoc.date && <div className="text-[10px] text-emerald-600">תאריך: {state.selectedDoc.date}</div>}
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold text-slate-700">הקצאה להזמנות</label>
                            <div className={`text-xs font-bold ${overAllocated ? 'text-red-600' : allocatedTotal > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                ₪{allocatedTotal.toLocaleString()} / ₪{docAmount.toLocaleString()}
                            </div>
                        </div>
                        {overAllocated && (
                            <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-2">
                                ⚠️ סכום ההקצאות עולה על סכום המסמך
                            </div>
                        )}
                        <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                            {orderData.map(order => (
                                <div key={order.id} className="flex items-center gap-2 p-2 border-b last:border-0 hover:bg-slate-50">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-slate-700 truncate">{order.orderNumber}</div>
                                        <div className="text-[10px] text-slate-500">יתרה: ₪{order.remaining.toLocaleString()}</div>
                                    </div>
                                    <input
                                        type="number"
                                        value={state.allocations[order.id] || ''}
                                        onChange={e => handleAllocationChange(order.id, e.target.value)}
                                        placeholder="0.00"
                                        className="w-24 text-xs font-bold p-1.5 border border-slate-300 rounded text-center"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleLink}
                        disabled={loadingLink || allocatedTotal <= 0 || overAllocated || orderData.length === 0}
                        className="w-full py-3 bg-emerald-600 text-white rounded-lg font-black text-sm shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loadingLink ? 'משייך...' : `שייך מסמך ל־${Object.values(state.allocations).filter(a => a > 0).length} הזמנות`}
                    </button>
                </div>
            )}
        </div>
    );
};

const CollectionCenterModal: React.FC<{
    customer: Customer;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    onClose: () => void;
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
}> = ({ customer, orders, setOrders, onClose, addActivity, statusConfigs, vatRate }) => {
    const [loading, setLoading] = useState(false);
    const [allCustomerOrders, setAllCustomerOrders] = useState<Order[]>([]);
    
    // מרכז גבייה: רק הזמנות פתוחות לתשלום של הלקוח הנבחר – שום לקוח אחר
    useEffect(() => {
        const fetchCustomerOrders = async () => {
            setLoading(true);
            try {
                const filters = {
                    customerFilter: [customer.id],
                    collectionCenterView: true,
                    showCompletedOrders: false
                };
                const result = await mongoService.getOrdersPaginated(filters, 1, 10000);
                const raw = result.orders || [];
                const forThisCustomer = raw.filter((o: Order) => o.customerId === customer.id);
                // Calculate balance for each order
                const ordersWithBalance = forThisCustomer.map(o => {
                    const { totalAmount, totalPaid } = calculateOrderTotals(o);
                    const currentOrderVat = o.vatRate ?? vatRate;
                    const gross = totalAmount * (1 + currentOrderVat / 100);
                    const remaining = Math.max(0, gross - totalPaid);
                    return { 
                        ...o,
                        gross,
                        paid: totalPaid,
                        remaining: Number(remaining.toFixed(2))
                    };
                }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                
                setAllCustomerOrders(ordersWithBalance);
            } catch (error) {
                console.error('Error fetching customer orders:', error);
                const localOrders = orders
            .filter(o => o.customerId === customer.id && o.paymentStatus !== 'שולם')
            .map(o => {
                const { totalAmount, totalPaid } = calculateOrderTotals(o);
                const currentOrderVat = o.vatRate ?? vatRate;
                const gross = totalAmount * (1 + currentOrderVat / 100);
                const remaining = Math.max(0, gross - totalPaid);
                return { 
                    ...o,
                    gross,
                    paid: totalPaid,
                    remaining: Number(remaining.toFixed(2))
                };
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                setAllCustomerOrders(localOrders);
            } finally {
                setLoading(false);
            }
        };
        
        fetchCustomerOrders();
    }, [customer.id, statusConfigs, vatRate]);

    // 2. Filter only orders that REALLY have a debt ( > 1 NIS to avoid rounding issues)
    const orderData = useMemo(() => {
        return allCustomerOrders.filter(o => o.remaining > 1);
    }, [allCustomerOrders]);

    const totalCustomerDebt = orderData.reduce((sum, o) => sum + o.remaining, 0);

    // Form State
    const [totalAmount, setTotalAmount] = useState<number>(0);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
    const [reference, setReference] = useState('');
    const [repaymentDate, setRepaymentDate] = useState<string>('');
    const [notes, setNotes] = useState('');
    
    // Distribution State (amount to allocate per order)
    const [allocations, setAllocations] = useState<Record<string, number>>({});

    // Sync totalAmount based on manual changes in the table
    const allocatedTotal = useMemo(() => {
        return Object.values(allocations).reduce((sum, a) => sum + a, 0);
    }, [allocations]);

    // Distribution Logic: FIFO (Oldest First)
    const handleAutoDistribute = () => {
        let remainingToSpend = totalAmount;
        const newAllocations: Record<string, number> = {};

        orderData.forEach(order => {
            if (remainingToSpend <= 0.01) {
                newAllocations[order.id] = 0;
            } else {
                const canPay = Math.min(order.remaining, remainingToSpend);
                newAllocations[order.id] = Number(canPay.toFixed(2));
                remainingToSpend -= canPay;
            }
        });
        setAllocations(newAllocations);
    };

    const handleManualAllocationChange = (orderId: string, value: string) => {
        const val = parseFloat(value) || 0;
        setAllocations(prev => {
            const next = { ...prev, [orderId]: val };
            // Update the top total to match the sum of manual entries
            const newTotal = Object.values(next).reduce((sum, a) => sum + a, 0);
            setTotalAmount(Number(newTotal.toFixed(2)));
            return next;
        });
    };

    const fillFullBalance = (orderId: string, remaining: number) => {
        handleManualAllocationChange(orderId, remaining.toString());
    };

    const fillAllBalances = () => {
        const newAllocations: Record<string, number> = {};
        orderData.forEach(o => {
            newAllocations[o.id] = o.remaining;
        });
        setAllocations(newAllocations);
        setTotalAmount(Number(totalCustomerDebt.toFixed(2)));
    };

    const handleSaveBatchPayment = () => {
        if (allocatedTotal <= 0) {
            alert("לא הוזנו סכומים להקצאה");
            return;
        }

        const batchId = `batch_${Date.now()}`;
        const newOrders = [...orders];

        Object.entries(allocations).forEach(([orderId, amount]) => {
            if (amount <= 0.01) return;

            const orderIdx = newOrders.findIndex(o => o.id === orderId);
            if (orderIdx === -1) return;

            const order = { ...newOrders[orderIdx] };
            
            const newPayment: CustomerPayment = {
                id: `pay_${Date.now()}_${orderId}`,
                amount,
                date: new Date(date),
                method,
                reference,
                repaymentDate: method === PaymentMethod.CHECK ? new Date(repaymentDate) : undefined,
                batchId,
                notes: `תשלום מרוכז לקוח. ${notes}`.trim(),
                status: method === PaymentMethod.CHECK ? 'PENDING' : 'CLEARED'
            };

            const logEvent: TimelineEvent = {
                id: `tl_batch_${Date.now()}_${orderId}`,
                timestamp: new Date(),
                user: 'מערכת',
                type: 'LOG',
                content: `התקבל תשלום מרוכז בסך ₪${amount.toLocaleString()} (${method}). אסמכתא: ${reference || 'ללא'}`
            };

            order.payments = [...(order.payments || []), newPayment];
            order.timeline = [logEvent, ...order.timeline];
            
            newOrders[orderIdx] = order;
        });

        setOrders(newOrders);
        addActivity(`בוצע תשלום מרוכז עבור לקוח: ${customer.name} בסך ₪${allocatedTotal.toLocaleString()}`, { entityType: 'customer', entityId: customer.id, action: 'payment', metadata: { amount: allocatedTotal, name: customer.name } });
        onClose();
    };

    return (
        <Modal title={`מרכז גבייה - ${customer.name}`} onClose={onClose} size="5xl">
            <div className="flex flex-col md:flex-row gap-8 text-start">
                
                {/* Left Side: Order List & Allocation */}
                <div className="flex-1 space-y-6">
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-black text-slate-800 flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                הזמנות פתוחות לתשלום ({orderData.length})
                            </h4>
                            {orderData.length > 0 && (
                                <button 
                                    onClick={fillAllBalances}
                                    className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-black hover:bg-indigo-100 transition-all border border-indigo-200"
                                >
                                    ✅ סמן הכל לתשלום מלא
                                </button>
                            )}
                        </div>
                        <div className="border rounded-xl overflow-hidden shadow-sm">
                            <table className="min-w-full text-xs text-right">
                                <thead className="bg-slate-50 text-slate-500 font-bold border-b">
                                    <tr>
                                        <th className="px-4 py-3">הזמנה</th>
                                        <th className="px-4 py-3">סה"כ ברוטו</th>
                                        <th className="px-4 py-3">יתרה פתוחה</th>
                                        <th className="px-4 py-3 bg-indigo-50 text-indigo-700 w-32">סכום לתשלום</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {orderData.map(order => (
                                        <tr key={order.id} className="hover:bg-slate-50 group">
                                            <td className="px-4 py-3">
                                                <span className="font-bold text-slate-700 block">{order.orderNumber}</span>
                                                <span className="text-[10px] text-slate-400 line-clamp-1">{order.description}</span>
                                            </td>
                                            <td className="px-4 py-3">₪{order.gross.toLocaleString()}</td>
                                            <td className="px-4 py-3 font-bold text-red-600">
                                                <button 
                                                    onClick={() => fillFullBalance(order.id, order.remaining)}
                                                    className="hover:underline hover:text-red-700 flex items-center gap-1"
                                                    title="לחץ למילוי יתרה מלאה"
                                                >
                                                    ₪{order.remaining.toLocaleString()}
                                                    <span className="opacity-0 group-hover:opacity-100 text-[8px] bg-red-100 px-1 rounded transition-opacity">⚡ פתח</span>
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 bg-indigo-50/30">
                                                <div className="relative">
                                                    <input 
                                                        type="number" 
                                                        value={allocations[order.id] || ''} 
                                                        onChange={e => handleManualAllocationChange(order.id, e.target.value)}
                                                        placeholder="0.00"
                                                        className="w-full text-sm font-bold p-1.5 border border-indigo-200 rounded focus:ring-primary text-indigo-700 text-center"
                                                    />
                                                    {allocations[order.id] && allocations[order.id] > 0 && (
                                                        <button 
                                                            onClick={() => handleManualAllocationChange(order.id, '0')}
                                                            className="absolute -left-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500"
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {orderData.length === 0 && (
                                        <tr><td colSpan={4} className="p-12 text-center text-slate-400 font-medium">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                                אין חובות פתוחים ללקוח זה.
                                            </div>
                                        </td></tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-slate-100 font-black border-t">
                                    <tr>
                                        <td colSpan={2} className="px-4 py-3">סה"כ חוב פתוח:</td>
                                        <td className="px-4 py-3 text-red-700">₪{totalCustomerDebt.toLocaleString()}</td>
                                        <td className="px-4 py-3 bg-indigo-100 text-indigo-800 text-center">₪{allocatedTotal.toLocaleString()}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Side: Document Linking (Primary) + Manual Payment (Secondary) */}
                <div className="w-full md:w-80 space-y-4">
                    {/* PRIMARY: Document Linking */}
                    <div className="bg-emerald-50 p-4 rounded-2xl border-2 border-emerald-300 shadow-lg space-y-3">
                        <h4 className="font-black text-slate-800 border-b border-emerald-300 pb-2 text-sm flex items-center gap-2">
                            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            שיוך מרוכז - מסמך חשבונית ירוקה
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">בחר מסמך (קבלה/חשבונית) מהרשימה או הזן מזהה — הסכום יחולק אוטומטית לפי יתרות, ניתן לערוך ידנית</p>
                        <DocumentLinkingSection
                            customer={customer}
                            orderData={orderData as Array<Order & { gross: number; paid: number; remaining: number }>}
                            setOrders={setOrders}
                            addActivity={addActivity}
                            onClose={onClose}
                        />
                    </div>

                    {/* SECONDARY: Manual Payment (Collapsible) */}
                    <details className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
                        <summary className="p-4 cursor-pointer hover:bg-slate-100 transition-colors rounded-2xl">
                            <div className="flex items-center gap-2">
                                <CashIcon className="w-5 h-5 text-slate-600"/>
                                <span className="font-black text-slate-700 text-sm">רישום תשלום ידני (ללא מסמך)</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">למקרים שבהם התקבל תשלום ועדיין אין מסמך בחשבונית ירוקה</p>
                        </summary>
                        <div className="p-5 pt-2 space-y-4">
                        <h4 className="font-black text-slate-800 border-b pb-3 flex items-center gap-2">
                            <CashIcon className="w-5 h-5 text-emerald-600"/>
                            פרטי תקבול (ידני)
                        </h4>
                        
                        <div>
                            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1">סכום שהתקבל (₪)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    value={totalAmount || ''} 
                                    onChange={e => setTotalAmount(parseFloat(e.target.value) || 0)} 
                                    className="w-full text-xl font-black p-3 rounded-xl border-slate-300 focus:ring-primary focus:border-primary text-emerald-700 shadow-inner"
                                    placeholder="0.00"
                                />
                                {totalAmount > 0 && (
                                    <button 
                                        onClick={handleAutoDistribute}
                                        className="mt-2 w-full py-2 bg-indigo-600 text-white text-xs font-black rounded-lg shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                                        title="פזר את הסכום שהזנת מלמעלה בין ההזמנות"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                        פיזור אוטומטי (FIFO)
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-black text-slate-500 uppercase mb-1">אמצעי תשלום</label>
                            <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="w-full text-sm font-bold border-slate-300 rounded-lg p-2 bg-white">
                                {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        {method === PaymentMethod.CHECK && (
                            <div className="space-y-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl animate-fadeIn">
                                <div>
                                    <label className="block text-[10px] font-black text-yellow-700 uppercase">מספר צ'ק</label>
                                    <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="w-full text-sm border-yellow-300 rounded p-2 focus:ring-yellow-500" placeholder="חובה" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-yellow-700 uppercase">תאריך פירעון</label>
                                    <input type="date" value={repaymentDate} onChange={e => setRepaymentDate(e.target.value)} className="w-full text-sm border-yellow-300 rounded p-2 focus:ring-yellow-500" required />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase">תאריך קבלה</label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full text-sm border-slate-300 rounded p-2" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase">אסמכתא / הערות</label>
                                <input type="text" value={method === PaymentMethod.CHECK ? notes : reference} onChange={e => method === PaymentMethod.CHECK ? setNotes(e.target.value) : setReference(e.target.value)} className="w-full text-sm border-slate-300 rounded p-2" />
                            </div>
                        </div>

                            <button 
                                onClick={handleSaveBatchPayment}
                                disabled={allocatedTotal <= 0}
                                className="w-full py-3 bg-slate-600 text-white rounded-lg font-black text-sm shadow-md hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                רשום תשלום ידני
                            </button>
                        </div>
                    </details>
                </div>
            </div>
        </Modal>
    );
};

const ManualMergeModal: React.FC<{
    targetCustomer: Customer;
    allCustomers: Customer[];
    onConfirm: (victimId: string) => void;
    onClose: () => void;
}> = ({ targetCustomer, allCustomers, onConfirm, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVictim, setSelectedVictim] = useState<Customer | null>(null);

    const candidates = useMemo(() => {
        if (!searchTerm) return [];
        const lower = searchTerm.toLowerCase();
        return allCustomers.filter(c => 
            c.id !== targetCustomer.id && (
                c.name.toLowerCase().includes(lower) || 
                c.businessId?.includes(lower) ||
                c.contacts.some(cont => cont.name.toLowerCase().includes(lower) || cont.phone.includes(lower))
            )
        ).slice(0, 10);
    }, [searchTerm, allCustomers, targetCustomer.id]);

    return (
        <Modal title="מיזוג לקוחות ידני" onClose={onClose} size="lg">
            <div className="text-start space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg">
                    <h4 className="font-bold text-indigo-900">הלקוח הראשי: {targetCustomer.name}</h4>
                    <p className="text-sm text-indigo-700">זהו הלקוח שיישמר ("הוותיק"). המידע מהלקוח שתבחר למטה ימוזג לתוכו, ולאחר מכן הלקוח המשני יימחק.</p>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">בחר לקוח למיזוג (ייבלע ויימחק)</label>
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setSelectedVictim(null); }}
                        placeholder="חפש לפי שם, ח.פ או טלפון..."
                        className="w-full p-2 border border-slate-300 rounded focus:ring-primary focus:border-primary"
                    />
                    
                    {searchTerm && candidates.length > 0 && !selectedVictim && (
                        <div className="mt-2 border rounded max-h-40 overflow-y-auto bg-white shadow-sm">
                            {candidates.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={() => setSelectedVictim(c)}
                                    className="p-2 hover:bg-slate-50 cursor-pointer border-b last:border-0"
                                >
                                    <div className="font-bold text-sm text-slate-800">{c.name}</div>
                                    <div className="text-xs text-slate-500">ח.פ: {c.businessId || '-'} | אנשי קשר: {c.contacts.length}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {selectedVictim && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg animate-fadeIn">
                        <h4 className="font-bold text-red-900 mb-2">אישור מיזוג</h4>
                        <p className="text-sm text-red-800">
                            האם אתה בטוח שברצונך למזג את <strong>{selectedVictim.name}</strong> לתוך <strong>{targetCustomer.name}</strong>?
                        </p>
                        <ul className="list-disc list-inside text-xs text-red-700 mt-2 space-y-1">
                            <li>כל אנשי הקשר של {selectedVictim.name} יועברו.</li>
                            <li>כל ההזמנות של {selectedVictim.name} ישויכו מחדש.</li>
                            <li><strong>{selectedVictim.name} יימחק לצמיתות.</strong></li>
                        </ul>
                        
                        <div className="flex justify-end gap-3 mt-4">
                            <button onClick={onClose} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded hover:bg-slate-50">ביטול</button>
                            <button onClick={() => onConfirm(selectedVictim.id)} className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 shadow-sm">בצע מיזוג</button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

// Enhanced form for adding a new customer with all details
const NewCustomerForm: React.FC<{ onSave: (customer: Partial<Customer>, firstContact: Partial<Contact>) => void; onCancel: () => void; saving?: boolean }> = ({ onSave, onCancel, saving }) => {
    const [customerData, setCustomerData] = useState({ 
        name: '', 
        businessId: '',
        category: '',
        website: '',
        address: '',
        addressStreet: '',
        addressCity: '',
        addressZip: '',
        notes: '',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentTerms: 'תשלום מיידי',
        isSpecial: false
    });
    const [contactData, setContactData] = useState({ name: '', email: '', phone: '', role: '' });

    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setCustomerData(prev => ({ ...prev, [name]: val }));
    };
    
    const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setContactData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const companyName = (customerData.name || '').trim();
        const contactName = (contactData.name || '').trim();
        if (!companyName) {
            alert('נא למלא את שם החברה.');
            return;
        }
        if (!contactName) {
            alert('נא למלא את שם איש הקשר.');
            return;
        }
        onSave(customerData, contactData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 text-start" noValidate>
            {/* Section 1: Company Details */}
            <div>
                <h3 className="font-semibold text-lg text-slate-800 mb-3 border-b pb-1">פרטי החברה</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700">שם החברה <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={customerData.name} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" placeholder="חובה" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">ח.פ / ת.ז (למניעת כפילויות)</label>
                        <input type="text" name="businessId" value={customerData.businessId} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" placeholder="לדוג': 512345678" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">קטגוריה</label>
                        <select name="category" value={customerData.category} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-white">
                            <option value="">בחר קטגוריה</option>
                            {CUSTOMER_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אמצעי תשלום</label>
                        <select name="paymentMethod" value={customerData.paymentMethod} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-white">
                            {Object.values(PaymentMethod).map(method => (
                                <option key={method} value={method}>{method}</option>
                            ))}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">תנאי תשלום</label>
                        <select name="paymentTerms" value={customerData.paymentTerms} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-white">
                            {PAYMENT_TERMS_OPTIONS.map(term => (
                                <option key={term} value={term}>{term}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">רחוב ומספר</label>
                        <input type="text" name="addressStreet" value={customerData.addressStreet} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" placeholder="רחוב ומספר בית" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">יישוב</label>
                        <input type="text" name="addressCity" value={customerData.addressCity} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" placeholder="עיר / יישוב" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">מיקוד</label>
                        <input type="text" name="addressZip" value={customerData.addressZip} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" placeholder="מיקוד" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אתר אינטרנט</label>
                        <input type="text" name="website" value={customerData.website} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                     <div className="md:col-span-2 flex items-center mt-2">
                        <input type="checkbox" id="isSpecial" name="isSpecial" checked={customerData.isSpecial} onChange={handleCustomerChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2" />
                        <label htmlFor="isSpecial" className="text-sm font-medium text-slate-700">לקוח מועדף / VIP</label>
                    </div>
                </div>
            </div>
            
            {/* Section 2: Contact Person */}
            <div>
                <h3 className="font-semibold text-lg text-slate-800 mb-3 border-b pb-1">איש קשר ראשי</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">שם מלא <span className="text-red-500">*</span></label>
                        <input type="text" name="contactName" value={contactData.name} onChange={e => { const v = e.target.value; setContactData(prev => ({ ...prev, name: v })); }} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" placeholder="חובה" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">תפקיד</label>
                        <input type="text" name="role" value={contactData.role} onChange={handleContactChange} placeholder="לדוג': מנכ''ל, מנהל רכש" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אימייל</label>
                        <input type="email" name="email" value={contactData.email} onChange={handleContactChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">טלפון</label>
                        <input type="tel" name="phone" value={contactData.phone} onChange={handleContactChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                </div>
            </div>

            {/* Section 3: Notes */}
            <div>
                <label className="block text-sm font-medium text-slate-700">הערות כלליות</label>
                <textarea name="notes" value={customerData.notes} onChange={handleCustomerChange} rows={3} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
            </div>

            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300 disabled:opacity-50">ביטול</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 disabled:opacity-70">
                    {saving ? 'שומר...' : 'שמירה'}
                </button>
            </div>
        </form>
    );
};

// Full detailed view/edit component for a customer
interface CustomerDetailViewProps {
    customer: Customer;
    customerOrders: Order[];
    customerOrdersLoading?: boolean;
    onSave: (customer: Customer) => void;
    onCancel: () => void;
    onNavigateToOrder: (orderId: string) => void;
    onMergeClick: () => void;
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
}

const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({ customer, customerOrders, customerOrdersLoading, onSave, onCancel, onNavigateToOrder, onMergeClick, statusConfigs, vatRate }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'contacts' | 'orders'>('details');
    const [editableCustomer, setEditableCustomer] = useState<Customer>(customer);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);

    useEffect(() => {
        setEditableCustomer({
            ...customer,
            addressStreet: customer.addressStreet ?? customer.address ?? '',
            addressCity: customer.addressCity ?? '',
            addressZip: customer.addressZip ?? '',
        });
    }, [customer]);

    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setEditableCustomer(prev => ({...prev, [name]: type === 'checkbox' ? checked : value}));
    };
    
    const handleContactChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        
        let newContacts = [...editableCustomer.contacts];
        
        // If it's default contact, ensure only one is default
        if (name === 'isDefault' && checked) {
            newContacts = newContacts.map(c => ({ ...c, isDefault: false }));
        }

        (newContacts[index] as any)[name] = type === 'checkbox' ? checked : value;
        
        setEditableCustomer(prev => ({ ...prev, contacts: newContacts }));
    };

    const addContact = () => {
        const newContact: Contact = {
            id: `cont_${Date.now()}`,
            name: '',
            email: '',
            phone: '',
            role: '',
            isBillingContact: false,
            isDefault: editableCustomer.contacts.length === 0,
        };
        setEditableCustomer(prev => ({...prev, contacts: [...prev.contacts, newContact]}));
    };

    const removeContact = (contactId: string) => {
        const contact = editableCustomer.contacts.find(c => c.id === contactId);
        const contactName = contact?.name || 'איש קשר';
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את איש הקשר "${contactName}"?`)) {
            return;
        }
        setEditableCustomer(prev => ({...prev, contacts: prev.contacts.filter(c => c.id !== contactId)}));
    };

    return (
        <div className="flex flex-col text-start">
            <CustomerSyncBadges customer={editableCustomer} />
             <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-6 space-x-reverse px-1">
                    <button onClick={() => setActiveTab('details')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>פרטים</button>
                    <button onClick={() => setActiveTab('contacts')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'contacts' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>אנשי קשר</button>
                    <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'orders' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>היסטוריית הזמנות {customerOrdersLoading ? '(טוען...)' : `(${customerOrders.length})`}</button>
                </nav>
            </div>
            <div className="py-6">
                {activeTab === 'details' && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* תאריך יצירה + מקור (תוכנה / חשבונית ירוקה) */}
                        <div className="md:col-span-2 flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                            <span className="font-medium text-slate-700">תאריך יצירה:</span>
                            {fromGreenInvoice(editableCustomer) ? (
                                <span>נוצר בחשבונית ירוקה ב־{formatCustomerCreatedAt(editableCustomer.greenInvoiceCreatedAt ?? editableCustomer.createdAt)}</span>
                            ) : (
                                <span>נוצר בתוכנה ב־{formatCustomerCreatedAt(editableCustomer.createdAt)}</span>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">שם חברה</label>
                            <input name="name" value={editableCustomer.name} onChange={handleCustomerChange} className="p-2 border rounded w-full"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">ח.פ / ת.ז</label>
                            <input name="businessId" value={editableCustomer.businessId || ''} onChange={handleCustomerChange} className="p-2 border rounded w-full"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">אתר אינטרנט</label>
                            <input name="website" value={editableCustomer.website} onChange={handleCustomerChange} className="p-2 border rounded w-full"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">רחוב ומספר</label>
                            <input name="addressStreet" value={editableCustomer.addressStreet ?? ''} onChange={handleCustomerChange} className="p-2 border rounded w-full" placeholder="רחוב ומספר בית"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">יישוב</label>
                            <input name="addressCity" value={editableCustomer.addressCity ?? ''} onChange={handleCustomerChange} className="p-2 border rounded w-full" placeholder="עיר / יישוב"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">מיקוד</label>
                            <input name="addressZip" value={editableCustomer.addressZip ?? ''} onChange={handleCustomerChange} className="p-2 border rounded w-full" placeholder="מיקוד"/>
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
                            <select name="category" value={editableCustomer.category} onChange={handleCustomerChange} className="p-2 border rounded w-full bg-white border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                {CUSTOMER_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">אמצעי תשלום</label>
                            <select 
                                name="paymentMethod" 
                                value={editableCustomer.paymentMethod} 
                                onChange={handleCustomerChange} 
                                className="p-2 border rounded w-full bg-white border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                            >
                                {Object.values(PaymentMethod).map(method => (
                                    <option key={method} value={method}>{method}</option>
                                ))}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">תנאי תשלום</label>
                            <select 
                                name="paymentTerms" 
                                value={editableCustomer.paymentTerms || 'תשלום מיידי'} 
                                onChange={handleCustomerChange} 
                                className="p-2 border rounded w-full bg-white border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                            >
                                {PAYMENT_TERMS_OPTIONS.map(term => (
                                    <option key={term} value={term}>{term}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center pt-6"><input type="checkbox" name="isSpecial" checked={editableCustomer.isSpecial} onChange={handleCustomerChange} className="h-4 w-4 me-2 rounded"/> לקוח מועדף / VIP</div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
                            <textarea name="notes" value={editableCustomer.notes} onChange={handleCustomerChange} className="w-full p-2 border rounded h-24"/>
                        </div>
                    </div>
                )}
                 {activeTab === 'contacts' && (
                    <div className="space-y-4">
                        {editableCustomer.contacts.map((contact, index) => {
                             let whatsappUrl = '';
                             let telUrl = '';
                             let gmailUrl = '';

                             if (contact.phone) {
                                 let cleanPhone = contact.phone.replace(/[^0-9]/g, '');
                                 telUrl = `tel:${cleanPhone}`;
                                 if (cleanPhone.startsWith('0')) {
                                     cleanPhone = `972${cleanPhone.substring(1)}`;
                                 }
                                 whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}`;
                             }
                             if (contact.email) {
                                 // Explicit Gmail Compose URL to force Gmail in a named tab
                                 gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${contact.email}`;
                             }

                             return (
                                <div key={contact.id} className={`group flex flex-col md:flex-row items-start md:items-center gap-4 p-4 rounded-lg border transition-all duration-200 ${contact.isDefault ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-200' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
                                    
                                    {/* Contact Info Fields */}
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">שם מלא</label>
                                            <input 
                                                value={contact.name} 
                                                onChange={e => handleContactChange(index, e)} 
                                                name="name" 
                                                className={`block w-full text-sm border-0 border-b-2 bg-transparent focus:ring-0 px-0 py-1 transition-colors ${contact.isDefault ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-primary'}`}
                                                placeholder="שם איש הקשר"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">תפקיד</label>
                                            <input 
                                                value={contact.role} 
                                                onChange={e => handleContactChange(index, e)} 
                                                name="role" 
                                                 className={`block w-full text-sm border-0 border-b-2 bg-transparent focus:ring-0 px-0 py-1 transition-colors ${contact.isDefault ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-primary'}`}
                                                placeholder="תפקיד"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">אימייל</label>
                                            <input 
                                                value={contact.email} 
                                                onChange={e => handleContactChange(index, e)} 
                                                name="email" 
                                                 className={`block w-full text-sm border-0 border-b-2 bg-transparent focus:ring-0 px-0 py-1 transition-colors ${contact.isDefault ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-primary'}`}
                                                placeholder="email@company.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">טלפון</label>
                                            <input 
                                                value={contact.phone} 
                                                onChange={e => handleContactChange(index, e)} 
                                                name="phone" 
                                                 className={`block w-full text-sm border-0 border-b-2 bg-transparent focus:ring-0 px-0 py-1 transition-colors ${contact.isDefault ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-primary'}`}
                                                placeholder="050-0000000"
                                            />
                                        </div>
                                    </div>

                                    {/* Actions & Communication */}
                                    <div className="flex items-center gap-2 md:border-r md:border-slate-200 md:pr-4 w-full md:w-auto justify-end md:justify-start">
                                        
                                        {/* Icons Row */}
                                        <div className="flex items-center gap-1">
                                            {whatsappUrl ? (
                                                 <a href={whatsappUrl} target="crm_whatsapp" title="וואטסאפ" className="p-1.5 rounded-full text-slate-400 hover:text-green-500 hover:bg-green-50 transition-all"><WhatsAppIcon className="h-4 w-4"/></a>
                                            ) : <span className="w-7"></span>}
                                            {gmailUrl ? (
                                                 <a href={gmailUrl} target="crm_email" title="Gmail" className="p-1.5 rounded-full text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all"><EmailIcon className="h-4 w-4"/></a>
                                            ) : <span className="w-7"></span>}
                                            {telUrl ? (
                                                 <a href={telUrl} title="חיוג" className="p-1.5 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all"><PhoneIcon className="h-4 w-4"/></a>
                                            ) : <span className="w-7"></span>}
                                        </div>

                                        <div className="w-px h-6 bg-slate-200 mx-2"></div>

                                        {/* Default Star Toggle */}
                                         <button
                                            type="button"
                                            onClick={() => {
                                                // Simulate event for handleContactChange
                                                const event = {
                                                    target: {
                                                        name: 'isDefault',
                                                        type: 'checkbox',
                                                        checked: !contact.isDefault
                                                    }
                                                } as any;
                                                handleContactChange(index, event);
                                            }}
                                            className={`p-1.5 rounded-full transition-all ${contact.isDefault ? 'text-amber-500 bg-amber-100' : 'text-slate-300 hover:text-amber-400 hover:bg-slate-100'}`}
                                            title={contact.isDefault ? "איש קשר ראשי" : "הגדר כראשי"}
                                        >
                                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                                            </svg>
                                        </button>

                                        {/* Delete Button - Separated */}
                                         <button 
                                            type="button"
                                            onClick={() => removeContact(contact.id)}
                                            className="p-1.5 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all ms-3"
                                            title="מחק איש קשר"
                                        >
                                            <DeleteIcon className="h-5 w-5"/>
                                        </button>

                                    </div>
                                </div>
                            )
                        })}
                        <button onClick={addContact} className="flex items-center justify-center w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-primary hover:border-primary hover:bg-slate-50 transition-colors">
                            <PlusIcon className="h-5 w-5 me-2" />
                            הוסף איש קשר חדש
                        </button>
                    </div>
                )}
                {activeTab === 'orders' && (
                    <div className="border rounded-xl overflow-hidden shadow-sm">
                        {customerOrdersLoading ? (
                            <div className="p-8 text-center text-slate-500">טוען היסטוריית הזמנות...</div>
                        ) : customerOrders.length > 0 ? (
                            <table className="min-w-full text-xs text-right">
                                <thead className="bg-slate-50 text-slate-500 font-bold border-b">
                                    <tr>
                                        <th className="px-4 py-3"># הזמנה</th>
                                        <th className="px-4 py-3">תיאור</th>
                                        <th className="px-4 py-3">תאריך פתיחה</th>
                                        <th className="px-4 py-3">תאריך אישור</th>
                                        <th className="px-4 py-3">סה"כ ברוטו</th>
                                        <th className="px-4 py-3">יתרה פתוחה</th>
                                        <th className="px-4 py-3">סטטוס ביצוע</th>
                                        <th className="px-4 py-3">איש קשר</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {customerOrders.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(o => {
                                        const { totalAmount, totalPaid } = calculateOrderTotals(o);
                                        const currentVat = o.vatRate ?? vatRate;
                                        const gross = totalAmount * (1 + currentVat / 100);
                                        const remaining = Math.max(0, gross - totalPaid);
                                        const orderStatusConfig = statusConfigs.find(c => c.label === o.orderStatus);
                                        const contact = editableCustomer.contacts.find(c => c.id === o.contactId);
                                        const isActiveDeal = orderStatusConfig?.isActiveDeal;
                                        
                                        return (
                                            <tr key={o.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-4 py-3 font-mono font-bold text-primary">
                                                    <button onClick={() => onNavigateToOrder(o.id)} className="hover:underline">
                                                        {o.orderNumber}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-700 max-w-xs truncate" title={o.description}>
                                                    {o.description}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">
                                                    {new Date(o.date).toLocaleDateString('he-IL')}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">
                                                    {o.dealStartDate ? new Date(o.dealStartDate).toLocaleDateString('he-IL') : <span className="text-[10px] text-slate-300 italic">טרם אושר</span>}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-800">
                                                    ₪{gross.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col">
                                                        <span className={`font-black ${isActiveDeal ? (remaining > 1 ? 'text-red-600' : 'text-green-600') : 'text-slate-400'}`}>
                                                            ₪{remaining.toLocaleString()}
                                                        </span>
                                                        {isActiveDeal ? (
                                                            remaining > 1 ? <span className="text-[9px] text-red-400 font-bold uppercase">לתשלום</span> : <span className="text-[9px] text-green-500 font-bold uppercase">שולם</span>
                                                        ) : (
                                                            remaining > 1 ? <span className="text-[9px] text-slate-400 font-bold uppercase">פוטנציאל</span> : null
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${orderStatusConfig?.color || 'bg-slate-100 text-slate-600'}`}>
                                                        {o.orderStatus}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-600">{contact?.name || '---'}</span>
                                                        <span className="text-[9px] text-slate-400">{contact?.phone}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div className="py-12 text-center text-slate-400 italic bg-white">לא נמצאו הזמנות עבור לקוח זה.</div>
                        )}
                    </div>
                )}
            </div>
             <div className="flex justify-between space-x-2 pt-4 space-x-reverse mt-4 border-t">
                {activeTab === 'details' && (
                    <button type="button" disabled title="מיזוג לקוחות בתוכנה מושבת כרגע. למזג: בצע מיזוג בחשבונית ירוקה ואז לחץ סנכרן מחשבונית ירוקה." className="px-4 py-2 bg-slate-100 text-slate-400 border border-slate-200 rounded-md cursor-not-allowed opacity-70 flex items-center gap-2" aria-disabled="true">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        מיזוג לקוחות
                    </button>
                )}
                <div className="flex space-x-2 space-x-reverse flex-1 justify-end">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                    <button type="button" onClick={() => onSave(editableCustomer)} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור שינויים</button>
                </div>
            </div>
        </div>
    )
};

const CustomersPage: React.FC<CustomersPageProps> = ({ customers, setCustomers, setCustomersLocal, orders, setOrders, addActivity, onNavigateToOrder, statusConfigs, vatRate }) => {
    const { trackViewStart, trackViewEnd } = useViewTracker();
    const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isCollectionCenterOpen, setIsCollectionCenterOpen] = useState(false);
    const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    
    // Duplicate Detection State
    const [duplicateFound, setDuplicateFound] = useState<Customer | null>(null);
    const [pendingNewCustomer, setPendingNewCustomer] = useState<{customer: Partial<Customer>, contact: Partial<Contact>} | null>(null);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [isSyncingFromGreenInvoice, setIsSyncingFromGreenInvoice] = useState(false);
    const [isSavingNewCustomer, setIsSavingNewCustomer] = useState(false);

    // Fetched customer orders (server source of truth for "היסטוריית הזמנות" – avoids stale global state)
    const [customerOrdersFetched, setCustomerOrdersFetched] = useState<Order[] | null>(null);
    const [customerOrdersFetchedForId, setCustomerOrdersFetchedForId] = useState<string | null>(null);
    const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [paginatedCustomers, setPaginatedCustomers] = useState<(Customer & { debt?: number })[]>([]);

    // Debounce search: update debouncedSearchTerm 350ms after user stops typing (reduces API calls)
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 350);
        return () => clearTimeout(t);
    }, [searchTerm]);

    // Load customers from API with pagination (silent = true: don't show loading, for background refresh)
    const refetchCustomers = async (silent: boolean = false) => {
        if (!silent) setLoading(true);
        try {
            const filters = { searchTerm: debouncedSearchTerm || undefined };
            const result = await mongoService.getCustomersPaginated(filters, currentPage, pageSize);
            setPaginatedCustomers(result.customers);
            setTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading customers:', error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // Load customers when debounced search term or pagination changes; if customers already in props, show first page immediately then refetch in background
    useEffect(() => {
        // Only show in-memory slice when we have no active search (avoid showing unfiltered slice when search is applied)
        if (customers.length > 0 && paginatedCustomers.length === 0 && !debouncedSearchTerm) {
            const start = (currentPage - 1) * pageSize;
            const slice = customers.slice(start, start + pageSize);
            setPaginatedCustomers(slice);
            setTotalCount(customers.length);
            setLoading(false);
            refetchCustomers(true);
        } else {
            refetchCustomers();
        }
    }, [debouncedSearchTerm, currentPage, pageSize]);

    // Reset to page 1 when search term changes (avoid empty list / wrong range when filtered results have fewer pages)
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm]);

    // Use paginated customers for display; dedupe by logical key as safety net (server already dedupes)
    const filteredCustomers = useMemo(() => {
        const byKey = new Map<string, (Customer & { debt?: number })[]>();
        for (const c of paginatedCustomers) {
            const key = customerLogicalKey(c);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key)!.push(c);
        }
        const out: (Customer & { debt?: number })[] = [];
        for (const group of byKey.values()) {
            if (group.length === 0) continue;
            const rep = group.find(c => c.greenInvoiceClientId) || group[0];
            const debt = group.reduce((s, c) => s + (c.debt ?? 0), 0);
            out.push({ ...rep, debt: Number(debt.toFixed(2)) });
        }
        return out.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    }, [paginatedCustomers]);

    const refetchCustomerOrders = React.useCallback(async () => {
        if (!viewingCustomer) {
            setCustomerOrdersFetched(null);
            setCustomerOrdersFetchedForId(null);
            return;
        }
        setCustomerOrdersLoading(true);
        try {
            const result = await mongoService.getOrdersPaginated(
                { customerFilter: [viewingCustomer.id], showCompletedOrders: true },
                1,
                1000
            );
            setCustomerOrdersFetched(result.orders || []);
            setCustomerOrdersFetchedForId(viewingCustomer.id);
        } catch (err) {
            console.error('Error fetching customer orders:', err);
            setCustomerOrdersFetched(null);
            setCustomerOrdersFetchedForId(null);
        } finally {
            setCustomerOrdersLoading(false);
        }
    }, [viewingCustomer?.id]);

    const handleViewCustomer = (customer: Customer) => {
        setViewingCustomer(customer);
        trackViewStart(`customer_${customer.id}`, 'customer', customer.id, customer.name);
        setIsDetailModalOpen(true);
    };

    const handleCloseDetailModal = () => {
        if (viewingCustomer) trackViewEnd(`customer_${viewingCustomer.id}`);
        setIsDetailModalOpen(false);
        setViewingCustomer(null);
    };

    const handleOpenCollectionCenter = (customer: Customer) => {
        setViewingCustomer(customer);
        setIsCollectionCenterOpen(true);
    };

    // Customer deletion is disabled - customers should not be deleted
    // const handleDeleteCustomer = (customerId: string) => {
    //     const customerName = customers.find(c => c.id === customerId)?.name;
    //     if(window.confirm(`האם אתה בטוח שברצונך למחוק את ${customerName}?`)) {
    //         setCustomers(prev => prev.filter(c => c.id !== customerId));
    //         addActivity(`לקוח נמחק: ${customerName}`);
    //     }
    // };

    const handleSaveNewCustomer = (customerData: Partial<Customer>, contactData: Partial<Contact>) => {
        // Search for existing duplicates before creating
        const duplicate = findDuplicateCustomer(customers, customerData.name || '', customerData.businessId, contactData.email, contactData.phone);
        
        if (duplicate) {
            setDuplicateFound(duplicate);
            setPendingNewCustomer({ customer: customerData, contact: contactData });
            return; // Don't save yet, show modal
        }

        performCreateCustomer(customerData, contactData);
    };

    const performCreateCustomer = async (customerData: Partial<Customer>, contactData: Partial<Contact>) => {
        setIsSavingNewCustomer(true);
        try {
            const newContact: Contact = {
                id: `cont_${Date.now()}`,
                name: contactData.name || '',
                email: contactData.email || '',
                phone: contactData.phone || '',
                role: contactData.role || 'איש קשר ראשי',
                isBillingContact: true,
                isDefault: true // Default to true for the first contact
            };

            const addrStreet = (customerData as any).addressStreet ?? '';
            const addrCity = (customerData as any).addressCity ?? '';
            const addrZip = (customerData as any).addressZip ?? '';
            const combinedAddress = [addrStreet, addrCity, addrZip].filter(Boolean).join(', ') || (customerData.address || '');
            const newCustomer: Customer = {
                id: `cust_${Date.now()}`,
                name: customerData.name || 'לקוח חדש',
                businessId: customerData.businessId || '',
                website: customerData.website || '',
                address: combinedAddress,
                addressStreet: addrStreet || undefined,
                addressCity: addrCity || undefined,
                addressZip: addrZip || undefined,
                category: customerData.category || '',
                notes: customerData.notes || '',
                isSpecial: !!customerData.isSpecial,
                contacts: [newContact],
                createdAt: new Date(),
                paymentMethod: customerData.paymentMethod || PaymentMethod.BANK_TRANSFER,
                paymentTerms: customerData.paymentTerms || 'תשלום מיידי',
            };
            
            // Save to MongoDB (server creates customer and returns immediately; Green Invoice sync runs in background)
            const savedCustomer = await mongoService.createCustomer(newCustomer);

            // Update global customers list
            setCustomers(prev => [...prev, savedCustomer]);
            // Show new customer in table immediately (optimistic) so UI feels instant
            setPaginatedCustomers(prev => [{ ...savedCustomer, debt: 0 } as Customer & { debt?: number }, ...prev]);
            setTotalCount(prev => prev + 1);
            addActivity(`לקוח חדש נוסף: ${savedCustomer.name}`, { entityType: 'customer', entityId: savedCustomer.id, action: 'create', metadata: { name: savedCustomer.name } });
            setIsNewCustomerModalOpen(false);
            setPendingNewCustomer(null);
            setDuplicateFound(null);
            // Refresh list in background to get server truth (debt, order) — don't block UI
            refetchCustomers(true);
        } catch (error: any) {
            console.error('Error creating customer:', error);
            const msg = error?.message || '';
            if (msg.includes('כבר קיים') || msg.includes('DUPLICATE')) {
                alert('לקוח עם אותו שם ו/או ח.פ כבר קיים במערכת. לא נוצר כפילות.');
                refetchCustomers(true);
            } else {
                alert('שגיאה בשמירת הלקוח. אנא נסה שוב.');
            }
        } finally {
            setIsSavingNewCustomer(false);
        }
    };

    const handleMergeWithExisting = async () => {
        if (!duplicateFound || !pendingNewCustomer) return;

        const oldCustomer = duplicateFound;
        const newData = pendingNewCustomer;

        const newContact: Contact = {
            id: `cont_merged_${Date.now()}`,
            name: newData.contact.name || '',
            email: newData.contact.email || '',
            phone: newData.contact.phone || '',
            role: newData.contact.role || 'איש קשר נוסף',
            isBillingContact: false,
            isDefault: false
        };

        const updatedOldCustomer: Customer = {
            ...oldCustomer,
            contacts: [...(oldCustomer.contacts || []), newContact],
            notes: (oldCustomer.notes || '') + (newData.customer.notes ? `\n[מיזוג]: ${newData.customer.notes}` : '')
        };

        try {
            await mongoService.updateCustomer(updatedOldCustomer);
            setCustomers(prev => prev.map(c => c.id === oldCustomer.id ? updatedOldCustomer : c));
            await refetchCustomers();
            addActivity(`לקוח מוזג לתוך כרטיס קיים: ${oldCustomer.name}`, { entityType: 'customer', entityId: oldCustomer.id, action: 'merge', metadata: { name: oldCustomer.name } });
            setDuplicateFound(null);
            setPendingNewCustomer(null);
            setIsNewCustomerModalOpen(false);
        } catch (err: any) {
            console.error('Merge with existing failed:', err);
            alert(err?.message || 'שמירת המיזוג נכשלה. נסה שוב.');
        }
    };

    // MANUAL MERGE HANDLER — persists on server (orders reassigned, victim deleted)
    const handleManualMerge = async (victimId: string) => {
        if (!viewingCustomer) return;
        const veteranId = viewingCustomer.id;
        const victim = customers.find(c => c.id === victimId);
        if (!victim) return;
        try {
            const updatedVeteran = await mongoService.mergeCustomers(veteranId, victimId);
            setCustomers(prev => prev.filter(c => c.id !== victimId).map(c => c.id === veteranId ? updatedVeteran : c));
            setOrders(prev => prev.map(o => o.customerId === victimId ? { ...o, customerId: veteranId } : o));
            await refetchCustomers();
            addActivity(`בוצע מיזוג ידני: ${victim.name} מוזג לתוך ${viewingCustomer.name}`, { entityType: 'customer', entityId: viewingCustomer.id, action: 'merge', metadata: { victimName: victim.name, targetName: viewingCustomer.name } });
            setViewingCustomer(updatedVeteran);
            setCustomerOrdersFetched(null);
            setCustomerOrdersFetchedForId(null);
            setIsMergeModalOpen(false);
        } catch (err: any) {
            console.error('Merge failed:', err);
            alert(err?.message || 'מיזוג נכשל. נסה שוב.');
        }
    };

    const handleSaveCustomerUpdate = async (updatedCustomer: Customer) => {
        const originalCustomer = customers.find(c => c.id === updatedCustomer.id);
        const combinedAddress = [updatedCustomer.addressStreet, updatedCustomer.addressCity, updatedCustomer.addressZip].filter(Boolean).join(', ') || updatedCustomer.address || '';
        const toSave: Customer = { ...updatedCustomer, address: combinedAddress };
        let response: Customer & { syncToGI?: 'ok' | 'skipped' | 'error'; syncToGIMessage?: string };
        try {
            response = await mongoService.updateCustomer(toSave);
        } catch (error) {
            console.error('Error saving customer:', error);
            alert('שגיאה בשמירת הלקוח. אנא נסה שוב.');
            return;
        }
        const saved = response as Customer;
        setCustomersLocal(prev => prev.map(c => c.id === saved.id ? saved : c));
        setPaginatedCustomers(prev => prev.map(c => c.id === saved.id ? { ...c, ...saved } : c));

        if (response.syncToGI === 'error' && response.syncToGIMessage) {
            alert(`הלקוח נשמר, אך סנכרון לחשבונית ירוקה נכשל:\n${response.syncToGIMessage}\n\nודא ש-GREENINVOICE_SYNC_ENABLED=true ושהלקוח מקושר לחשבונית ירוקה.`);
        }

        if (originalCustomer && saved.paymentTerms && originalCustomer.paymentTerms !== saved.paymentTerms) {
            setOrders(prevOrders => prevOrders.map(order => {
                if (order.customerId === saved.id) return { ...order, paymentTerms: saved.paymentTerms! };
                return order;
            }));
            addActivity(`לקוח עודכן: ${saved.name} (עודכנו תנאי תשלום ב-${orders.filter(o => o.customerId === saved.id).length} הזמנות)${response.syncToGI === 'ok' ? ' • סונכרן לחשבונית ירוקה' : ''}`, { entityType: 'customer', entityId: saved.id, action: 'update', metadata: { name: saved.name } });
        } else {
            addActivity(`לקוח עודכן: ${saved.name}${response.syncToGI === 'ok' ? ' • סונכרן לחשבונית ירוקה' : ''}`, { entityType: 'customer', entityId: saved.id, action: 'update', metadata: { name: saved.name } });
        }

        handleCloseDetailModal();
    };

    const handleSyncFromGreenInvoice = async () => {
        if (!confirm('האם אתה בטוח שברצונך לסנכרן לקוחות מחשבונית ירוקה? זה עלול ליצור לקוחות כפולים אם לא נזהרים.')) {
            return;
        }

        setIsSyncingFromGreenInvoice(true);
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/customers/sync-from-greeninvoice', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'שגיאה בסנכרון');
            }

            const results = await response.json();
            
            // Refetch customers to show updates
            await refetchCustomers();
            
            // Show results
            const merged = results.mergedFromOrphans?.length ?? 0;
            const unlinked = results.unlinkedOrphans?.length ?? 0;
            const message = `סנכרון הושלם:
- נוצרו: ${results.created.length} לקוחות חדשים
- עודכנו: ${results.updated.length} לקוחות קיימים
- דולגו: ${results.skipped?.length ?? 0} לקוחות
${merged > 0 ? `- מוזגו (לאחר הסרת לקוח ב-GI): ${merged}` : ''}
${unlinked > 0 ? `- נותקו מקישור ל-GI: ${unlinked}` : ''}
${results.errors?.length > 0 ? `\n- שגיאות: ${results.errors.length}` : ''}`;
            alert(message);
            addActivity(`בוצע סנכרון מ-חשבונית ירוקה: ${results.created.length} חדשים, ${results.updated.length} עודכנו${merged ? `, ${merged} מוזגו` : ''}`, { entityType: 'customer', action: 'sync', metadata: { created: results.created.length, updated: results.updated.length, mergedFromOrphans: merged } });
        } catch (error: any) {
            console.error('Error syncing from GreenInvoice:', error);
            alert(`שגיאה בסנכרון: ${error.message || 'שגיאה לא ידועה'}`);
        } finally {
            setIsSyncingFromGreenInvoice(false);
        }
    };

    // Prefer server-fetched orders for this customer (avoids stale global state after order customerId change)
    const customerOrders = useMemo(() => {
        if (!viewingCustomer) return [];
        if (customerOrdersFetched !== null && customerOrdersFetchedForId === viewingCustomer.id)
            return customerOrdersFetched;
        return orders.filter(o => o.customerId === viewingCustomer.id);
    }, [orders, viewingCustomer, customerOrdersFetched, customerOrdersFetchedForId]);

    // Fetch customer orders from server when opening customer detail (source of truth)
    useEffect(() => {
        if (!viewingCustomer) {
            setCustomerOrdersFetched(null);
            setCustomerOrdersFetchedForId(null);
            return;
        }
        refetchCustomerOrders();
    }, [viewingCustomer?.id, refetchCustomerOrders]);
    

    return (
        <div>
            <div className="flex justify-between items-center mb-6 gap-4">
                <div className="flex-grow">
                    <input
                        type="text"
                        placeholder="חיפוש לפי שם לקוח, ח.פ, איש קשר, טלפון או אימייל..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-primary focus:border-primary transition"
                        aria-label="חיפוש לקוחות"
                    />
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleSyncFromGreenInvoice} 
                        disabled={isSyncingFromGreenInvoice}
                        className="flex-shrink-0 flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="סנכרן לקוחות מחשבונית ירוקה"
                    >
                        {isSyncingFromGreenInvoice ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white me-2"></div>
                                מסנכרן...
                            </>
                        ) : (
                            <>
                                <ImportIcon className="h-5 w-5 me-2" />
                                סנכרן מחשבונית ירוקה
                            </>
                        )}
                    </button>
                    <button onClick={() => setIsNewCustomerModalOpen(true)} className="flex-shrink-0 flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        <PlusIcon className="h-5 w-5 me-2" />
                        הוסף לקוח
                    </button>
                </div>
            </div>
            {/* Mobile: customer cards */}
            <div className="md:hidden space-y-3 pb-4">
                {filteredCustomers.length === 0 && !loading && (
                    <div className="text-center py-8 text-slate-500 bg-white rounded-xl border border-slate-200 p-4">
                        <p className="font-semibold">לא נמצאו לקוחות</p>
                        <p className="text-sm mt-1">נסה חיפוש אחר או הוסף לקוח חדש.</p>
                    </div>
                )}
                {filteredCustomers.map(customer => {
                    const primaryContact = customer.contacts.find(c => c.isDefault) || customer.contacts.find(c => c.isBillingContact) || customer.contacts[0];
                    const customerDebt = (customer as Customer & { debt?: number }).debt || 0;
                    return (
                        <button
                            key={customer.id}
                            type="button"
                            onClick={() => handleViewCustomer(customer)}
                            className="w-full text-right bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors min-h-[44px]"
                        >
                            <div className="font-bold text-primary">{customer.name} {customer.isSpecial && '⭐'}</div>
                            <p className="text-sm text-slate-600 mt-0.5">{primaryContact?.name || '—'}</p>
                            <p className="text-xs text-slate-500 mt-1">{customer.category || '—'}</p>
                            {customerDebt !== 0 && (
                                <p className={`text-sm font-bold mt-2 ${customerDebt > 1 ? 'text-red-600' : 'text-green-600'}`}>
                                    חוב: ₪{customerDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            )}
                        </button>
                    );
                })}
            </div>
            <div className="hidden md:block bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-start">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">שם חברה</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">ח.פ / ת.ז</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">איש קשר ראשי</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">קטגוריה</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider text-center">חוב לקוח</th>
                            <th className="relative px-6 py-3"><span className="sr-only">פעולות</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {filteredCustomers.map(customer => {
                            // Logic to find primary contact: Default -> Billing -> First
                            const primaryContact = customer.contacts.find(c => c.isDefault) || customer.contacts.find(c => c.isBillingContact) || customer.contacts[0];
                            let whatsappUrl = '';
                            let telUrl = '';
                            let gmailUrl = '';

                            if (primaryContact) {
                                if (primaryContact.phone) {
                                    let cleanPhone = primaryContact.phone.replace(/[^0-9]/g, '');
                                    telUrl = `tel:${cleanPhone}`;
                                    if (cleanPhone.startsWith('0')) {
                                        cleanPhone = `972${cleanPhone.substring(1)}`;
                                    }
                                    whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}`;
                                }
                                if (primaryContact.email) {
                                    // Switch to explicit Gmail compose URL
                                    gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${primaryContact.email}`;
                                }
                            }

                            // Debt is already calculated on the server
                            const customerDebt = (customer as Customer & { debt?: number }).debt || 0;

                            return(
                                <tr key={customer.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-sm font-medium">
                                        <div>
                                            <button onClick={() => handleViewCustomer(customer)} className="text-primary hover:text-indigo-800 font-semibold">
                                                {customer.name} {customer.isSpecial && <span title="לקוח מיוחד">⭐</span>}
                                            </button>
                                            <CustomerSyncBadges customer={customer} compact />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{customer.businessId || '---'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        <div className="flex items-center gap-3">
                                            <span>{primaryContact?.name || '---'}</span>
                                            <div className="flex items-center gap-2">
                                                {whatsappUrl && <a href={whatsappUrl} target="crm_whatsapp" title={`שלח וואטסאפ ל-${primaryContact.phone}`} className="text-green-500 hover:text-green-700"><WhatsAppIcon className="h-5 w-5"/></a>}
                                                {gmailUrl && <a href={gmailUrl} target="crm_email" title={`שלח אימייל ל-${primaryContact.email}`} className="text-slate-500 hover:text-primary"><EmailIcon className="h-5 w-5"/></a>}
                                                {telUrl && <a href={telUrl} title={`התקשר ל-${primaryContact.phone}`} className="text-slate-500 hover:text-primary"><PhoneIcon className="h-5 w-5"/></a>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{customer.category || '---'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-center">
                                        <div className="flex flex-col items-center">
                                            <span className={customerDebt > 1 ? 'text-red-600' : 'text-green-600'}>
                                                ₪{customerDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </span>
                                            {customerDebt > 1 && (
                                                <button 
                                                    onClick={() => handleOpenCollectionCenter(customer)}
                                                    className="text-[10px] text-primary hover:underline font-bold mt-0.5"
                                                >
                                                    לגבייה מרוכזת
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                                        <div className="flex gap-2 justify-end">
                                            <button onClick={() => handleOpenCollectionCenter(customer)} className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all" title="מרכז גבייה">
                                                <CashIcon className="h-5 w-5"/>
                                            </button>
                                            <button onClick={() => handleViewCustomer(customer)} className="p-2 bg-indigo-50 text-primary hover:bg-primary hover:text-white rounded-lg transition-all" title="ערוך">
                                                <EditIcon className="h-5 w-5"/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                 {filteredCustomers.length === 0 && !loading && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="font-semibold text-lg">לא נמצאו לקוחות</p>
                        <p>נסה מונח חיפוש אחר או הוסף לקוח חדש.</p>
                    </div>
                )}
                
                {/* Pagination Controls */}
                {totalCount > 0 && (
                    <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200">
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-slate-600">
                                מציג {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} מתוך {totalCount} לקוחות
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
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1 || loading}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ראשון
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1 || loading}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                קודם
                            </button>
                            <span className="px-3 py-1 text-sm text-slate-600">
                                עמוד {currentPage} מתוך {Math.ceil(totalCount / pageSize)}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / pageSize), prev + 1))}
                                disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                הבא
                            </button>
                            <button
                                onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize))}
                                disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                אחרון
                            </button>
                        </div>
                    </div>
                )}
                
                {loading && (
                    <div className="mt-4 text-center text-slate-500 text-sm">טוען...</div>
                )}
            </div>
            
            {/* New Customer Modal */}
            {isNewCustomerModalOpen && (
                <Modal title="הוספת לקוח חדש" onClose={() => { setIsNewCustomerModalOpen(false); setDuplicateFound(null); }} size="2xl">
                    <NewCustomerForm onSave={handleSaveNewCustomer} onCancel={() => setIsNewCustomerModalOpen(false)} saving={isSavingNewCustomer} />
                </Modal>
            )}

            {/* Duplicate Found Confirmation Modal */}
            {duplicateFound && (
                <Modal title="נמצא לקוח קיים עם פרטים זהים" onClose={() => setDuplicateFound(null)} size="lg" zIndex={100}>
                    <div className="text-start space-y-4">
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
                            <div className="p-2 bg-amber-100 rounded-full text-amber-600 shrink-0">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <div>
                                <h4 className="font-bold text-amber-800">שים לב, הלקוח כבר קיים במערכת!</h4>
                                <p className="text-sm text-amber-700">נמצאה התאמה ללקוח: <strong>{duplicateFound.name}</strong></p>
                            </div>
                        </div>
                        
                        <p className="text-slate-600 text-sm">המערכת מזהה שמדובר באותו לקוח לפי שם, ח.פ, אימייל או טלפון. האם תרצה למזג את המידע החדש לתוך הלקוח הקיים?</p>
                        
                        <div className="bg-slate-50 p-3 rounded text-xs text-slate-500 border border-slate-200">
                            <strong>המיזוג יבצע:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>הוספת איש הקשר החדש לרשימת אנשי הקשר הקיימת.</li>
                                <li>שמירה על כל ההיסטוריה וההזמנות של הלקוח המקורי.</li>
                                <li>עדכון הערות הלקוח.</li>
                            </ul>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button 
                                onClick={() => performCreateCustomer(pendingNewCustomer!.customer, pendingNewCustomer!.contact)} 
                                className="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-md text-sm hover:bg-slate-50"
                            >
                                צור לקוח חדש בכל זאת
                            </button>
                            <button 
                                onClick={handleMergeWithExisting} 
                                className="px-6 py-2 bg-primary text-white rounded-md text-sm font-bold shadow-md hover:bg-indigo-700"
                            >
                                בצע מיזוג (מומלץ)
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

             {isDetailModalOpen && viewingCustomer && (
                <Modal title={`כרטיס לקוח: ${viewingCustomer.name}`} onClose={handleCloseDetailModal} size="5xl">
                    <CustomerDetailView 
                        customer={viewingCustomer} 
                        customerOrders={customerOrders}
                        customerOrdersLoading={customerOrdersLoading}
                        onSave={handleSaveCustomerUpdate}
                        onCancel={handleCloseDetailModal}
                        onNavigateToOrder={onNavigateToOrder}
                        onMergeClick={() => setIsMergeModalOpen(true)}
                        statusConfigs={statusConfigs}
                        vatRate={vatRate}
                    />
                </Modal>
            )}

            {isCollectionCenterOpen && viewingCustomer && (
                <CollectionCenterModal 
                    customer={viewingCustomer}
                    orders={orders}
                    setOrders={setOrders}
                    onClose={() => setIsCollectionCenterOpen(false)}
                    addActivity={addActivity}
                    statusConfigs={statusConfigs}
                    vatRate={vatRate}
                />
            )}

            {isMergeModalOpen && viewingCustomer && (
                <ManualMergeModal
                    targetCustomer={viewingCustomer}
                    allCustomers={customers}
                    onClose={() => setIsMergeModalOpen(false)}
                    onConfirm={handleManualMerge}
                />
            )}

        </div>
    );
};

export default CustomersPage;