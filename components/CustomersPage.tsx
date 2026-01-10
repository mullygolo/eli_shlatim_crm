import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Customer, Contact, Order, PaymentMethod, CustomerPayment, TimelineEvent, OrderStatusConfiguration, PaymentStatus } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, ImportIcon, WhatsAppIcon, EmailIcon, PhoneIcon, CashIcon } from './icons';
import Modal from './Modal';
import { CUSTOMER_CATEGORIES, PAYMENT_TERMS_OPTIONS } from '../constants';
import { calculateOrderTotals } from '../utils/calculations';
import * as mongoService from '../services/mongoService';

// Added missing interface definition for CustomersPageProps
interface CustomersPageProps {
    customers: Customer[];
    setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    addActivity: (description: string) => void;
    onNavigateToOrder: (orderId: string) => void;
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
}

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

const CollectionCenterModal: React.FC<{
    customer: Customer;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    onClose: () => void;
    addActivity: (description: string) => void;
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
}> = ({ customer, orders, setOrders, onClose, addActivity, statusConfigs, vatRate }) => {
    // 1. Get all orders for this customer and calculate their actual balance
    const allCustomerOrders = useMemo(() => {
        return orders
            .filter(o => {
                // Filter: Only ACTIVE deals count towards debt
                const config = statusConfigs.find(c => c.label === o.orderStatus);
                return o.customerId === customer.id && config?.isActiveDeal;
            })
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
    }, [orders, customer.id, statusConfigs, vatRate]);

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
        addActivity(`בוצע תשלום מרוכז עבור לקוח: ${customer.name} בסך ₪${allocatedTotal.toLocaleString()}`);
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

                {/* Right Side: Payment Form */}
                <div className="w-full md:w-80 space-y-4">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <h4 className="font-black text-slate-800 border-b pb-3 flex items-center gap-2">
                            <CashIcon className="w-5 h-5 text-emerald-600"/>
                            פרטי תקבול
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
                            className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black text-lg shadow-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        >
                            בצע גבייה מרוכזת
                        </button>
                    </div>
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
const NewCustomerForm: React.FC<{ onSave: (customer: Partial<Customer>, firstContact: Partial<Contact>) => void; onCancel: () => void; }> = ({ onSave, onCancel }) => {
    const [customerData, setCustomerData] = useState({ 
        name: '', 
        businessId: '',
        category: '',
        website: '',
        address: '',
        notes: '',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentTerms: 'שוטף 30',
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
        onSave(customerData, contactData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 text-start">
            {/* Section 1: Company Details */}
            <div>
                <h3 className="font-semibold text-lg text-slate-800 mb-3 border-b pb-1">פרטי החברה</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700">שם החברה <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={customerData.name} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
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
                        <label className="block text-sm font-medium text-slate-700">כתובת</label>
                        <input type="text" name="address" value={customerData.address} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
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
                        <input type="text" name="name" value={contactData.name} onChange={handleContactChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">תפקיד</label>
                        <input type="text" name="role" value={contactData.role} onChange={handleContactChange} placeholder="לדוג': מנכ''ל, מנהל רכש" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אימייל <span className="text-red-500">*</span></label>
                        <input type="email" name="email" value={contactData.email} onChange={handleContactChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
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
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמירה</button>
            </div>
        </form>
    );
};

// Full detailed view/edit component for a customer
interface CustomerDetailViewProps {
    customer: Customer;
    customerOrders: Order[];
    onSave: (customer: Customer) => void;
    onCancel: () => void;
    onNavigateToOrder: (orderId: string) => void;
    onMergeClick: () => void;
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
}

const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({ customer, customerOrders, onSave, onCancel, onNavigateToOrder, onMergeClick, statusConfigs, vatRate }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'contacts' | 'orders'>('details');
    const [editableCustomer, setEditableCustomer] = useState<Customer>(customer);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);

    useEffect(() => {
        setEditableCustomer(customer);
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
             <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-6 space-x-reverse px-1">
                    <button onClick={() => setActiveTab('details')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>פרטים</button>
                    <button onClick={() => setActiveTab('contacts')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'contacts' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>אנשי קשר</button>
                    <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'orders' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>היסטוריית הזמנות ({customerOrders.length})</button>
                </nav>
            </div>
            <div className="py-6">
                {activeTab === 'details' && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            <label className="block text-sm font-medium text-slate-700 mb-1">כתובת</label>
                            <input name="address" value={editableCustomer.address} onChange={handleCustomerChange} className="p-2 border rounded w-full"/>
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
                                value={editableCustomer.paymentTerms || 'שוטף 30'} 
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
                        {customerOrders.length > 0 ? (
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
                    <button type="button" onClick={onMergeClick} className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 flex items-center gap-2">
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

const CustomerImportModal: React.FC<{ onImport: (customers: Customer[]) => void; onCancel: () => void; }> = ({ onImport, onCancel }) => {
    const [pastedData, setPastedData] = useState('');
    const [errors, setErrors] = useState<string[]>([]);
    
    const handleImportClick = () => {
        const lines = pastedData.trim().split('\n');
        const newCustomers: Customer[] = [];
        const parsingErrors: string[] = [];

        if (pastedData.trim() === '') {
            setErrors(["לא נמצאו נתונים לייבוא. אנא הדבק מידע בתיבה."]);
            return;
        }

        lines.forEach((line, index) => {
            const columns = line.split('\t'); // Tab-separated for spreadsheet compatibility
            
            const [companyName, contactName, email, phone = '', category = ''] = columns.map(c => c.trim());

            if (!companyName || !contactName || !email) {
                parsingErrors.push(`שורה ${index + 1}: חסר שם חברה, שם איש קשר או אימייל.`);
                return;
            }

            const newContact: Contact = {
                id: `cont_import_${Date.now()}_${index}`,
                name: contactName,
                email: email,
                phone: phone,
                role: 'איש קשר ראשי',
                isBillingContact: true,
                isDefault: true
            };

            const newCustomer: Customer = {
                id: `cust_import_${Date.now()}_${index}`,
                name: companyName,
                website: '',
                address: '',
                category: category,
                notes: 'לקוח שיובא מהמערכת הישנה',
                isSpecial: false,
                contacts: [newContact],
                createdAt: new Date(),
                paymentMethod: PaymentMethod.BANK_TRANSFER,
                paymentTerms: 'שוטף 30',
            };
            newCustomers.push(newCustomer);
        });

        setErrors(parsingErrors);
        
        if (parsingErrors.length === 0 && newCustomers.length > 0) {
            onImport(newCustomers);
        }
    };

    return (
        <div className="space-y-4 text-start">
            <p className="text-sm text-slate-600">
                כדי לייבא לקוחות, העתק נתונים מטבלת ה-Excel או Google Sheets שלך והדבק אותם כאן.
                <br />
                ודא שהעמודות הן בסדר הבא:
                <strong className="block mt-1">שם חברה, שם איש קשר, אימייל, טלפון (אופציונלי), קטגוריה (אופציונלי)</strong>
            </p>
            <textarea
                value={pastedData}
                onChange={(e) => setPastedData(e.target.value)}
                rows={10}
                className="w-full p-2 border rounded font-mono text-sm border-slate-300 focus:border-primary focus:ring-primary"
                placeholder="הדבק כאן את נתוני הלקוחות שלך..."
                aria-label="אזור להדבקת נתוני לקוחות לייבוא"
            />
            {errors.length > 0 && (
                <div className="bg-red-50 p-3 rounded-md">
                    <h4 className="font-semibold text-red-700">שגיאות בנתונים:</h4>
                    <ul className="list-disc list-inside text-sm text-red-600">
                        {errors.map((error, i) => <li key={i}>{error}</li>)}
                    </ul>
                </div>
            )}
            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="button" onClick={handleImportClick} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">ייבא נתונים</button>
            </div>
        </div>
    );
};


const CustomersPage: React.FC<CustomersPageProps> = ({ customers, setCustomers, orders, setOrders, addActivity, onNavigateToOrder, statusConfigs, vatRate }) => {
    const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isCollectionCenterOpen, setIsCollectionCenterOpen] = useState(false);
    const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Duplicate Detection State
    const [duplicateFound, setDuplicateFound] = useState<Customer | null>(null);
    const [pendingNewCustomer, setPendingNewCustomer] = useState<{customer: Partial<Customer>, contact: Partial<Contact>} | null>(null);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

    const filteredCustomers = useMemo(() => {
        if (!searchTerm) {
            return customers;
        }
        const lowercasedTerm = searchTerm.toLowerCase();
        return customers.filter(customer => {
            const nameMatch = customer.name.toLowerCase().includes(lowercasedTerm);
            const hpMatch = customer.businessId?.toLowerCase().includes(lowercasedTerm);
            if (nameMatch || hpMatch) return true;

            return customer.contacts.some(contact => 
                contact.name.toLowerCase().includes(lowercasedTerm) ||
                contact.email.toLowerCase().includes(lowercasedTerm) ||
                contact.phone.toLowerCase().includes(lowercasedTerm)
            );
        });
    }, [customers, searchTerm]);

    const handleViewCustomer = (customer: Customer) => {
        setViewingCustomer(customer);
        setIsDetailModalOpen(true);
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

            const newCustomer: Customer = {
                id: `cust_${Date.now()}`,
                name: customerData.name || 'לקוח חדש',
                businessId: customerData.businessId || '',
                website: customerData.website || '',
                address: customerData.address || '',
                category: customerData.category || '',
                notes: customerData.notes || '',
                isSpecial: !!customerData.isSpecial,
                contacts: [newContact],
                createdAt: new Date(),
                paymentMethod: customerData.paymentMethod || PaymentMethod.BANK_TRANSFER,
                paymentTerms: customerData.paymentTerms || 'שוטף 30',
            };
            
            // Save to MongoDB
            const savedCustomer = await mongoService.createCustomer(newCustomer);
            
            // Update local state with the saved customer (which may have MongoDB _id)
            setCustomers(prev => [...prev, savedCustomer]);
            addActivity(`לקוח חדש נוסף: ${savedCustomer.name}`);
            setIsNewCustomerModalOpen(false);
            setPendingNewCustomer(null);
            setDuplicateFound(null);
        } catch (error) {
            console.error('Error creating customer:', error);
            alert('שגיאה בשמירת הלקוח. אנא נסה שוב.');
        }
    };

    const handleMergeWithExisting = () => {
        if (!duplicateFound || !pendingNewCustomer) return;

        const oldCustomer = duplicateFound;
        const newData = pendingNewCustomer;

        // Merge Contacts: Add the new contact to the old list
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
            contacts: [...oldCustomer.contacts, newContact],
            notes: oldCustomer.notes + (newData.customer.notes ? `\n[מיזוג]: ${newData.customer.notes}` : '')
        };

        setCustomers(prev => prev.map(c => c.id === oldCustomer.id ? updatedOldCustomer : c));
        addActivity(`לקוח מוזג לתוך כרטיס קיים: ${oldCustomer.name}`);
        
        setDuplicateFound(null);
        setPendingNewCustomer(null);
        setIsNewCustomerModalOpen(false);
    };

    // MANUAL MERGE HANDLER
    const handleManualMerge = (victimId: string) => {
        if (!viewingCustomer) return;
        const veteranId = viewingCustomer.id;
        const victim = customers.find(c => c.id === victimId);
        
        if (!victim) return;

        // 1. Move Contacts
        const transferredContacts = victim.contacts.map(c => ({
            ...c,
            isDefault: false, // Ensure no conflict with default contact of veteran
            id: `cont_merged_${c.id}` // Regenerate ID just in case
        }));

        // 2. Update Orders
        setOrders(prev => prev.map(o => {
            if (o.customerId === victimId) {
                return { ...o, customerId: veteranId };
            }
            return o;
        }));

        // 3. Update Veteran Customer
        const updatedVeteran: Customer = {
            ...viewingCustomer,
            contacts: [...viewingCustomer.contacts, ...transferredContacts],
            notes: viewingCustomer.notes + `\n[מיזוג ידני ${new Date().toLocaleDateString('he-IL')}]: מוזג מ-${victim.name} (ח.פ ${victim.businessId || '-'})`
        };

        setCustomers(prev => prev
            .filter(c => c.id !== victimId) // Delete Victim
            .map(c => c.id === veteranId ? updatedVeteran : c) // Update Veteran
        );

        addActivity(`בוצע מיזוג ידני: ${victim.name} מוזג לתוך ${viewingCustomer.name}`);
        setViewingCustomer(updatedVeteran); // Update view
        setIsMergeModalOpen(false);
    };

    const handleSaveCustomerUpdate = (updatedCustomer: Customer) => {
        // Find previous state to check for changes
        const originalCustomer = customers.find(c => c.id === updatedCustomer.id);
        
        setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
        
        // Automatic cascading update for Payment Terms
        if (originalCustomer && updatedCustomer.paymentTerms && originalCustomer.paymentTerms !== updatedCustomer.paymentTerms) {
            setOrders(prevOrders => prevOrders.map(order => {
                if (order.customerId === updatedCustomer.id) {
                     return { ...order, paymentTerms: updatedCustomer.paymentTerms! };
                }
                return order;
            }));
            addActivity(`לקוח עודכן: ${updatedCustomer.name} (עודכנו תנאי תשלום ב-${orders.filter(o => o.customerId === updatedCustomer.id).length} הזמנות)`);
        } else {
            addActivity(`לקוח עודכן: ${updatedCustomer.name}`);
        }

        setIsDetailModalOpen(false);
        setViewingCustomer(null);
    };

    const handleImportCustomers = async (newCustomers: Customer[]) => {
        try {
            // Save all customers to MongoDB
            const savedCustomers = await Promise.all(
                newCustomers.map(customer => mongoService.createCustomer(customer))
            );
            
            // Update local state with saved customers
            setCustomers(prev => [...prev, ...savedCustomers]);
            addActivity(`${savedCustomers.length} לקוחות יובאו בהצלחה`);
            setIsImportModalOpen(false);
        } catch (error) {
            console.error('Error importing customers:', error);
            alert('שגיאה בייבוא הלקוחות. חלק מהלקוחות אולי לא נשמרו.');
            setIsImportModalOpen(false);
        }
    };

    const customerOrders = useMemo(() => {
        if (!viewingCustomer) return [];
        return orders.filter(o => o.customerId === viewingCustomer.id);
    }, [orders, viewingCustomer]);
    

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
                    <button onClick={() => setIsImportModalOpen(true)} className="flex-shrink-0 flex items-center px-4 py-2 bg-secondary text-white rounded-lg hover:bg-emerald-600 transition-colors">
                        <ImportIcon className="h-5 w-5 me-2" />
                        ייבוא לקוחות
                    </button>
                    <button onClick={() => setIsNewCustomerModalOpen(true)} className="flex-shrink-0 flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        <PlusIcon className="h-5 w-5 me-2" />
                        הוסף לקוח
                    </button>
                </div>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
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

                            // Calculate specific debt for this customer
                            // ONLY include active deals based on configuration
                            const customerDebt = orders
                                .filter(o => {
                                    const config = statusConfigs.find(c => c.label === o.orderStatus);
                                    return o.customerId === customer.id && config?.isActiveDeal;
                                })
                                .reduce((sum, o) => {
                                    const { totalAmount, totalPaid } = calculateOrderTotals(o);
                                    const currentOrderVat = o.vatRate ?? vatRate;
                                    const gross = totalAmount * (1 + currentOrderVat / 100);
                                    return sum + Math.max(0, gross - totalPaid);
                                }, 0);

                            return(
                                <tr key={customer.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button onClick={() => handleViewCustomer(customer)} className="text-primary hover:text-indigo-800 font-semibold">
                                            {customer.name} {customer.isSpecial && <span title="לקוח מיוחד">⭐</span>}
                                        </button>
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
                 {filteredCustomers.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="font-semibold text-lg">לא נמצאו לקוחות</p>
                        <p>נסה מונח חיפוש אחר או הוסף לקוח חדש.</p>
                    </div>
                )}
            </div>
            
            {/* New Customer Modal */}
            {isNewCustomerModalOpen && (
                <Modal title="הוספת לקוח חדש" onClose={() => { setIsNewCustomerModalOpen(false); setDuplicateFound(null); }} size="2xl">
                    <NewCustomerForm onSave={handleSaveNewCustomer} onCancel={() => setIsNewCustomerModalOpen(false)} />
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
                <Modal title={`כרטיס לקוח: ${viewingCustomer.name}`} onClose={() => setIsDetailModalOpen(false)} size="5xl">
                    <CustomerDetailView 
                        customer={viewingCustomer} 
                        customerOrders={customerOrders}
                        onSave={handleSaveCustomerUpdate}
                        onCancel={() => setIsDetailModalOpen(false)}
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

             {isImportModalOpen && (
                <Modal title="ייבוא לקוחות" onClose={() => setIsImportModalOpen(false)} size="2xl">
                    <CustomerImportModal onImport={handleImportCustomers} onCancel={() => setIsImportModalOpen(false)} />
                </Modal>
            )}
        </div>
    );
};

export default CustomersPage;