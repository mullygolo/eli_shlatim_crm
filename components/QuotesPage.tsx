


import React, { useState, useMemo } from 'react';
// FIX: Removed 'Order' from the import as it's not needed and was causing confusion.
import { Quote, Customer, QuoteStatus, LineItem, LineItemUnit } from '../types';
import { QUOTE_STATUSES_ORDERED } from '../constants';
import { PlusIcon, EditIcon, DeleteIcon } from './icons';
import Modal from './Modal';
import { calculateOrderTotals } from '../utils/calculations'; // Can be reused for quotes

interface QuotesPageProps {
    quotes: Quote[];
    setQuotes: React.Dispatch<React.SetStateAction<Quote[]>>;
    customers: Customer[];
    addActivity: (description: string) => void;
}

const QuoteForm: React.FC<{
    quote: Quote | null;
    customers: Customer[];
    onSave: (quote: Quote) => void;
    onCancel: () => void;
}> = ({ quote, customers, onSave, onCancel }) => {
    const [formData, setFormData] = useState<Omit<Quote, 'id' | 'quoteNumber'>>(
        quote 
        ? { ...quote }
        : {
            date: new Date(),
            customerId: customers.length > 0 ? customers[0].id : '',
            status: QuoteStatus.DRAFT,
            lineItems: [{ id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, cost: 0, unitType: LineItemUnit.UNIT }],
        }
    );
     const [dateString, setDateString] = useState(formData.date.toISOString().split('T')[0]);

    // FIX: Removed incorrect type casting to 'Order'. The `calculateOrderTotals` function is now generic.
    const totals = useMemo(() => calculateOrderTotals(formData), [formData.lineItems]);

    const handleMasterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'date') {
            setDateString(value);
        }
    };
    
    const handleLineItemChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const newLineItems = [...formData.lineItems];
        (newLineItems[index] as any)[name] = name === 'description' ? value : parseFloat(value) || 0;
        setFormData(prev => ({ ...prev, lineItems: newLineItems }));
    };

    const addLineItem = () => {
        setFormData(prev => ({ ...prev, lineItems: [...prev.lineItems, { id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, cost: 0, unitType: LineItemUnit.UNIT }]}));
    };

    const removeLineItem = (index: number) => {
        const item = formData.lineItems[index];
        const itemDescription = item?.description || 'פריט';
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את הפריט "${itemDescription}"?`)) {
            return;
        }
        setFormData(prev => ({ ...prev, lineItems: prev.lineItems.filter((_, i) => i !== index)}));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            ...formData,
            id: quote?.id || `qt_${Date.now()}`,
            quoteNumber: quote?.quoteNumber || `QT-${Date.now().toString().slice(-6)}`,
            date: new Date(dateString),
        });
    };
    
    return (
        <form onSubmit={handleSubmit} className="space-y-6 text-start">
            {/* Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                     <label className="block text-sm font-medium text-slate-700">לקוח</label>
                    <select name="customerId" value={formData.customerId} onChange={handleMasterChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required>
                        <option value="">בחר לקוח</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">תאריך</label>
                    <input type="date" name="date" value={dateString} onChange={handleMasterChange} required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700">סטטוס</label>
                    <select name="status" value={formData.status} onChange={handleMasterChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                        {QUOTE_STATUSES_ORDERED.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>
            
            {/* Line Items */}
            <div>
                <h3 className="text-lg font-medium text-slate-800 mb-2">פריטים</h3>
                <div className="space-y-2">
                    {formData.lineItems.map((item, index) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                            <input type="text" placeholder="תיאור" name="description" value={item.description} onChange={e => handleLineItemChange(index, e)} className="col-span-7 mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            <input type="number" placeholder="כמות" name="quantity" value={item.quantity} onChange={e => handleLineItemChange(index, e)} className="col-span-2 mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            <input type="number" placeholder="מחיר" name="unitPrice" value={item.unitPrice} onChange={e => handleLineItemChange(index, e)} className="col-span-2 mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            <button type="button" onClick={() => removeLineItem(index)} className="col-span-1 text-red-500 hover:text-red-700"><DeleteIcon className="h-5 w-5"/></button>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={addLineItem} className="mt-2 text-sm text-primary hover:text-indigo-800">+ הוסף פריט</button>
            </div>

            {/* Financial Summary */}
             <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-md">
                 <div className="text-center">
                     <h4 className="text-sm text-slate-500">סה"כ הצעה</h4>
                     <p className="text-lg font-bold text-green-600">{totals.totalAmount.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                 </div>
                 <div className="text-center">
                     <h4 className="text-sm text-slate-500">רווח צפוי</h4>
                     <p className="text-lg font-bold text-slate-800">{totals.profit.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                 </div>
             </div>

            {/* Actions */}
            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור הצעה</button>
            </div>
        </form>
    );
};

const QuotesPage: React.FC<QuotesPageProps> = ({ quotes, setQuotes, customers, addActivity }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingQuote, setEditingQuote] = useState<Quote | null>(null);

    const handleAddQuote = () => {
        setEditingQuote(null);
        setIsModalOpen(true);
    };

    const handleEditQuote = (quote: Quote) => {
        setEditingQuote(quote);
        setIsModalOpen(true);
    };

    const handleDeleteQuote = (quoteId: string) => {
        const quoteNumber = quotes.find(q => q.id === quoteId)?.quoteNumber;
        if (window.confirm(`האם אתה בטוח שברצונך למחוק את הצעה "${quoteNumber}"?`)) {
            setQuotes(prev => prev.filter(q => q.id !== quoteId));
            addActivity(`הצעת מחיר נמחקה: ${quoteNumber}`);
        }
    };
    
    const handleSaveQuote = (quote: Quote) => {
        if (editingQuote) {
            setQuotes(prev => prev.map(q => q.id === quote.id ? quote : q));
            addActivity(`הצעת מחיר עודכנה: ${quote.quoteNumber}`);
        } else {
            setQuotes(prev => [quote, ...prev]);
            addActivity(`הצעת מחיר חדשה נוספה: ${quote.quoteNumber}`);
        }
        setIsModalOpen(false);
        setEditingQuote(null);
    };

    const getCustomerName = (customerId: string) => {
        return customers.find(c => c.id === customerId)?.name || 'לא זמין';
    };

    const getStatusBadge = (status: QuoteStatus) => {
        switch (status) {
            case QuoteStatus.DRAFT: return 'bg-gray-100 text-gray-800';
            case QuoteStatus.SENT: return 'bg-blue-100 text-blue-800';
            case QuoteStatus.APPROVED: return 'bg-green-100 text-green-800';
            case QuoteStatus.REJECTED: return 'bg-red-100 text-red-800';
            default: return 'bg-slate-100 text-slate-800';
        }
    };
    
    return (
        <div>
            <div className="flex justify-end mb-6">
                <button onClick={handleAddQuote} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                    <PlusIcon className="h-5 w-5 me-2" />
                    הוסף הצעת מחיר
                </button>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-start">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider"># הצעה</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">לקוח</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סכום</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תאריך</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סטטוס</th>
                            <th className="relative px-4 py-3"><span className="sr-only">פעולות</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {quotes.sort((a,b) => b.date.getTime() - a.date.getTime()).map(quote => {
                            // FIX: Removed incorrect type casting to 'Order'. The `calculateOrderTotals` function is now generic.
                            const { totalAmount } = calculateOrderTotals(quote);
                            return (
                                <tr key={quote.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">{quote.quoteNumber}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{getCustomerName(quote.customerId)}</td>
                                    <td className='px-4 py-4 whitespace-nowrap text-sm font-semibold text-green-600'>
                                        {totalAmount.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">{quote.date.toLocaleDateString('he-IL')}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(quote.status)}`}>
                                            {quote.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-left text-sm font-medium space-x-2 space-x-reverse">
                                        <button onClick={() => handleEditQuote(quote)} className="text-primary hover:text-indigo-900 p-1"><EditIcon className="h-5 w-5"/></button>
                                        <button onClick={() => handleDeleteQuote(quote.id)} className="text-red-600 hover:text-red-900 p-1"><DeleteIcon className="h-5 w-5"/></button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            {isModalOpen && (
                <Modal 
                    title={editingQuote ? `עריכת הצעה ${editingQuote.quoteNumber}` : "הוספת הצעה חדשה"} 
                    onClose={() => setIsModalOpen(false)}
                    size="3xl"
                >
                    <QuoteForm 
                        quote={editingQuote}
                        customers={customers}
                        onSave={handleSaveQuote} 
                        onCancel={() => setIsModalOpen(false)} 
                    />
                </Modal>
            )}
        </div>
    );
};

export default QuotesPage;
