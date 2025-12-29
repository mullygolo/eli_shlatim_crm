
import React, { useState } from 'react';
import { Transaction, Customer, Deal, TransactionType, Supplier } from '../types';
import { PlusIcon, EditIcon, DeleteIcon } from './icons';
import Modal from './Modal';

interface TransactionsPageProps {
    transactions: Transaction[];
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
    customers: Customer[];
    deals: Deal[];
    suppliers: Supplier[];
    addActivity: (description: string) => void;
}

const TransactionForm: React.FC<{ 
    transaction: Transaction | null; 
    customers: Customer[];
    deals: Deal[];
    suppliers: Supplier[];
    onSave: (transaction: Transaction) => void; 
    onCancel: () => void; 
}> = ({ transaction, customers, deals, suppliers, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        description: transaction?.description || '',
        amount: transaction?.amount || 0,
        type: transaction?.type || TransactionType.INCOME,
        date: transaction?.date ? transaction.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        linkedTo: transaction?.dealId ? 'deal' : transaction?.customerId ? 'customer' : transaction?.supplierId ? 'supplier' : 'none',
        linkId: transaction?.dealId || transaction?.customerId || transaction?.supplierId || '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalTransaction: Transaction = {
            id: transaction?.id || `trans_${Date.now()}`,
            description: formData.description,
            amount: parseFloat(String(formData.amount)),
            type: formData.type as TransactionType,
            date: new Date(formData.date),
            dealId: formData.linkedTo === 'deal' ? formData.linkId : undefined,
            customerId: formData.linkedTo === 'customer' ? formData.linkId : undefined,
            supplierId: formData.linkedTo === 'supplier' ? formData.linkId : undefined,
        };
        onSave(finalTransaction);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-start">
            <div>
                <label className="block text-sm font-medium text-slate-700">תיאור</label>
                <input type="text" name="description" value={formData.description} onChange={handleChange} required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">סכום ($)</label>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">סוג</label>
                    <select name="type" value={formData.type} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                        <option value={TransactionType.INCOME}>הכנסה</option>
                        <option value={TransactionType.EXPENSE}>הוצאה</option>
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">תאריך</label>
                <input type="date" name="date" value={formData.date} onChange={handleChange} required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">קשר ל</label>
                     <select name="linkedTo" value={formData.linkedTo} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                        <option value="none">ללא</option>
                        <option value="deal">עסקה</option>
                        <option value="customer">לקוח</option>
                        {formData.type === TransactionType.EXPENSE && <option value="supplier">ספק</option>}
                    </select>
                </div>
                {formData.linkedTo !== 'none' && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700">
                            {formData.linkedTo === 'deal' ? 'בחר עסקה' : formData.linkedTo === 'customer' ? 'בחר לקוח' : 'בחר ספק'}
                        </label>
                        <select name="linkId" value={formData.linkId} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                            {formData.linkedTo === 'deal' ? (
                                deals.map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                            ) : formData.linkedTo === 'customer' ? (
                                customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                            ) : (
                                suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                            )}
                        </select>
                    </div>
                )}
            </div>
            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור תנועה</button>
            </div>
        </form>
    );
};


const TransactionsPage: React.FC<TransactionsPageProps> = ({ transactions, setTransactions, customers, deals, suppliers, addActivity }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

    const handleAddTransaction = () => {
        setEditingTransaction(null);
        setIsModalOpen(true);
    };

    const handleEditTransaction = (transaction: Transaction) => {
        setEditingTransaction(transaction);
        setIsModalOpen(true);
    };

    const handleDeleteTransaction = (transactionId: string) => {
        const desc = transactions.find(t => t.id === transactionId)?.description;
        if (window.confirm(`האם אתה בטוח שברצונך למחוק את תנועה "${desc}"?`)) {
            setTransactions(prev => prev.filter(t => t.id !== transactionId));
            addActivity(`תנועה נמחקה: ${desc}`);
        }
    };
    
    const handleSaveTransaction = (transaction: Transaction) => {
        if (editingTransaction) {
            setTransactions(prev => prev.map(t => t.id === transaction.id ? transaction : t));
            addActivity(`תנועה עודכנה: ${transaction.description}`);
        } else {
            setTransactions(prev => [...prev, transaction]);
            addActivity(`תנועה חדשה נוספה: ${transaction.description}`);
        }
        setIsModalOpen(false);
        setEditingTransaction(null);
    };

    const getLinkName = (transaction: Transaction) => {
        if (transaction.dealId) {
            return `עסקה: ${deals.find(d => d.id === transaction.dealId)?.name || 'לא זמין'}`;
        }
        if (transaction.customerId) {
            return `לקוח: ${customers.find(c => c.id === transaction.customerId)?.name || 'לא זמין'}`;
        }
        if (transaction.supplierId) {
            return `ספק: ${suppliers.find(s => s.id === transaction.supplierId)?.name || 'לא זמין'}`;
        }
        return 'ללא';
    };

    return (
        <div>
            <div className="flex justify-end mb-6">
                <button onClick={handleAddTransaction} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                    <PlusIcon className="h-5 w-5 me-2" />
                    הוסף תנועה
                </button>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-start">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תאריך</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תיאור</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סוג</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סכום</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">מקושר ל</th>
                            <th className="relative px-6 py-3"><span className="sr-only">פעולות</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {transactions.sort((a,b) => b.date.getTime() - a.date.getTime()).map(transaction => (
                            <tr key={transaction.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{transaction.date.toLocaleDateString('he-IL')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{transaction.description}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${transaction.type === TransactionType.INCOME ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {transaction.type}
                                    </span>
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${transaction.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>
                                    ${transaction.amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{getLinkName(transaction)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium space-x-2 space-x-reverse">
                                    <button onClick={() => handleEditTransaction(transaction)} className="text-primary hover:text-indigo-900 p-1"><EditIcon className="h-5 w-5"/></button>
                                    <button onClick={() => handleDeleteTransaction(transaction.id)} className="text-red-600 hover:text-red-900 p-1"><DeleteIcon className="h-5 w-5"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && (
                <Modal title={editingTransaction ? "עריכת תנועה" : "הוספת תנועה"} onClose={() => setIsModalOpen(false)}>
                    <TransactionForm 
                        transaction={editingTransaction} 
                        customers={customers} 
                        deals={deals} 
                        suppliers={suppliers}
                        onSave={handleSaveTransaction} 
                        onCancel={() => setIsModalOpen(false)} 
                    />
                </Modal>
            )}
        </div>
    );
};

export default TransactionsPage;
