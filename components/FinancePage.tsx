

import React, { useState, useMemo, useEffect } from 'react';
import { FixedExpense, VariableExpense, Loan, EquityInvestment, Debt, PaymentMethod, DebtPayment } from '../types';
import { PlusIcon, DeleteIcon, BankIcon, TrendingUpIcon, EditIcon, LogIcon } from './icons';
import Modal from './Modal';

interface FinancePageProps {
    fixedExpenses: FixedExpense[];
    setFixedExpenses: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
    variableExpenses: VariableExpense[];
    setVariableExpenses: React.Dispatch<React.SetStateAction<VariableExpense[]>>;
    loans: Loan[];
    setLoans: React.Dispatch<React.SetStateAction<Loan[]>>;
    debts: Debt[];
    setDebts: React.Dispatch<React.SetStateAction<Debt[]>>;
    equity: EquityInvestment[];
    setEquity: React.Dispatch<React.SetStateAction<EquityInvestment[]>>;
    addActivity: (description: string) => void;
    vatRate: number;
}

// Internal type for Audit Log
interface AuditLogEntry {
    id: string;
    timestamp: string; // ISO string
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    investorName: string;
    description: string;
    amountSnapshot: number;
    changes?: string[]; // Array of specific changes strings
    user: string;
}

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            active ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
        }`}
    >
        {label}
    </button>
);

const DebtPaymentModal: React.FC<{ 
    debt: Debt; 
    onSavePayment: (debtId: string, payment: DebtPayment) => void; 
    onClose: () => void; 
}> = ({ debt, onSavePayment, onClose }) => {
    const [amount, setAmount] = useState<number>(0);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [note, setNote] = useState<string>('');

    const paidSoFar = (debt.payments || []).reduce((sum, p) => sum + p.amount, 0);
    const remaining = debt.amount - paidSoFar;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (amount <= 0) {
            alert("אנא הזן סכום חיובי");
            return;
        }
        if (amount > remaining + 1) { // small buffer for floating point
             if (!window.confirm("הסכום גבוה מהיתרה לתשלום. האם להמשיך?")) return;
        }
        
        const newPayment: DebtPayment = {
            id: `dp_${Date.now()}`,
            amount,
            date: new Date(date),
            note
        };
        onSavePayment(debt.id, newPayment);
        setAmount(0);
        setNote('');
    };

    return (
        <div className="space-y-6">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 font-medium">סכום חוב מקורי:</span>
                    <span className="font-bold text-lg">₪{debt.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                    <span className="text-green-600 font-medium">שולם עד כה:</span>
                    <span className="font-bold text-green-600">₪{paidSoFar.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-2">
                    <span className="text-red-600 font-bold">יתרה לתשלום:</span>
                    <span className="font-bold text-red-600 text-xl">₪{remaining.toLocaleString()}</span>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-white shadow-sm space-y-4">
                <h4 className="font-bold text-slate-800">רישום החזר חדש</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">סכום החזר</label>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={e => setAmount(Number(e.target.value))} 
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" 
                            required 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">תאריך</label>
                        <input 
                            type="date" 
                            value={date} 
                            onChange={e => setDate(e.target.value)} 
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" 
                            required 
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700">הערה</label>
                        <input 
                            type="text" 
                            value={note} 
                            onChange={e => setNote(e.target.value)} 
                            placeholder="לדוג': העברה בנקאית מס' 123"
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" 
                        />
                    </div>
                </div>
                <div className="flex justify-end">
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-indigo-700 text-sm font-bold">
                        בצע תשלום
                    </button>
                </div>
            </form>

            <div>
                <h4 className="font-bold text-slate-800 mb-2">היסטוריית תשלומים</h4>
                {(!debt.payments || debt.payments.length === 0) ? (
                    <p className="text-slate-500 text-sm bg-slate-50 p-3 rounded">אין תשלומים רשומים לחוב זה.</p>
                ) : (
                    <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full text-sm text-right divide-y divide-slate-100">
                            <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                    <th className="px-3 py-2">תאריך</th>
                                    <th className="px-3 py-2">סכום</th>
                                    <th className="px-3 py-2">הערה</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {[...debt.payments].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                                    <tr key={p.id}>
                                        <td className="px-3 py-2">{new Date(p.date).toLocaleDateString('he-IL')}</td>
                                        <td className="px-3 py-2 font-bold text-green-600">₪{p.amount.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-slate-500">{p.note || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            <div className="flex justify-end pt-4 border-t border-slate-100">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300">סגור</button>
            </div>
        </div>
    );
};

const FinancePage: React.FC<FinancePageProps> = ({ 
    fixedExpenses, setFixedExpenses, 
    variableExpenses, setVariableExpenses,
    loans, setLoans,
    debts, setDebts,
    equity, setEquity,
    addActivity,
    vatRate
}) => {
    const [activeTab, setActiveTab] = useState<'FIXED' | 'VARIABLE' | 'LOANS' | 'DEBTS' | 'EQUITY'>('FIXED');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedDebtForPayment, setSelectedDebtForPayment] = useState<Debt | null>(null);
    
    // Audit Log State
    const [equityLogs, setEquityLogs] = useState<AuditLogEntry[]>(() => {
        const saved = localStorage.getItem('equity_audit_logs');
        return saved ? JSON.parse(saved) : [];
    });

    // Save logs to local storage whenever they change
    useEffect(() => {
        localStorage.setItem('equity_audit_logs', JSON.stringify(equityLogs));
    }, [equityLogs]);

    // Variable Expenses Filter
    const [variableMonthFilter, setVariableMonthFilter] = useState<string>(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // State for Forms
    const [fixedForm, setFixedForm] = useState<Partial<FixedExpense>>({});
    const [variableForm, setVariableForm] = useState<Partial<VariableExpense>>({});
    const [loanForm, setLoanForm] = useState<Partial<Loan>>({});
    const [debtForm, setDebtForm] = useState<Partial<Debt>>({});
    const [equityForm, setEquityForm] = useState<Partial<EquityInvestment>>({});

    // Helper for Transaction List expansion
    const [expandedInvestors, setExpandedInvestors] = useState<Set<string>>(new Set());

    const toggleInvestorExpansion = (investorName: string) => {
        setExpandedInvestors(prev => {
            const newSet = new Set(prev);
            if (newSet.has(investorName)) {
                newSet.delete(investorName);
            } else {
                newSet.add(investorName);
            }
            return newSet;
        });
    };

    // --- Stats Calculation ---
    const totalFixedMonthly = fixedExpenses
        .filter(e => {
            if (!e.isActive) return false;
            if (e.endDate && new Date(e.endDate) < new Date()) return false; // Ended service
            return true;
        })
        .reduce((sum, e) => sum + e.monthlyAmount, 0);

    // Calculate Variable Expenses for Current Month Only (includes variable expenses AND debt repayments made this month)
    const totalVariableCurrentMonth = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const expensesSum = variableExpenses
            .filter(e => {
                const d = new Date(e.date);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            })
            .reduce((sum, e) => sum + e.amount, 0);

        const debtPaymentsSum = debts.reduce((sum, debt) => {
            if (!debt.payments) return sum;
            return sum + debt.payments
                .filter(p => {
                    const d = new Date(p.date);
                    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                })
                .reduce((pSum, p) => pSum + p.amount, 0);
        }, 0);

        return expensesSum + debtPaymentsSum;
    }, [variableExpenses, debts]);

    const totalLoanBalance = loans.reduce((sum, l) => {
        const totalToPay = l.monthlyPayment * l.durationMonths;
        const alreadyPaid = l.monthlyPayment * l.paymentsMade;
        return sum + (totalToPay - alreadyPaid);
    }, 0);
    
    // Total debts now reflects remaining balance
    const totalDebts = debts.reduce((sum, d) => {
        const paid = (d.payments || []).reduce((acc, p) => acc + p.amount, 0);
        return sum + Math.max(0, d.amount - paid);
    }, 0);

    const equityByInvestor = useMemo(() => {
        const groups: Record<string, { 
            name: string, 
            type: string, 
            totalInvested: number, 
            totalWithdrawn: number, 
            transactions: EquityInvestment[] 
        }> = {};

        equity.forEach(item => {
            if (!groups[item.investorName]) {
                groups[item.investorName] = {
                    name: item.investorName,
                    type: item.type,
                    totalInvested: 0,
                    totalWithdrawn: 0,
                    transactions: []
                };
            }
            
            // Use transactionType to classify
            if (item.transactionType === 'WITHDRAWAL') {
                groups[item.investorName].totalWithdrawn += item.amount;
            } else {
                // Default to Deposit if undefined (migration)
                groups[item.investorName].totalInvested += item.amount;
            }
            
            groups[item.investorName].transactions.push(item);
        });
        return Object.values(groups);
    }, [equity]);

    const totalEquityBalance = equityByInvestor.reduce((sum, inv) => sum + (inv.totalInvested - inv.totalWithdrawn), 0);

    // --- Filter Fixed Expenses ---
    const activeFixedServices = fixedExpenses.filter(e => !e.endDate || new Date(e.endDate) >= new Date());
    const endedFixedServices = fixedExpenses.filter(e => e.endDate && new Date(e.endDate) < new Date());

    // --- Filter Variable Expenses ---
    const filteredVariableExpenses = useMemo(() => {
        if (variableMonthFilter === 'all') {
            return variableExpenses.sort((a,b) => b.date.getTime() - a.date.getTime());
        }
        const [year, month] = variableMonthFilter.split('-').map(Number);
        return variableExpenses
            .filter(e => {
                const d = new Date(e.date);
                return d.getFullYear() === year && (d.getMonth() + 1) === month;
            })
            .sort((a,b) => b.date.getTime() - a.date.getTime());
    }, [variableExpenses, variableMonthFilter]);

    // --- Handlers ---

    const handleDelete = (type: string, id: string) => {
        if (!window.confirm('האם אתה בטוח?')) return;
        
        if (type === 'EQUITY') {
            const deletedItem = equity.find(e => e.id === id);
            if (deletedItem) {
                const log: AuditLogEntry = {
                    id: `log_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    action: 'DELETE',
                    investorName: deletedItem.investorName,
                    description: `נמחקה רשומה: ${deletedItem.description || 'ללא תיאור'}`,
                    amountSnapshot: deletedItem.amount,
                    changes: [`נמחק ${deletedItem.transactionType === 'DEPOSIT' ? 'הפקדה' : 'משיכה'} בסך ₪${deletedItem.amount.toLocaleString()}`],
                    user: 'מנהל מערכת'
                };
                setEquityLogs(prev => [log, ...prev]);
            }
            setEquity(prev => prev.filter(e => e.id !== id));
        } else if (type === 'FIXED') setFixedExpenses(prev => prev.filter(e => e.id !== id));
        else if (type === 'VARIABLE') setVariableExpenses(prev => prev.filter(e => e.id !== id));
        else if (type === 'LOANS') setLoans(prev => prev.filter(e => e.id !== id));
        else if (type === 'DEBTS') setDebts(prev => prev.filter(e => e.id !== id));
        
        addActivity(`פריט נמחק מדוח כספי`);
    };

    const handleAdd = (type: string) => {
        setEditingId(null);
        if (type === 'FIXED') {
            setFixedForm({ name: '', monthlyAmount: 0, paymentDay: 1, category: '', isActive: true, startDate: new Date(), paymentMethod: PaymentMethod.CREDIT_CARD, paymentDetails: '', includesVat: true });
        } else if (type === 'VARIABLE') {
            setVariableForm({ name: '', amount: 0, date: new Date(), category: '', includesVat: true });
        } else if (type === 'LOANS') {
            setLoanForm({ lenderName: '', principalAmount: 0, interestRate: 0, monthlyPayment: 0, durationMonths: 12, paymentsMade: 0, startDate: new Date() });
        } else if (type === 'DEBTS') {
            setDebtForm({ name: '', amount: 0, dueDate: new Date(), description: '', payments: [] });
        } else if (type === 'EQUITY') {
            setEquityForm({ investorName: '', amount: 0, type: 'הון בעלים', date: new Date(), transactionType: 'DEPOSIT' });
        }
        setIsModalOpen(true);
    };

    const handleEditFixed = (expense: FixedExpense) => {
        setEditingId(expense.id);
        setFixedForm({
            ...expense,
            startDate: expense.startDate ? new Date(expense.startDate) : new Date(),
            endDate: expense.endDate ? new Date(expense.endDate) : undefined,
        });
        setIsModalOpen(true);
    };

    const handleEditVariable = (expense: VariableExpense) => {
        setEditingId(expense.id);
        setVariableForm({
            ...expense,
            date: new Date(expense.date),
        });
        setIsModalOpen(true);
    };

    const handleEditEquity = (item: EquityInvestment) => {
        setEditingId(item.id);
        setEquityForm({
            ...item,
            date: new Date(item.date)
        });
        setIsModalOpen(true);
    };

    const generateEquityDiff = (oldItem: EquityInvestment, newItem: EquityInvestment): string[] => {
        const changes: string[] = [];
        if (oldItem.amount !== newItem.amount) {
            changes.push(`סכום שונה מ-₪${oldItem.amount.toLocaleString()} ל-₪${newItem.amount.toLocaleString()}`);
        }
        if (oldItem.transactionType !== newItem.transactionType) {
            const typeMap: any = { 'DEPOSIT': 'הפקדה', 'WITHDRAWAL': 'משיכה' };
            changes.push(`סוג פעולה שונה מ-${typeMap[oldItem.transactionType]} ל-${typeMap[newItem.transactionType]}`);
        }
        if (new Date(oldItem.date).getTime() !== new Date(newItem.date).getTime()) {
            changes.push(`תאריך שונה מ-${new Date(oldItem.date).toLocaleDateString('he-IL')} ל-${new Date(newItem.date).toLocaleDateString('he-IL')}`);
        }
        if (oldItem.description !== newItem.description) {
            changes.push(`תיאור שונה מ-"${oldItem.description || ''}" ל-"${newItem.description || ''}"`);
        }
        if (oldItem.investorName !== newItem.investorName) {
            changes.push(`שם משקיע שונה מ-${oldItem.investorName} ל-${newItem.investorName}`);
        }
        return changes;
    };

    const handleSave = () => {
        if (activeTab === 'FIXED') {
            const newItem = { ...fixedForm, id: editingId || `fe_${Date.now()}` } as FixedExpense;
            if (editingId) {
                setFixedExpenses(prev => prev.map(item => item.id === editingId ? newItem : item));
            } else {
                setFixedExpenses([...fixedExpenses, newItem]);
            }
        } else if (activeTab === 'VARIABLE') {
            const newItem = { ...variableForm, id: editingId || `ve_${Date.now()}`, date: new Date(variableForm.date || new Date()) } as VariableExpense;
            if (editingId) {
                setVariableExpenses(prev => prev.map(item => item.id === editingId ? newItem : item));
            } else {
                setVariableExpenses([...variableExpenses, newItem]);
            }
        } else if (activeTab === 'LOANS') {
            const newItem = { ...loanForm, id: `ln_${Date.now()}`, startDate: new Date(loanForm.startDate || new Date()) } as Loan;
            setLoans([...loans, newItem]);
        } else if (activeTab === 'DEBTS') {
            const newItem = { ...debtForm, id: `db_${Date.now()}`, dueDate: new Date(debtForm.dueDate || new Date()), payments: [] } as Debt;
            setDebts([...debts, newItem]);
        } else if (activeTab === 'EQUITY') {
            // VALIDATION
            if (!equityForm.investorName || equityForm.investorName.trim() === '') {
                alert('אנא הזן שם משקיע/שותף (שדה חובה)');
                return;
            }
            if (!equityForm.amount || Number(equityForm.amount) <= 0) {
                alert('אנא הזן סכום חיובי (שדה חובה)');
                return;
            }

            const newItem = { ...equityForm, id: editingId || `eq_${Date.now()}`, date: new Date(equityForm.date || new Date()) } as EquityInvestment;
            
            // --- AUDIT LOG LOGIC START ---
            let logEntry: AuditLogEntry | null = null;
            if (editingId) {
                const oldItem = equity.find(e => e.id === editingId);
                if (oldItem) {
                    const changes = generateEquityDiff(oldItem, newItem);
                    if (changes.length > 0) {
                        logEntry = {
                            id: `log_${Date.now()}`,
                            timestamp: new Date().toISOString(),
                            action: 'UPDATE',
                            investorName: newItem.investorName,
                            description: `עדכון רשומה: ${newItem.description || oldItem.description}`,
                            amountSnapshot: newItem.amount,
                            changes: changes,
                            user: 'מנהל מערכת'
                        };
                    }
                }
                setEquity(prev => prev.map(item => item.id === editingId ? newItem : item));
            } else {
                logEntry = {
                    id: `log_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    action: 'CREATE',
                    investorName: newItem.investorName,
                    description: `יצירה חדשה: ${newItem.description || 'השקעה ראשונית'}`,
                    amountSnapshot: newItem.amount,
                    changes: [`נוספה ${newItem.transactionType === 'DEPOSIT' ? 'הפקדה' : 'משיכה'} חדשה בסך ₪${newItem.amount.toLocaleString()}`],
                    user: 'מנהל מערכת'
                };
                setEquity([...equity, newItem]);
            }

            if (logEntry) {
                setEquityLogs(prev => [logEntry!, ...prev]);
            }
            // --- AUDIT LOG LOGIC END ---
        }
        addActivity(editingId ? `עודכן פריט בדוח: ${activeTab}` : `נוסף פריט חדש לדוח: ${activeTab}`);
        setIsModalOpen(false);
    };

    const openPaymentModal = (debt: Debt) => {
        setSelectedDebtForPayment(debt);
        setIsPaymentModalOpen(true);
    };

    const handleSaveDebtPayment = (debtId: string, payment: DebtPayment) => {
        setDebts(prev => prev.map(d => {
            if (d.id === debtId) {
                const updatedPayments = [...(d.payments || []), payment];
                const paidTotal = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
                return { 
                    ...d, 
                    payments: updatedPayments,
                    isPaid: paidTotal >= d.amount
                };
            }
            return d;
        }));
        
        // Update selected debt reference to reflect changes immediately in modal if needed
        const updatedDebt = debts.find(d => d.id === debtId);
        if (updatedDebt) {
             const updatedPayments = [...(updatedDebt.payments || []), payment];
             setSelectedDebtForPayment({ ...updatedDebt, payments: updatedPayments });
        }
        
        addActivity(`בוצע החזר חוב בסך ₪${payment.amount.toLocaleString()}`);
    };

    return (
        <div className="space-y-6">
            {/* Top Stats Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-blue-500">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">הוצאות קבועות (חודשי)</h3>
                    <p className="text-2xl font-bold text-slate-800">₪{totalFixedMonthly.toLocaleString()}</p>
                    <p className="text-xs text-slate-400 mt-1">צפי שנתי: ₪{(totalFixedMonthly * 12).toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-orange-500">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">הוצאות משתנות (החודש)</h3>
                    <p className="text-2xl font-bold text-slate-800">₪{totalVariableCurrentMonth.toLocaleString()}</p>
                    <p className="text-xs text-slate-400 mt-1">כולל החזרי חוב</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-red-500">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">יתרת הלוואות</h3>
                    <p className="text-2xl font-bold text-red-600">₪{totalLoanBalance.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-purple-500">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">חובות שוטפים (יתרה)</h3>
                    <p className="text-2xl font-bold text-purple-600">₪{totalDebts.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-green-500">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">הון עצמי והשקעות (יתרה)</h3>
                    <p className="text-2xl font-bold text-green-600">₪{totalEquityBalance.toLocaleString()}</p>
                    <p className="text-xs text-slate-400 mt-1">נטו (השקעות פחות משיכות)</p>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
                <div className="flex border-b border-slate-200 px-4 overflow-x-auto">
                    <TabButton label="הוצאות קבועות" active={activeTab === 'FIXED'} onClick={() => setActiveTab('FIXED')} />
                    <TabButton label="הוצאות משתנות" active={activeTab === 'VARIABLE'} onClick={() => setActiveTab('VARIABLE')} />
                    <TabButton label="הלוואות והתחייבויות" active={activeTab === 'LOANS'} onClick={() => setActiveTab('LOANS')} />
                    <TabButton label="חובות" active={activeTab === 'DEBTS'} onClick={() => setActiveTab('DEBTS')} />
                    <TabButton label="הון עצמי והשקעות" active={activeTab === 'EQUITY'} onClick={() => setActiveTab('EQUITY')} />
                </div>

                <div className="p-6 min-h-[400px]">
                    
                    {/* --- FIXED EXPENSES TAB --- */}
                    {activeTab === 'FIXED' && (
                        <div>
                            {/* ... existing code ... */}
                            <div className="flex justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-700">ניהול הוצאות קבועות ושוטפות</h3>
                                <button onClick={() => handleAdd('FIXED')} className="flex items-center px-3 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 text-sm font-bold"><PlusIcon className="w-4 h-4 me-1"/> הוסף הוצאה</button>
                            </div>
                            
                            <div className="space-y-8">
                                {/* Active Services Table */}
                                <div>
                                    <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 border-b pb-1">שירותים פעילים (חיוב חודשי)</h4>
                                    <table className="min-w-full text-sm text-right">
                                        <thead className="bg-slate-50 text-slate-500 font-medium">
                                            <tr>
                                                <th className="px-4 py-2">שם ההוצאה</th>
                                                <th className="px-4 py-2">קטגוריה</th>
                                                <th className="px-4 py-2">יום חיוב</th>
                                                <th className="px-4 py-2">התחלת שירות</th>
                                                <th className="px-4 py-2">אמצעי תשלום</th>
                                                <th className="px-4 py-2">סכום (כולל מע"מ)</th>
                                                <th className="px-4 py-2">לפני מע"מ</th>
                                                <th className="px-4 py-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {activeFixedServices.map(item => {
                                                const netAmount = item.includesVat ? item.monthlyAmount / (1 + vatRate / 100) : item.monthlyAmount;
                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-50">
                                                        <td className="px-4 py-3 font-medium">
                                                            {item.name}
                                                            {item.description && <div className="text-xs text-slate-400 font-normal">{item.description}</div>}
                                                        </td>
                                                        <td className="px-4 py-3"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{item.category}</span></td>
                                                        <td className="px-4 py-3">{item.paymentDay} לחודש</td>
                                                        <td className="px-4 py-3 text-slate-500">{new Date(item.startDate).toLocaleDateString('he-IL')}</td>
                                                        <td className="px-4 py-3 text-slate-600 text-xs">
                                                            <div className="font-bold">{item.paymentMethod}</div>
                                                            {item.paymentDetails && <div>{item.paymentDetails}</div>}
                                                        </td>
                                                        <td className="px-4 py-3 font-bold text-slate-800">
                                                            ₪{item.monthlyAmount.toLocaleString()}
                                                            {!item.includesVat && <span className="text-xs font-normal text-slate-400 block">(ללא מע"מ)</span>}
                                                        </td>
                                                        <td className="px-4 py-3 font-bold text-blue-600">
                                                            ₪{netAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </td>
                                                        <td className="px-4 py-3 flex gap-2 justify-end">
                                                            <button onClick={() => handleEditFixed(item)} className="text-blue-400 hover:text-blue-600"><EditIcon className="w-4 h-4"/></button>
                                                            <button onClick={() => handleDelete('FIXED', item.id)} className="text-red-400 hover:text-red-600"><DeleteIcon className="w-4 h-4"/></button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {activeFixedServices.length === 0 && <tr><td colSpan={8} className="text-center py-4 text-slate-400">אין שירותים פעילים כרגע.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>

                                {/* History / Ended Services Table */}
                                {endedFixedServices.length > 0 && (
                                    <div className="opacity-75 grayscale-[50%]">
                                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 border-b pb-1">היסטוריית שירותים (הסתיים)</h4>
                                        <table className="min-w-full text-sm text-right bg-slate-50/50 rounded-lg">
                                            <thead className="text-slate-400 font-medium">
                                                <tr>
                                                    <th className="px-4 py-2">שם ההוצאה</th>
                                                    <th className="px-4 py-2">תקופת שירות</th>
                                                    <th className="px-4 py-2">סיום התקשרות</th>
                                                    <th className="px-4 py-2">סכום שהיה</th>
                                                    <th className="px-4 py-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-slate-500">
                                                {endedFixedServices.map(item => (
                                                    <tr key={item.id} className="hover:bg-slate-100">
                                                        <td className="px-4 py-3">{item.name}</td>
                                                        <td className="px-4 py-3 text-xs">
                                                            {new Date(item.startDate).toLocaleDateString('he-IL')} - {item.endDate ? new Date(item.endDate).toLocaleDateString('he-IL') : '?'}
                                                        </td>
                                                        <td className="px-4 py-3 text-xs font-bold text-red-400">
                                                            הסתיים
                                                        </td>
                                                        <td className="px-4 py-3">₪{item.monthlyAmount.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-end">
                                                            <button onClick={() => handleEditFixed(item)} className="text-blue-300 hover:text-blue-500 px-2 text-xs">פרטים/חידוש</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- VARIABLE EXPENSES TAB --- */}
                    {activeTab === 'VARIABLE' && (
                        <div>
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-700 mb-2">פירוט הוצאות משתנות</h3>
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm text-slate-500">סינון לפי חודש:</label>
                                        <input 
                                            type="month" 
                                            value={variableMonthFilter} 
                                            onChange={e => setVariableMonthFilter(e.target.value)}
                                            className="text-sm border p-1.5 rounded border-slate-300"
                                        />
                                        <button 
                                            onClick={() => setVariableMonthFilter('all')} 
                                            className={`text-xs px-2 py-1.5 rounded ${variableMonthFilter === 'all' ? 'bg-slate-200 font-bold' : 'bg-slate-100 text-slate-600'}`}
                                        >
                                            הכל
                                        </button>
                                    </div>
                                </div>
                                <button onClick={() => handleAdd('VARIABLE')} className="flex items-center px-3 py-2 bg-orange-50 text-orange-700 rounded hover:bg-orange-100 text-sm font-bold"><PlusIcon className="w-4 h-4 me-1"/> הוסף הוצאה</button>
                            </div>
                            <table className="min-w-full text-sm text-right">
                                <thead className="bg-slate-50 text-slate-500 font-medium">
                                    <tr>
                                        <th className="px-4 py-2">תאריך</th>
                                        <th className="px-4 py-2">שם ההוצאה</th>
                                        <th className="px-4 py-2">קטגוריה</th>
                                        <th className="px-4 py-2">תיאור</th>
                                        <th className="px-4 py-2 font-bold">סכום (כולל מע"מ)</th>
                                        <th className="px-4 py-2">לפני מע"מ</th>
                                        <th className="px-4 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredVariableExpenses.map(item => (
                                        <tr key={item.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-slate-500">{new Date(item.date).toLocaleDateString('he-IL')}</td>
                                            <td className="px-4 py-3 font-medium">{item.name}</td>
                                            <td className="px-4 py-3"><span className="bg-orange-50 text-orange-700 px-2 py-1 rounded text-xs">{item.category}</span></td>
                                            <td className="px-4 py-3 text-slate-500">{item.description}</td>
                                            <td className="px-4 py-3 font-bold text-slate-800">
                                                ₪{item.amount.toLocaleString()}
                                                {!item.includesVat && <span className="text-xs font-normal text-slate-400 block">(ללא מע"מ)</span>}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-blue-600">
                                                ₪{(item.includesVat ? item.amount / (1 + vatRate / 100) : item.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </td>
                                            <td className="px-4 py-3 flex gap-2 justify-end">
                                                <button onClick={() => handleEditVariable(item)} className="text-blue-400 hover:text-blue-600"><EditIcon className="w-4 h-4"/></button>
                                                <button onClick={() => handleDelete('VARIABLE', item.id)} className="text-red-400 hover:text-red-600"><DeleteIcon className="w-4 h-4"/></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredVariableExpenses.length === 0 && (
                                        <tr><td colSpan={7} className="text-center py-6 text-slate-400">לא נמצאו הוצאות בחודש זה.</td></tr>
                                    )}
                                </tbody>
                                {filteredVariableExpenses.length > 0 && (
                                    <tfoot className="bg-slate-100 border-t border-slate-200 font-bold text-slate-700">
                                        <tr>
                                            <td colSpan={4} className="px-4 py-3 text-left">סה"כ</td>
                                            <td className="px-4 py-3 text-slate-900">₪{filteredVariableExpenses.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-blue-600">
                                                ₪{filteredVariableExpenses.reduce((acc, curr) => acc + (curr.includesVat ? curr.amount / (1 + vatRate / 100) : curr.amount), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}

                    {/* --- LOANS TAB --- */}
                    {activeTab === 'LOANS' && (
                        <div>
                            <div className="flex justify-between mb-6">
                                <h3 className="text-lg font-bold text-slate-700">ניהול הלוואות בנקאיות / קרנות</h3>
                                <button onClick={() => handleAdd('LOANS')} className="flex items-center px-3 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100 text-sm font-bold"><PlusIcon className="w-4 h-4 me-1"/> הוסף הלוואה</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {loans.map(loan => {
                                    const totalToPay = loan.monthlyPayment * loan.durationMonths;
                                    const amountPaid = loan.monthlyPayment * loan.paymentsMade;
                                    const remaining = totalToPay - amountPaid;
                                    const progress = (amountPaid / totalToPay) * 100;
                                    const monthsLeft = loan.durationMonths - loan.paymentsMade;

                                    return (
                                        <div key={loan.id} className="border rounded-xl p-5 shadow-sm hover:shadow-md transition bg-white relative overflow-hidden">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-red-50 rounded-lg text-red-600"><BankIcon className="w-6 h-6"/></div>
                                                    <div>
                                                        <h4 className="font-bold text-lg text-slate-800">{loan.lenderName}</h4>
                                                        <p className="text-xs text-slate-500">נלקחה ב: {new Date(loan.startDate).toLocaleDateString('he-IL')}</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDelete('LOANS', loan.id)} className="text-slate-300 hover:text-red-500"><DeleteIcon className="w-4 h-4"/></button>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                                <div>
                                                    <span className="text-slate-500 block text-xs">קרן מקורית</span>
                                                    <span className="font-bold">₪{loan.principalAmount.toLocaleString()}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block text-xs">החזר חודשי</span>
                                                    <span className="font-bold">₪{loan.monthlyPayment.toLocaleString()}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block text-xs">ריבית</span>
                                                    <span className="font-bold">{loan.interestRate}%</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block text-xs">נותרו תשלומים</span>
                                                    <span className="font-bold text-orange-600">{monthsLeft} חודשים</span>
                                                </div>
                                            </div>

                                            <div className="mb-2">
                                                <div className="flex justify-between text-xs mb-1 font-medium">
                                                    <span className="text-green-600">שולם: ₪{amountPaid.toLocaleString()}</span>
                                                    <span className="text-red-600">יתרה: ₪{remaining.toLocaleString()}</span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-2.5">
                                                    <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* --- DEBTS TAB --- */}
                    {activeTab === 'DEBTS' && (
                        <div>
                            <div className="flex justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-700">חובות שוטפים / אחרים</h3>
                                <button onClick={() => handleAdd('DEBTS')} className="flex items-center px-3 py-2 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 text-sm font-bold"><PlusIcon className="w-4 h-4 me-1"/> הוסף חוב</button>
                            </div>
                            <div className="bg-purple-50/50 p-4 rounded-lg mb-4 text-sm text-purple-900">
                                כאן ניתן לנהל חובות שאינם הלוואות בנקאיות מסודרות, כגון: חובות ארנונה, הלוואות מחברים/משפחה, צ'קים שחזרו, וכו'.
                                <strong> תשלומים שבוצעו בחודש הנוכחי יתווספו אוטומטית לסיכום ההוצאות המשתנות.</strong>
                            </div>
                            <table className="min-w-full text-sm text-right">
                                <thead className="bg-slate-50 text-slate-500 font-medium">
                                    <tr>
                                        <th className="px-4 py-2">תאריך יעד</th>
                                        <th className="px-4 py-2">שם החוב / נושה</th>
                                        <th className="px-4 py-2">תיאור</th>
                                        <th className="px-4 py-2 font-bold">סכום מקורי</th>
                                        <th className="px-4 py-2">שולם</th>
                                        <th className="px-4 py-2 font-bold text-red-600">יתרה</th>
                                        <th className="px-4 py-2">סטטוס</th>
                                        <th className="px-4 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {debts.map(item => {
                                        const paid = (item.payments || []).reduce((acc, p) => acc + p.amount, 0);
                                        const remaining = item.amount - paid;
                                        const progress = item.amount > 0 ? (paid / item.amount) * 100 : 0;
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-500">{new Date(item.dueDate).toLocaleDateString('he-IL')}</td>
                                                <td className="px-4 py-3 font-medium">{item.name}</td>
                                                <td className="px-4 py-3 text-slate-500">{item.description}</td>
                                                <td className="px-4 py-3 text-slate-800">₪{item.amount.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-green-600">₪{paid.toLocaleString()}</td>
                                                <td className="px-4 py-3 font-bold text-red-600">
                                                    ₪{remaining.toLocaleString()}
                                                    <div className="w-20 bg-slate-200 rounded-full h-1.5 mt-1">
                                                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, progress)}%` }}></div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {remaining <= 0 ? (
                                                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">שולם במלואו</span>
                                                    ) : (
                                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">פתוח</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 flex gap-2 justify-end items-center">
                                                     <button 
                                                        onClick={() => openPaymentModal(item)}
                                                        className="text-white bg-primary hover:bg-indigo-700 px-2 py-1 rounded text-xs transition-colors"
                                                    >
                                                        נהל תשלומים
                                                    </button>
                                                    <button onClick={() => handleDelete('DEBTS', item.id)} className="text-red-400 hover:text-red-600"><DeleteIcon className="w-4 h-4"/></button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* --- EQUITY TAB --- */}
                    {activeTab === 'EQUITY' && (
                        <div>
                            <div className="flex justify-between mb-6">
                                <h3 className="text-lg font-bold text-slate-700">לוח בקרה - שותפים ומשקיעים</h3>
                                <button onClick={() => handleAdd('EQUITY')} className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-md text-sm font-bold"><PlusIcon className="w-4 h-4 me-1"/> הוסף תנועה חדשה</button>
                            </div>
                            
                            {/* Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
                                {equityByInvestor.map((investor, index) => {
                                    const balance = investor.totalInvested - investor.totalWithdrawn;
                                    const returnPercentage = investor.totalInvested > 0 ? (investor.totalWithdrawn / investor.totalInvested) * 100 : 0;
                                    const isExpanded = expandedInvestors.has(investor.name);
                                    
                                    return (
                                        <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
                                            {/* Card Header */}
                                            <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-bold text-lg text-slate-800">{investor.name}</h4>
                                                    <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">{investor.type}</span>
                                                </div>
                                                <div className="p-2 bg-green-50 text-green-600 rounded-full">
                                                    <TrendingUpIcon className="w-5 h-5" />
                                                </div>
                                            </div>

                                            {/* Main Stats */}
                                            <div className="p-5 flex-grow">
                                                <div className="mb-6 text-center">
                                                    <span className="text-sm text-slate-500 block mb-1">יתרת השקעה (חוב לבעלים)</span>
                                                    <span className={`text-3xl font-bold ${balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                                                        ₪{balance.toLocaleString()}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                                    <div className="bg-green-50 p-3 rounded-lg text-center">
                                                        <span className="block text-green-800 font-bold text-lg">₪{investor.totalInvested.toLocaleString()}</span>
                                                        <span className="text-xs text-green-600">סה"כ הושקע</span>
                                                    </div>
                                                    <div className="bg-red-50 p-3 rounded-lg text-center">
                                                        <span className="block text-red-800 font-bold text-lg">₪{investor.totalWithdrawn.toLocaleString()}</span>
                                                        <span className="text-xs text-red-600">סה"כ נמשך/הוחזר</span>
                                                    </div>
                                                </div>

                                                {/* Progress Bar */}
                                                <div className="mb-2">
                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                        <span>הוחזר עד כה</span>
                                                        <span>{returnPercentage.toFixed(1)}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                                        <div 
                                                            className="bg-blue-500 h-2 rounded-full transition-all duration-1000" 
                                                            style={{ width: `${Math.min(100, returnPercentage)}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Transactions History Expander */}
                                            <div className="border-t border-slate-100">
                                                <button 
                                                    onClick={() => toggleInvestorExpansion(investor.name)}
                                                    className="w-full flex justify-between items-center font-medium cursor-pointer p-3 bg-slate-50 hover:bg-slate-100 text-xs text-slate-600 transition-colors"
                                                >
                                                    <span>היסטוריית תנועות ({investor.transactions.length})</span>
                                                    <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                        <svg fill="none" height="20" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="20"><path d="M6 9l6 6 6-6"></path></svg>
                                                    </span>
                                                </button>
                                                
                                                {isExpanded && (
                                                    <div className="text-neutral-600 max-h-48 overflow-y-auto animate-fadeIn">
                                                        <table className="min-w-full text-xs text-right">
                                                            <tbody className="divide-y divide-slate-100">
                                                                {investor.transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => (
                                                                    <tr key={t.id} className="hover:bg-white">
                                                                        <td className="px-3 py-2 text-slate-500">{new Date(t.date).toLocaleDateString('he-IL')}</td>
                                                                        <td className="px-3 py-2">
                                                                            {t.description || '-'}
                                                                            <button onClick={() => handleEditEquity(t)} className="ms-2 text-blue-400 hover:text-blue-600"><EditIcon className="w-3 h-3 inline"/></button>
                                                                        </td>
                                                                        <td className={`px-3 py-2 font-bold ${t.transactionType === 'WITHDRAWAL' ? 'text-red-600' : 'text-green-600'}`}>
                                                                            {t.transactionType === 'WITHDRAWAL' ? '-' : '+'}₪{t.amount.toLocaleString()}
                                                                        </td>
                                                                        <td className="px-2 py-2 text-end">
                                                                            <button onClick={() => handleDelete('EQUITY', t.id)} className="text-slate-300 hover:text-red-500 group p-1">
                                                                                <DeleteIcon className="w-3 h-3 group-hover:scale-110"/>
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Audit Log Section */}
                            <div className="mt-12 border-t border-slate-200 pt-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <LogIcon className="w-5 h-5 text-slate-500" />
                                    <h3 className="text-lg font-bold text-slate-700">יומן פעולות ושינויים (Audit Log)</h3>
                                </div>
                                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                                    {equityLogs.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500">
                                            <p>טרם נרשמו פעולות ביומן.</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm text-right">
                                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-6 py-3 w-40">תאריך ושעה</th>
                                                        <th className="px-6 py-3 w-32">משתמש</th>
                                                        <th className="px-6 py-3 w-24">פעולה</th>
                                                        <th className="px-6 py-3 w-48">משקיע</th>
                                                        <th className="px-6 py-3">פירוט שינויים</th>
                                                        <th className="px-6 py-3 w-32">סכום (Snapshot)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {equityLogs.map((log) => (
                                                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-6 py-4 text-slate-500 whitespace-nowrap" dir="ltr">
                                                                {new Date(log.timestamp).toLocaleString('he-IL')}
                                                            </td>
                                                            <td className="px-6 py-4 text-slate-600 font-medium">
                                                                {log.user}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className={`px-2 py-1 rounded text-xs font-bold border ${
                                                                    log.action === 'CREATE' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                    log.action === 'UPDATE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                    'bg-red-50 text-red-700 border-red-200'
                                                                }`}>
                                                                    {log.action === 'CREATE' ? 'יצירה' : log.action === 'UPDATE' ? 'עדכון' : 'מחיקה'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 font-medium text-slate-800">
                                                                {log.investorName}
                                                            </td>
                                                            <td className="px-6 py-4 text-slate-600">
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="font-medium text-slate-900">{log.description}</span>
                                                                    {log.changes && log.changes.length > 0 && (
                                                                        <ul className="list-disc list-inside text-xs text-slate-500 bg-slate-100 p-2 rounded mt-1 border border-slate-200">
                                                                            {log.changes.map((change, idx) => (
                                                                                <li key={idx}>{change}</li>
                                                                            ))}
                                                                        </ul>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 font-mono font-bold text-slate-700">
                                                                ₪{log.amountSnapshot.toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal for Adding Items */}
            {isModalOpen && (
                <Modal title={`${editingId ? 'עריכת' : 'הוספה ל-'} ${activeTab === 'FIXED' ? 'הוצאות קבועות' : activeTab === 'VARIABLE' ? 'הוצאות משתנות' : activeTab === 'LOANS' ? 'הלוואות' : activeTab === 'DEBTS' ? 'חובות' : 'הון והשקעות'}`} onClose={() => setIsModalOpen(false)}>
                    <div className="space-y-4 text-start">
                        {/* ... Fixed, Variable, Loans, Debts forms remain unchanged ... */}
                        {activeTab === 'FIXED' && (
                            /* ... (Keeping existing Fixed form code) ... */
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">שם ההוצאה</label>
                                    <input type="text" value={fixedForm.name} onChange={e => setFixedForm({...fixedForm, name: e.target.value})} className="w-full border p-2 rounded mt-1" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">קטגוריה</label>
                                        <input type="text" value={fixedForm.category} onChange={e => setFixedForm({...fixedForm, category: e.target.value})} className="w-full border p-2 rounded mt-1" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">סכום חודשי</label>
                                        <input type="number" value={fixedForm.monthlyAmount} onChange={e => setFixedForm({...fixedForm, monthlyAmount: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 bg-slate-50 p-2 rounded border border-slate-200">
                                    <input 
                                        type="checkbox" 
                                        id="includesVat"
                                        checked={fixedForm.includesVat !== false} 
                                        onChange={e => setFixedForm({...fixedForm, includesVat: e.target.checked})} 
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2"
                                    />
                                    <label htmlFor="includesVat" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                                        הסכום כולל מע"מ?
                                    </label>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">יום חיוב בחודש</label>
                                    <input type="number" max="31" min="1" value={fixedForm.paymentDay} onChange={e => setFixedForm({...fixedForm, paymentDay: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">אמצעי תשלום</label>
                                        <select 
                                            value={fixedForm.paymentMethod} 
                                            onChange={e => setFixedForm({...fixedForm, paymentMethod: e.target.value as PaymentMethod})} 
                                            className="w-full border p-2 rounded mt-1 bg-white"
                                        >
                                            <option value="">בחר...</option>
                                            {Object.values(PaymentMethod).map(pm => <option key={pm} value={pm}>{pm}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">פרטי תשלום (למשל 4 ספרות)</label>
                                        <input type="text" value={fixedForm.paymentDetails || ''} onChange={e => setFixedForm({...fixedForm, paymentDetails: e.target.value})} className="w-full border p-2 rounded mt-1" placeholder="לדוג': ויזה 1234" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">תאריך תחילת שירות</label>
                                        <input type="date" value={fixedForm.startDate ? new Date(fixedForm.startDate).toISOString().split('T')[0] : ''} onChange={e => setFixedForm({...fixedForm, startDate: new Date(e.target.value)})} className="w-full border p-2 rounded mt-1" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">תאריך סיום (אם ידוע/הסתיים)</label>
                                        <input 
                                            type="date" 
                                            value={fixedForm.endDate ? new Date(fixedForm.endDate).toISOString().split('T')[0] : ''} 
                                            onChange={e => setFixedForm({...fixedForm, endDate: e.target.value ? new Date(e.target.value) : undefined})} 
                                            className="w-full border p-2 rounded mt-1" 
                                        />
                                        <p className="text-xs text-slate-500 mt-1">אם מוזן תאריך עבר, ההוצאה תעבור להיסטוריה ולא תחושב בחודשי.</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700">תיאור / הערות</label>
                                    <input type="text" value={fixedForm.description} onChange={e => setFixedForm({...fixedForm, description: e.target.value})} className="w-full border p-2 rounded mt-1" />
                                </div>
                            </>
                        )}
                        {activeTab === 'VARIABLE' && (
                            /* ... (Keeping existing Variable form code) ... */
                            <>
                                <div><label className="block text-sm text-slate-600">שם ההוצאה</label><input type="text" value={variableForm.name} onChange={e => setVariableForm({...variableForm, name: e.target.value})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">סכום</label><input type="number" value={variableForm.amount} onChange={e => setVariableForm({...variableForm, amount: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div className="flex items-center mt-2 bg-slate-50 p-2 rounded border border-slate-200">
                                    <input 
                                        type="checkbox" 
                                        id="varIncludesVat"
                                        checked={variableForm.includesVat !== false} 
                                        onChange={e => setVariableForm({...variableForm, includesVat: e.target.checked})} 
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2"
                                    />
                                    <label htmlFor="varIncludesVat" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                                        הסכום כולל מע"מ?
                                    </label>
                                </div>
                                <div><label className="block text-sm text-slate-600">תאריך</label><input type="date" value={variableForm.date ? new Date(variableForm.date).toISOString().split('T')[0] : ''} onChange={e => setVariableForm({...variableForm, date: new Date(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">קטגוריה</label><input type="text" value={variableForm.category} onChange={e => setVariableForm({...variableForm, category: e.target.value})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">תיאור</label><input type="text" value={variableForm.description} onChange={e => setVariableForm({...variableForm, description: e.target.value})} className="w-full border p-2 rounded mt-1" /></div>
                            </>
                        )}
                        {activeTab === 'LOANS' && (
                            /* ... (Keeping existing Loan form code) ... */
                            <>
                                <div><label className="block text-sm text-slate-600">שם הגוף המלווה</label><input type="text" value={loanForm.lenderName} onChange={e => setLoanForm({...loanForm, lenderName: e.target.value})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">סכום הקרן (המקורי)</label><input type="number" value={loanForm.principalAmount} onChange={e => setLoanForm({...loanForm, principalAmount: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">ריבית שנתית (%)</label><input type="number" step="0.1" value={loanForm.interestRate} onChange={e => setLoanForm({...loanForm, interestRate: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">החזר חודשי קבוע</label><input type="number" value={loanForm.monthlyPayment} onChange={e => setLoanForm({...loanForm, monthlyPayment: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">משך הלוואה (חודשים)</label><input type="number" value={loanForm.durationMonths} onChange={e => setLoanForm({...loanForm, durationMonths: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">תשלומים שבוצעו עד כה</label><input type="number" value={loanForm.paymentsMade} onChange={e => setLoanForm({...loanForm, paymentsMade: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">תאריך התחלה</label><input type="date" onChange={e => setLoanForm({...loanForm, startDate: new Date(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                            </>
                        )}
                        {activeTab === 'DEBTS' && (
                            /* ... (Keeping existing Debt form code) ... */
                            <>
                                <div><label className="block text-sm text-slate-600">שם החוב / נושה</label><input type="text" value={debtForm.name} onChange={e => setDebtForm({...debtForm, name: e.target.value})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">סכום החוב</label><input type="number" value={debtForm.amount} onChange={e => setDebtForm({...debtForm, amount: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">תאריך יעד לתשלום</label><input type="date" onChange={e => setDebtForm({...debtForm, dueDate: new Date(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                <div><label className="block text-sm text-slate-600">תיאור</label><input type="text" value={debtForm.description} onChange={e => setDebtForm({...debtForm, description: e.target.value})} className="w-full border p-2 rounded mt-1" /></div>
                            </>
                        )}
                        {activeTab === 'EQUITY' && (
                            <>
                                <div><label className="block text-sm text-slate-600">שם המשקיע / שותף <span className="text-red-500">*</span></label><input type="text" value={equityForm.investorName} onChange={e => setEquityForm({...equityForm, investorName: e.target.value})} className="w-full border p-2 rounded mt-1" list="investors-list" required />
                                    <datalist id="investors-list">
                                        {equityByInvestor.map(inv => <option key={inv.name} value={inv.name} />)}
                                    </datalist>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded border border-slate-200 mt-2">
                                    <label className={`flex items-center justify-center p-2 rounded cursor-pointer border transition-all ${equityForm.transactionType === 'DEPOSIT' ? 'bg-green-100 border-green-400 text-green-800 font-bold' : 'bg-white border-slate-300 text-slate-500'}`}>
                                        <input 
                                            type="radio" 
                                            name="transType" 
                                            className="hidden"
                                            checked={equityForm.transactionType === 'DEPOSIT'}
                                            onChange={() => setEquityForm({...equityForm, transactionType: 'DEPOSIT'})}
                                        />
                                        הפקדה / השקעה
                                    </label>
                                    <label className={`flex items-center justify-center p-2 rounded cursor-pointer border transition-all ${equityForm.transactionType === 'WITHDRAWAL' ? 'bg-red-100 border-red-400 text-red-800 font-bold' : 'bg-white border-slate-300 text-slate-500'}`}>
                                        <input 
                                            type="radio" 
                                            name="transType" 
                                            className="hidden"
                                            checked={equityForm.transactionType === 'WITHDRAWAL'}
                                            onChange={() => setEquityForm({...equityForm, transactionType: 'WITHDRAWAL'})}
                                        />
                                        משיכה / החזר
                                    </label>
                                </div>

                                <div><label className="block text-sm text-slate-600">סכום <span className="text-red-500">*</span></label><input type="number" value={equityForm.amount} onChange={e => setEquityForm({...equityForm, amount: Number(e.target.value)})} className="w-full border p-2 rounded mt-1" required /></div>
                                <div><label className="block text-sm text-slate-600">תאריך</label><input type="date" value={equityForm.date ? new Date(equityForm.date).toISOString().split('T')[0] : ''} onChange={e => setEquityForm({...equityForm, date: new Date(e.target.value)})} className="w-full border p-2 rounded mt-1" /></div>
                                
                                <div><label className="block text-sm text-slate-600">סוג משקיע</label>
                                    <select value={equityForm.type} onChange={e => setEquityForm({...equityForm, type: e.target.value as any})} className="w-full border p-2 rounded mt-1">
                                        <option value="הון בעלים">הון בעלים</option>
                                        <option value="השקעה חיצונית">השקעה חיצונית</option>
                                    </select>
                                </div>
                                <div><label className="block text-sm text-slate-600">תיאור/מטרה</label><input type="text" value={equityForm.description} onChange={e => setEquityForm({...equityForm, description: e.target.value})} className="w-full border p-2 rounded mt-1" placeholder="לדוג': הלוואת בעלים, דיבידנד..." /></div>
                            </>
                        )}
                        <button onClick={handleSave} className="w-full bg-primary text-white py-2 rounded hover:bg-indigo-700 mt-4">שמור</button>
                    </div>
                </Modal>
            )}

            {isPaymentModalOpen && selectedDebtForPayment && (
                <Modal title={`ניהול החזרי חוב: ${selectedDebtForPayment.name}`} onClose={() => setIsPaymentModalOpen(false)}>
                    <DebtPaymentModal 
                        debt={selectedDebtForPayment} 
                        onSavePayment={handleSaveDebtPayment}
                        onClose={() => setIsPaymentModalOpen(false)}
                    />
                </Modal>
            )}
        </div>
    );
};

export default FinancePage;