
import React, { useState, useMemo, useEffect, useCallback, Component, ErrorInfo } from 'react';
import { FixedExpense, VariableExpense, Loan, EquityInvestment, Debt, Receivable, ReceivablePayment, PaymentMethod, DebtPayment, Order, TransactionStatus, CustomerPayment, SupplierPayment, LineItemUnit, Attachment, PaymentStatusHistory, AmortizationEntry, Employee, AttendanceRecord, OrderStatusConfiguration, PayrollOverrideMap } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, BankIcon, TrendingUpIcon, LogIcon, CashIcon, ClockIcon, LockIcon, DownloadIcon, ImportIcon } from './icons';
import Modal from './Modal';
import PnLReport from './PnLReport';
import * as mongoService from '../services/mongoService';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useAuth } from '../contexts/AuthContext';

// Error Boundary Component
class ErrorBoundary extends Component<
    { children: React.ReactNode; fallback?: React.ReactNode },
    { hasError: boolean; error?: Error }
> {
    constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error in FinancePage:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="p-6 bg-red-50 border border-red-200 rounded-md">
                    <h3 className="text-red-800 font-bold mb-2">שגיאה בטעינת הדוח</h3>
                    <p className="text-red-600 text-sm mb-4">{this.state.error?.message || 'שגיאה לא ידועה'}</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                        נסה שוב
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

// --- Financial Engine Helpers ---

/**
 * Calculates the monthly payment (PMT) for a Spitzer (Annuity) loan.
 * Formula: P * (i * (1 + i)^n) / ((1 + i)^n - 1)
 */
const calculatePMT = (principal: number, annualRate: number, months: number): number => {
    if (principal <= 0 || months <= 0) return 0;
    // Fix for 0% interest - simple linear division
    if (!annualRate || annualRate <= 0) return Math.round((principal / months) * 100) / 100;
    
    const monthlyRate = annualRate / 100 / 12;
    const pmt = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    return Math.round(pmt * 100) / 100;
};

/**
 * Generates a full Spitzer amortization schedule.
 */
const generateSpitzerSchedule = (
    principal: number, 
    annualRate: number, 
    months: number, 
    startDate: Date, 
    paymentsMade: number = 0
): AmortizationEntry[] => {
    const schedule: AmortizationEntry[] = [];
    const monthlyPayment = calculatePMT(principal, annualRate, months);
    const monthlyRate = (annualRate && annualRate > 0) ? (annualRate / 100 / 12) : 0;
    
    let remainingPrincipal = principal;
    const baseDate = new Date(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= months; i++) {
        const interestAmount = monthlyRate > 0 ? (remainingPrincipal * monthlyRate) : 0;
        const principalAmount = monthlyPayment - interestAmount;
        remainingPrincipal -= principalAmount;

        const dueDate = new Date(baseDate);
        dueDate.setMonth(baseDate.getMonth() + (i - 1));
        const dueDateClean = new Date(dueDate);
        dueDateClean.setHours(0, 0, 0, 0);

        schedule.push({
            id: `gen_${Date.now()}_${i}`,
            paymentNumber: i,
            dueDate: dueDate,
            principalAmount: Math.round(principalAmount * 100) / 100,
            interestAmount: Math.round(interestAmount * 100) / 100,
            totalMonthlyPayment: monthlyPayment,
            remainingPrincipal: Math.max(0, Math.round(remainingPrincipal * 100) / 100),
            // Auto-mark as paid if date has passed or manually marked via count
            isPaid: i <= paymentsMade || dueDateClean <= today
        });
    }

    return schedule;
};

interface FinancePageProps {
    fixedExpenses: FixedExpense[];
    setFixedExpenses: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
    variableExpenses: VariableExpense[];
    setVariableExpenses: React.Dispatch<React.SetStateAction<VariableExpense[]>>;
    loans: Loan[];
    setLoans: React.Dispatch<React.SetStateAction<Loan[]>>;
    debts: Debt[];
    setDebts: React.Dispatch<React.SetStateAction<Debt[]>>;
    receivables: Receivable[];
    setReceivables: React.Dispatch<React.SetStateAction<Receivable[]>>;
    equity: EquityInvestment[];
    setEquity: React.Dispatch<React.SetStateAction<EquityInvestment[]>>;
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
    vatRate: number;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    employees: Employee[];
    attendanceRecords: AttendanceRecord[];
    statusConfigs: OrderStatusConfiguration[];
    payrollOverrides: PayrollOverrideMap;
    onNavigateToOrder?: (orderId: string) => void;
}

// Internal type for Table Display
interface VariableDisplayItem {
    id: string;
    name: string;
    category: string;
    amount: number; 
    date: Date;
    paymentMethod: string;
    isInstallment: boolean;
    originalId: string;
    isVatExempt?: boolean;
    includesVat?: boolean;
    checksCount?: number;
    isDebtPayment?: boolean;
}

// Internal type for Audit Log
interface AuditLogEntry {
    id: string;
    timestamp: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    investorName: string;
    description: string;
    amountSnapshot: number;
    changes?: string[];
    user: string;
}

interface CheckSource {
    orderId: string;
    orderNumber: string;
    paymentId: string;
    sourceIndex?: number;
    sourceType?: 'lineItem' | 'additionalService' | 'fixedExpense' | 'variableExpense' | 'debt' | 'receivable';
    fixedExpenseId?: string;
    variableExpenseId?: string;
    debtId?: string;
    receivableId?: string;
    amount: number;
}

interface AggregatedCheck {
    uniqueId: string;
    type: 'INCOMING' | 'OUTGOING';
    date: Date;
    repaymentDate: Date;
    amount: number;
    reference: string;
    entityName: string;
    status: TransactionStatus;
    statusHistory: any[];
    sources: CheckSource[];
    hasAttachments?: boolean;
}

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void; icon?: React.ReactNode }> = ({ label, active, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`px-6 py-3 font-bold text-sm transition-colors border-b-4 flex items-center gap-2 whitespace-nowrap ${
            active ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600'
        }`}
    >
        {icon}
        {label}
    </button>
);

const AmortizationModal: React.FC<{
    loan: Loan;
    onClose: () => void;
    onUpdateSchedule: (loanId: string, schedule: AmortizationEntry[]) => void;
    isReadOnly?: boolean;
}> = ({ loan, onClose, onUpdateSchedule, isReadOnly = false }) => {
    const [schedule, setSchedule] = useState<AmortizationEntry[]>(loan.schedule || []);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    
    useEffect(() => {
        setSchedule(loan.schedule || []);
    }, [loan.schedule]);

    // SMART AUTO-SYNC: Mark past payments as paid automatically
    useEffect(() => {
        if (isReadOnly || !loan.schedule || loan.schedule.length === 0) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let hasChanges = false;
        const updatedSchedule = loan.schedule.map(entry => {
            const entryDate = new Date(entry.dueDate);
            entryDate.setHours(0, 0, 0, 0);

            // If the date has passed or is today, and it's not marked paid yet
            if (entryDate <= today && !entry.isPaid) {
                hasChanges = true;
                return { ...entry, isPaid: true };
            }
            return entry;
        });

        if (hasChanges) {
            setSchedule(updatedSchedule);
            onUpdateSchedule(loan.id, updatedSchedule);
        }
    }, [loan.id, isReadOnly]); 

    const handleTogglePaid = (entryId: string) => {
        if (isReadOnly) return;
        const newSchedule = schedule.map(entry => 
            entry.id === entryId ? { ...entry, isPaid: !entry.isPaid } : entry
        );
        setSchedule(newSchedule);
        onUpdateSchedule(loan.id, newSchedule);
    };

    const handleUpdateEntryValue = (entryId: string, field: keyof AmortizationEntry, value: number) => {
        if (isReadOnly) return;

        let currentRunningPrincipal = loan.principalAmount; // Start from the initial loan principal

        const newSchedule = schedule.map(entry => {
            const updated = { ...entry };
            
            // If this is the row being edited, apply the new value and recalculate row total
            if (entry.id === entryId) {
                (updated as any)[field] = value;
                updated.totalMonthlyPayment = (updated.principalAmount || 0) + (updated.interestAmount || 0) + (updated.fees || 0);
            }
            
            // Recalculate remaining principal for the row by subtracting principal repayment
            currentRunningPrincipal -= updated.principalAmount;
            updated.remainingPrincipal = Math.max(0, Math.round(currentRunningPrincipal * 100) / 100);
            
            return updated;
        });

        setSchedule(newSchedule);
        onUpdateSchedule(loan.id, newSchedule);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            let content = event.target?.result as string;
            content = content.replace(/^\uFEFF/, ''); // Clean BOM
            
            const parseCsvLine = (line: string) => {
                const result = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(current);
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current);
                return result.map(c => c.trim().replace(/^"|"$/g, ''));
            };

            const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            const newSchedule: AmortizationEntry[] = [];
            
            let headerRowIndex = -1;
            let mapping: { [key: string]: number } = {};

            for (let i = 0; i < lines.length; i++) {
                const cols = parseCsvLine(lines[i]);
                if (cols.some(c => c.includes('#') || c.includes('תאריך') || c.includes('תשלום'))) {
                    const tempMapping: any = {};
                    cols.forEach((col, idx) => {
                        const c = col.trim();
                        if (c === '#' || c.includes('מספר תשלום')) tempMapping.num = idx;
                        else if (c.includes('תאריך')) tempMapping.date = idx;
                        else if (c.includes('יתרה') || c.includes('יתרת')) tempMapping.remaining = idx;
                        else if (c.includes('קרן') && !c.includes('יתרה')) tempMapping.principal = idx;
                        else if (c.includes('ריבית') && !c.includes('אחוז')) tempMapping.interest = idx;
                        else if (c.includes('שוטף') || c.includes('סה"כ') || c.includes('סך החזר') || c.includes('תשלום חודשי')) tempMapping.total = idx;
                        else if (c.includes('גבייה') || c.includes('עמלה')) tempMapping.fees = idx;
                    });
                    
                    if (tempMapping.num !== undefined && tempMapping.date !== undefined) {
                        headerRowIndex = i;
                        mapping = tempMapping;
                        break;
                    }
                }
            }

            if (headerRowIndex === -1) {
                alert("לא הצלחנו לזהות את כותרות העמודות בקובץ. וודא שהקובץ מכיל שורת כותרות עם '#' או 'תאריך תשלום'.");
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (let i = headerRowIndex + 1; i < lines.length; i++) {
                const cols = parseCsvLine(lines[i]);
                const paymentNumStr = mapping.num !== undefined ? cols[mapping.num] : null;
                if (!paymentNumStr || isNaN(parseInt(paymentNumStr))) continue;

                const parseIsraeliCsvDate = (dateStr: string): Date => {
                    if (!dateStr || typeof dateStr !== 'string') return new Date();
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        const [day, month, year] = parts.map(p => parseInt(p.trim()));
                        const fullYear = year < 100 ? 2000 + year : year;
                        return new Date(fullYear, month - 1, day);
                    }
                    return new Date(dateStr);
                };

                const cleanNumeric = (str: string): number => {
                    if (!str) return 0;
                    const cleaned = str.replace(/[^\d.-]/g, '');
                    return parseFloat(cleaned) || 0;
                };

                const dueDate = mapping.date !== undefined ? parseIsraeliCsvDate(cols[mapping.date]) : new Date();
                const dueDateClean = new Date(dueDate);
                dueDateClean.setHours(0, 0, 0, 0);

                newSchedule.push({
                    id: `entry_${Date.now()}_${i}`,
                    paymentNumber: parseInt(paymentNumStr),
                    dueDate: dueDate,
                    principalAmount: mapping.principal !== undefined ? cleanNumeric(cols[mapping.principal]) : 0,
                    interestAmount: mapping.interest !== undefined ? cleanNumeric(cols[mapping.interest]) : 0,
                    totalMonthlyPayment: mapping.total !== undefined ? cleanNumeric(cols[mapping.total]) : 0,
                    remainingPrincipal: mapping.remaining !== undefined ? cleanNumeric(cols[mapping.remaining]) : 0,
                    fees: mapping.fees !== undefined ? cleanNumeric(cols[mapping.fees]) : 0,
                    isPaid: dueDateClean <= today // Auto-mark as paid if date has passed
                });
            }

            if (newSchedule.length > 0) {
                setSchedule(newSchedule);
                onUpdateSchedule(loan.id, newSchedule);
                alert(`נטענו ${newSchedule.length} תשלומים בהצלחה מהקובץ`);
            } else {
                alert("לא נמצאו נתוני תשלומים תקינים בקובץ.");
            }
        };
        reader.readAsText(file);
    };

    const totalPaidSchedule = schedule.filter(s => s.isPaid).reduce((sum, s) => sum + s.totalMonthlyPayment, 0);
    const totalRemainingSchedule = schedule.filter(s => !s.isPaid).reduce((sum, s) => sum + s.totalMonthlyPayment, 0);

    return (
        <div className="space-y-6 text-start">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex gap-8">
                    <div>
                        <span className="block text-[10px] uppercase font-black text-slate-400">סה"כ שולם מהלוח</span>
                        <span className="font-black text-green-600 text-lg">₪{totalPaidSchedule.toLocaleString()}</span>
                    </div>
                    <div>
                        <span className="block text-[10px] uppercase font-black text-slate-400">יתרה לתשלום</span>
                        <span className="font-black text-red-600 text-lg">₪{totalRemainingSchedule.toLocaleString()}</span>
                    </div>
                </div>
                {!isReadOnly && (
                    <div className="flex items-center gap-3">
                        <div className="text-xs text-slate-500 bg-white border px-3 py-1 rounded-full shadow-sm flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            סנכרון תאריכים אוטומטי פעיל
                        </div>
                        <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-all shadow-sm text-sm font-bold">
                            <ImportIcon className="w-4 h-4 text-primary" />
                            ייבוא לוח סילוקין (CSV)
                            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
                        </label>
                    </div>
                )}
            </div>

            <div className="max-h-[500px] overflow-y-auto border rounded-xl shadow-inner bg-white custom-scrollbar">
                <table className="min-w-full text-sm text-right">
                    <thead className="bg-slate-100 text-slate-600 font-black sticky top-0 z-10 border-b">
                        <tr>
                            <th className="px-4 py-3 w-12 text-center">#</th>
                            <th className="px-4 py-3">תאריך פירעון</th>
                            <th className="px-4 py-3">קרן</th>
                            <th className="px-4 py-3">ריבית</th>
                            <th className="px-4 py-3">עמלות</th>
                            <th className="px-4 py-3">סה"כ תשלום</th>
                            <th className="px-4 py-3">יתרת קרן</th>
                            <th className="px-4 py-3 text-center">סטטוס</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {schedule.map((entry) => {
                            const isPast = new Date(entry.dueDate) <= new Date();
                            const isEditing = editingEntryId === entry.id;

                            return (
                                <tr key={entry.id} className={`hover:bg-slate-50 transition-colors ${entry.isPaid ? 'bg-green-50/30 opacity-70' : ''}`}>
                                    <td className="px-4 py-3 text-center font-mono text-slate-400">{entry.paymentNumber}</td>
                                    <td className="px-4 py-3 font-bold">
                                        {new Date(entry.dueDate).toLocaleDateString('he-IL')}
                                        {isPast && !entry.isPaid && <span className="block text-[10px] text-red-500">באיחור</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {isEditing && !isReadOnly ? (
                                            <input 
                                                type="number" 
                                                autoFocus
                                                value={entry.principalAmount} 
                                                onChange={e => handleUpdateEntryValue(entry.id, 'principalAmount', Number(e.target.value))}
                                                className="w-20 p-1 border rounded focus:ring-1 focus:ring-primary text-xs"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => !isReadOnly && setEditingEntryId(entry.id)}>
                                                <span>₪{entry.principalAmount.toLocaleString()}</span>
                                                {!isReadOnly && <EditIcon className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {isEditing && !isReadOnly ? (
                                            <input 
                                                type="number" 
                                                value={entry.interestAmount} 
                                                onChange={e => handleUpdateEntryValue(entry.id, 'interestAmount', Number(e.target.value))}
                                                className="w-20 p-1 border rounded focus:ring-1 focus:ring-primary text-xs"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => !isReadOnly && setEditingEntryId(entry.id)}>
                                                <span>₪{entry.interestAmount.toLocaleString()}</span>
                                                {!isReadOnly && <EditIcon className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-amber-600">
                                        {isEditing && !isReadOnly ? (
                                            <input 
                                                type="number" 
                                                value={entry.fees || 0} 
                                                onChange={e => handleUpdateEntryValue(entry.id, 'fees', Number(e.target.value))}
                                                className="w-20 p-1 border rounded focus:ring-1 focus:ring-primary text-xs"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => !isReadOnly && setEditingEntryId(entry.id)}>
                                                <span>₪{(entry.fees || 0).toLocaleString()}</span>
                                                {!isReadOnly && <EditIcon className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-black text-slate-800">
                                        {isEditing && !isReadOnly ? (
                                            <button 
                                                onClick={() => setEditingEntryId(null)}
                                                className="bg-primary text-white text-[10px] px-2 py-1 rounded"
                                            >
                                                שמור שורה
                                            </button>
                                        ) : (
                                            <span>₪{entry.totalMonthlyPayment.toLocaleString()}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-400">₪{entry.remainingPrincipal.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <button 
                                                onClick={() => handleTogglePaid(entry.id)}
                                                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm transition-all ${entry.isPaid ? 'bg-green-600 text-white' : 'bg-white border border-slate-300 text-slate-400 hover:border-primary hover:text-primary'}`}
                                                disabled={isReadOnly}
                                            >
                                                {entry.isPaid ? 'שולם' : 'סמן כפרעון'}
                                            </button>
                                            {entry.isPaid && isPast && !isReadOnly && (
                                                <span className="text-[8px] text-slate-400 font-bold uppercase">סומן לפי תאריך</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {schedule.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-4 py-20 text-center text-slate-400">
                                    אין נתונים בלוח הסילוקין.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end pt-4 border-t">
                <button onClick={onClose} className="px-6 py-2 bg-slate-800 text-white rounded-lg font-bold">סגור לוח סילוקין</button>
            </div>
        </div>
    );
};

const DebtPaymentModal: React.FC<{ 
    debt: Debt; 
    onSavePayment: (debtId: string, payment: DebtPayment) => void; 
    onClose: () => void;
    vatRate: number;
}> = ({ debt, onSavePayment, onClose, vatRate }) => {
    const debtOriginalAmount = debt.amount || 0;
    let debtGross = debtOriginalAmount;
    if (!debt.isVatExempt) {
        debtGross = debt.includesVat ? debtOriginalAmount : debtOriginalAmount * (1 + vatRate / 100);
    }

    const paidSoFar = (debt.payments || []).reduce((sum, p) => {
        const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
        if (p.status && invalidStatuses.includes(p.status)) return sum;
        return sum + p.amount;
    }, 0);
    const remaining = Math.max(0, debtGross - paidSoFar);

    const [amount, setAmount] = useState<number>(Number(remaining.toFixed(2)));
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
    const [reference, setReference] = useState('');
    const [repaymentDate, setRepaymentDate] = useState<string>('');
    const [note, setNote] = useState<string>('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (amount <= 0) {
            alert("אנא הזן סכום חיובי");
            return;
        }
        if (method === PaymentMethod.CHECK) {
            if (!reference) { alert("חובה להזין מספר צ'ק בשדה אסמכתא"); return; }
            if (!repaymentDate) { alert("חובה להזין תאריך פירעון עבור צ'ק"); return; }
        }

        const initialStatus: TransactionStatus = method === PaymentMethod.CHECK ? 'PENDING' : 'CLEARED';

        const newPayment: DebtPayment = { 
            id: `dp_${Date.now()}`, 
            amount, 
            date: new Date(date), 
            method,
            reference,
            repaymentDate: method === PaymentMethod.CHECK ? new Date(repaymentDate) : undefined,
            status: initialStatus,
            statusHistory: [{
                date: new Date(),
                status: initialStatus,
                changedBy: 'משתמש',
                reason: 'תשלום חוב'
            }],
            note 
        };
        onSavePayment(debt.id, newPayment);
    };

    return (
        <div className="space-y-6 text-start">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 font-medium">סכום חוב (ברוטו):</span>
                    <span className="font-bold text-lg">₪{debtGross.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-2">
                    <span className="text-red-600 font-bold">יתרה לתשלום:</span>
                    <span className="font-bold text-red-600 text-xl">₪{remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
            </div>
            <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-white shadow-sm space-y-4">
                <h4 className="font-bold text-slate-800">רישום החזר חדש</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">סכום החזר</label>
                        <input type="number" step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 focus:ring-primary focus:border-primary sm:text-sm" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אמצעי תשלום</label>
                        <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm bg-white p-2 focus:ring-primary focus:border-primary sm:text-sm">
                            {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">תאריך ביצוע</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 focus:ring-primary focus:border-primary sm:text-sm" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אסמכתא / מס' צ'ק</label>
                        <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 focus:ring-primary focus:border-primary sm:text-sm" placeholder={method === PaymentMethod.CHECK ? 'חובה' : ''} />
                    </div>
                </div>

                {method === PaymentMethod.CHECK && (
                    <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                        <label className="block text-sm font-bold text-yellow-800">תאריך פירעון הצ'ק</label>
                        <input type="date" value={repaymentDate} onChange={e => setRepaymentDate(e.target.value)} className="mt-1 block w-full rounded-md border-yellow-300 shadow-sm focus:ring-yellow-500 p-2 sm:text-sm" required />
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-700">הערה</label>
                    <input type="text" value={note} onChange={e => setNote(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 focus:ring-primary focus:border-primary sm:text-sm" />
                </div>
                <div className="flex justify-end pt-2">
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-indigo-700 text-sm font-bold shadow-sm">בצע תשלום</button>
                </div>
            </form>
            <div className="flex justify-end pt-4 border-t border-slate-100">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300">סגור</button>
            </div>
        </div>
    );
};

const ReceivableCollectionModal: React.FC<{ 
    receivable: Receivable; 
    onSavePayment: (receivableId: string, payment: ReceivablePayment) => void; 
    onClose: () => void;
    vatRate: number;
}> = ({ receivable, onSavePayment, onClose, vatRate }) => {
    const originalAmount = receivable.amount || 0;
    let gross = originalAmount;
    if (!receivable.isVatExempt) {
        gross = receivable.includesVat ? originalAmount : originalAmount * (1 + vatRate / 100);
    }

    const collectedSoFar = (receivable.payments || []).reduce((sum, p) => {
        const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
        if (p.status && invalidStatuses.includes(p.status)) return sum;
        return sum + p.amount;
    }, 0);
    const remaining = Math.max(0, gross - collectedSoFar);

    const [amount, setAmount] = useState<number>(Number(remaining.toFixed(2)));
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
    const [reference, setReference] = useState('');
    const [repaymentDate, setRepaymentDate] = useState<string>('');
    const [note, setNote] = useState<string>('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (amount <= 0) {
            alert("אנא הזן סכום חיובי");
            return;
        }
        if (method === PaymentMethod.CHECK) {
            if (!reference) { alert("חובה להזין מספר צ'ק בשדה אסמכתא"); return; }
            if (!repaymentDate) { alert("חובה להזין תאריך פירעון עבור צ'ק"); return; }
        }

        const initialStatus: TransactionStatus = method === PaymentMethod.CHECK ? 'PENDING' : 'CLEARED';

        const newPayment: ReceivablePayment = { 
            id: `rp_${Date.now()}`, 
            amount, 
            date: new Date(date), 
            method,
            reference,
            repaymentDate: method === PaymentMethod.CHECK ? new Date(repaymentDate) : undefined,
            status: initialStatus,
            statusHistory: [{
                date: new Date(),
                status: initialStatus,
                changedBy: 'משתמש',
                reason: 'גביית חוב לקוח'
            }],
            note 
        };
        onSavePayment(receivable.id, newPayment);
    };

    return (
        <div className="space-y-6 text-start">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 font-medium">סכום החייב (ברוטו):</span>
                    <span className="font-bold text-lg">₪{gross.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-2">
                    <span className="text-green-600 font-bold">יתרה לגבייה:</span>
                    <span className="font-bold text-green-600 text-xl">₪{remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
            </div>
            <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-white shadow-sm space-y-4">
                <h4 className="font-bold text-slate-800">רישום גבייה חדשה</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">סכום שהתקבל</label>
                        <input type="number" step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 focus:ring-primary focus:border-primary sm:text-sm" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אמצעי תשלום</label>
                        <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm bg-white p-2 focus:ring-primary focus:border-primary sm:text-sm">
                            {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">תאריך קבלה</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 focus:ring-primary focus:border-primary sm:text-sm" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אסמכתא / מס' צ'ק</label>
                        <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 focus:ring-primary focus:border-primary sm:text-sm" placeholder={method === PaymentMethod.CHECK ? 'חובה' : ''} />
                    </div>
                </div>

                {method === PaymentMethod.CHECK && (
                    <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                        <label className="block text-sm font-bold text-yellow-800">תאריך פירעון הצ'ק</label>
                        <input type="date" value={repaymentDate} onChange={e => setRepaymentDate(e.target.value)} className="mt-1 block w-full rounded-md border-yellow-300 shadow-sm focus:ring-yellow-500 p-2 sm:text-sm" required />
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-700">הערה</label>
                    <input type="text" value={note} onChange={e => setNote(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 focus:ring-primary focus:border-primary sm:text-sm" />
                </div>
                <div className="flex justify-end pt-2">
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-indigo-700 text-sm font-bold shadow-sm">קלוט תשלום</button>
                </div>
            </form>
            <div className="flex justify-end pt-4 border-t border-slate-100">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300">סגור</button>
            </div>
        </div>
    );
};

const readFileAsAttachment = (file: File): Promise<Attachment> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                resolve({
                    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                    fileName: file.name,
                    dataUrl: e.target.result as string,
                    type: file.type,
                });
            } else reject(new Error('Failed to read file'));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
};

const CheckActionModal: React.FC<{
    check: AggregatedCheck;
    onUpdateStatus: (check: AggregatedCheck, newStatus: TransactionStatus, metadata?: any) => void;
    onClose: () => void;
    viewOnlyHistory?: boolean;
    onViewAttachment?: (att: Attachment) => void;
}> = ({ check, onUpdateStatus, onClose, viewOnlyHistory = false, onViewAttachment }) => {
    const [selectedStatus, setSelectedStatus] = useState<TransactionStatus>(check.status);
    const [note, setNote] = useState('');
    const [bounceFee, setBounceFee] = useState<number>(0);
    const [addFee, setAddFee] = useState(false);
    const [checkAttachments, setCheckAttachmentsState] = useState<Attachment[]>([]);
    const [loadingAttachments, setLoadingAttachments] = useState(true);
    const isIncoming = check.type === 'INCOMING';

    useEffect(() => {
        let cancelled = false;
        setLoadingAttachments(true);
        mongoService.getCheckAttachments(check.uniqueId).then((list) => {
            if (!cancelled) setCheckAttachmentsState(list);
        }).catch(() => {
            if (!cancelled) setCheckAttachmentsState([]);
        }).finally(() => {
            if (!cancelled) setLoadingAttachments(false);
        });
        return () => { cancelled = true; };
    }, [check.uniqueId]);

    const saveCheckAttachments = useCallback((list: Attachment[]) => {
        mongoService.setCheckAttachments(check.uniqueId, list).then(() => setCheckAttachmentsState(list)).catch((err) => {
            console.error('Failed to save check attachments:', err);
            alert(err?.message || 'שגיאה בשמירת הקבצים.');
        });
    }, [check.uniqueId]);

    const handleCheckFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const newOnes: Attachment[] = [];
        for (let i = 0; i < files.length; i++) {
            try {
                newOnes.push(await readFileAsAttachment(files[i]));
            } catch (_) { /* skip */ }
        }
        const next = [...checkAttachments, ...newOnes];
        saveCheckAttachments(next);
        e.target.value = '';
    };

    const statusOptions: { value: TransactionStatus; label: string; color: string }[] = [
        { value: 'PENDING', label: isIncoming ? 'ביד (ממתין להפקדה)' : 'נמסר (טרם נפרע)', color: 'bg-yellow-100 text-yellow-800' },
        ...(isIncoming ? [{ value: 'IN_BANK_CUSTODY' as TransactionStatus, label: 'הופקד בבנק (משמורת)', color: 'bg-blue-100 text-blue-800' }] : []),
        { value: 'CLEARED', label: 'נפרע (כסף עבר)', color: 'bg-green-100 text-green-800' },
        { value: 'BOUNCED', label: 'חזר (א.כ.מ / מוגבל)', color: 'bg-red-100 text-red-800' },
        { value: 'CANCELED', label: 'בוטל', color: 'bg-gray-200 text-gray-800' },
        { value: 'RETURNED', label: 'הוחזר פיזית ללקוח/ספק', color: 'bg-orange-100 text-orange-800' },
    ];

    const getStatusLabel = (s: string) => statusOptions.find(opt => opt.value === s)?.label || s;
    const handleSubmit = () => { onUpdateStatus(check, selectedStatus, { note, bounceFee: addFee ? bounceFee : 0 }); onClose(); };

    return (
        <Modal title={`פרטי צ'ק - ${check.reference}`} onClose={onClose} size="lg">
            <div className="space-y-6 text-start">
                <div className="bg-slate-50 p-4 rounded border border-slate-200 flex justify-between">
                    <div>
                        <p className="text-sm text-slate-500">שם: <strong>{check.entityName}</strong></p>
                        <p className="text-sm text-slate-500">תאריך פירעון: <strong>{new Date(check.repaymentDate).toLocaleDateString('he-IL')}</strong></p>
                        {check.sources.length > 1 && (
                            <p className="text-xs text-slate-400 mt-1">צ'ק מרוכז המכסה {check.sources.length} פריטים/הזמנות</p>
                        )}
                    </div>
                    <div className="text-left">
                        <p className="text-xl font-bold text-slate-800">₪{check.amount.toLocaleString()}</p>
                        <span className={`text-xs px-2 py-1 rounded ${statusOptions.find(s => s.value === check.status)?.color}`}>
                            {getStatusLabel(check.status)}
                        </span>
                    </div>
                </div>
                {!viewOnlyHistory && (
                    <div className="border-b border-slate-200 pb-6 mb-6">
                        <h4 className="font-bold text-slate-800 mb-3">עדכון סטטוס</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                            {statusOptions.map(opt => (
                                <div key={opt.value} onClick={() => setSelectedStatus(opt.value)} className={`p-3 rounded border cursor-pointer flex items-center justify-between transition-all ${selectedStatus === opt.value ? 'ring-2 ring-primary border-primary bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <span className={`text-sm font-medium ${selectedStatus === opt.value ? 'text-primary' : 'text-slate-600'}`}>{opt.label}</span>
                                    {selectedStatus === opt.value && <div className="w-3 h-3 bg-primary rounded-full"></div>}
                                </div>
                            ))}
                        </div>
                        {selectedStatus === 'BOUNCED' && isIncoming && (
                            <div className="bg-red-50 p-4 rounded border border-red-200 mb-4 animate-fadeIn">
                                <div className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" id="addFee" checked={addFee} onChange={e => setAddFee(e.target.checked)} className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500" />
                                    <label htmlFor="addFee" className="text-sm font-bold text-red-800">האם לחייב את הלקוח בעמלת החזרת צ'ק?</label>
                                </div>
                                {addFee && (
                                    <div>
                                        <label className="block text-xs text-red-700 mb-1">סכום העמלה (₪)</label>
                                        <input type="number" value={bounceFee} onChange={e => setBounceFee(Number(e.target.value))} className="w-32 text-sm border-red-300 rounded focus:border-red-500" />
                                    </div>
                                )}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">הערות לשינוי</label>
                            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2" />
                        </div>
                        <div className="flex justify-end pt-4 gap-2">
                            <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200">ביטול</button>
                            <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded hover:bg-indigo-700 font-bold">עדכן סטטוס</button>
                        </div>
                    </div>
                )}
                <div className="border-b border-slate-200 pb-6 mb-6">
                    <h4 className="font-bold text-slate-800 mb-3">תמונה / PDF של הצ'ק</h4>
                    {loadingAttachments ? (
                        <p className="text-sm text-slate-500">טוען...</p>
                    ) : (
                        <>
                            <input type="file" multiple accept="image/*,.pdf" onChange={handleCheckFileChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                            <p className="text-[10px] text-slate-400 mt-1">תמונות או PDF. ניתן לבחור מספר קבצים.</p>
                            {checkAttachments.length > 0 && (
                                <ul className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                                    {checkAttachments.map((att) => (
                                        <li key={att.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg">
                                            <span className="text-xs font-bold text-slate-700 truncate flex-1 min-w-0">{att.fileName}</span>
                                            <div className="flex gap-2 shrink-0">
                                                {onViewAttachment && <button type="button" onClick={() => onViewAttachment(att)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded font-bold text-indigo-600 hover:bg-indigo-50">צפה</button>}
                                                <button type="button" onClick={() => saveCheckAttachments(checkAttachments.filter((a) => a.id !== att.id))} className="text-[10px] text-red-500 font-bold px-2 py-1 hover:bg-red-50 rounded">הסר</button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
                <div>
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center">
                        <ClockIcon className="w-4 h-4 me-2 text-slate-500"/> היסטוריית גלגול הצ'ק
                    </h4>
                    <div className="space-y-4 max-h-60 overflow-y-auto px-1 custom-scrollbar">
                        {check.statusHistory && check.statusHistory.length > 0 ? (
                            [...check.statusHistory].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((entry, idx) => (
                                <div key={idx} className="flex gap-3 relative">
                                    {idx !== check.statusHistory.length - 1 && <div className="absolute top-8 right-[15px] bottom-[-20px] w-0.5 bg-slate-200"></div>}
                                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 l-10 text-xs font-bold text-slate-500">{check.statusHistory.length - idx}</div>
                                    <div className="flex-1 bg-white p-3 rounded border border-slate-100 shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <span className="text-sm font-bold text-slate-800">{getStatusLabel(entry.status)}</span>
                                            <span className="text-xs text-slate-400">{new Date(entry.date).toLocaleString('he-IL')}</span>
                                        </div>
                                        {entry.reason && <div className="mt-2 text-sm text-slate-600 bg-slate-50 p-2 rounded">{entry.reason}</div>}
                                    </div>
                                </div>
                            ))
                        ) : <div className="text-center py-4 text-slate-400 text-sm bg-slate-50 rounded">אין היסטוריית שינויים.</div>}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const CheckCenter: React.FC<{
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    fixedExpenses: FixedExpense[];
    setFixedExpenses: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
    variableExpenses: VariableExpense[];
    setVariableExpenses: React.Dispatch<React.SetStateAction<VariableExpense[]>>;
    debts: Debt[];
    setDebts: React.Dispatch<React.SetStateAction<Debt[]>>;
    receivables: Receivable[];
    setReceivables: React.Dispatch<React.SetStateAction<Receivable[]>>;
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
    /** When true, show only incoming checks (for MANAGER/EMPLOYEE). */
    incomingOnly?: boolean;
    /** Open file preview for a check attachment (image/PDF). */
    onViewCheckAttachment?: (att: Attachment) => void;
    /** Open quick view for all attachments of a check (from row eye icon). */
    onViewCheckAttachments?: (attachments: Attachment[]) => void;
}> = ({ orders, setOrders, fixedExpenses, setFixedExpenses, variableExpenses, setVariableExpenses, debts, setDebts, receivables, setReceivables, addActivity, incomingOnly = false, onViewCheckAttachment, onViewCheckAttachments }) => {
    const [tab, setTab] = useState<'INCOMING' | 'OUTGOING'>(incomingOnly ? 'INCOMING' : 'INCOMING');
    // SMART FILTER: Active (Actionable), Urgent (Overdue/Bounced), Archive (History), All
    const [smartFilter, setSmartFilter] = useState<'ACTIVE' | 'URGENT' | 'ARCHIVE' | 'ALL'>('ACTIVE');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCheck, setSelectedCheck] = useState<{check: AggregatedCheck, viewOnly: boolean} | null>(null);
    
    // Pagination states
    const [paginatedChecks, setPaginatedChecks] = useState<AggregatedCheck[]>([]);
    const [checksCurrentPage, setChecksCurrentPage] = useState(1);
    const [checksPageSize, setChecksPageSize] = useState(50);
    const [checksTotalCount, setChecksTotalCount] = useState(0);
    const [loadingChecks, setLoadingChecks] = useState(false);
    const [checksStats, setChecksStats] = useState({ pending: 0, bounced: 0, overdue: 0, filteredTotal: 0 });

    // Refetch paginated checks
    const refetchChecks = useCallback(async () => {
        try {
            setLoadingChecks(true);
            const filters: any = {};
            if (incomingOnly) filters.tab = 'INCOMING';
            else if (tab) filters.tab = tab;
            if (smartFilter) filters.smartFilter = smartFilter;
            if (searchQuery) filters.searchQuery = searchQuery;
            
            const result = await mongoService.getChecksPaginated(filters, checksCurrentPage, checksPageSize);
            
            // Convert server checks to AggregatedCheck format (convert dates)
            const convertedChecks: AggregatedCheck[] = result.checks.map((c: any) => ({
                ...c,
                date: new Date(c.date),
                repaymentDate: new Date(c.repaymentDate),
                hasAttachments: !!c.hasAttachments
            }));
            
            setPaginatedChecks(convertedChecks);
            setChecksTotalCount(result.totalCount);
            setChecksStats(result.stats);
        } catch (error) {
            console.error('Error loading paginated checks:', error);
        } finally {
            setLoadingChecks(false);
        }
    }, [tab, smartFilter, searchQuery, checksCurrentPage, checksPageSize, incomingOnly]);
    
    // Load paginated checks when filters or pagination change
    useEffect(() => {
        refetchChecks();
    }, [refetchChecks]);

    // Keep old allChecks for backward compatibility (but we won't use it for display)
    const allChecks = useMemo<AggregatedCheck[]>(() => {
        const rawItems: AggregatedCheck[] = [];
        
        orders.forEach(order => {
            order.payments.forEach(p => {
                if (p.method === PaymentMethod.CHECK) {
                    rawItems.push({
                        uniqueId: p.id,
                        type: 'INCOMING',
                        date: new Date(p.date),
                        repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                        amount: p.amount,
                        reference: p.reference || 'ללא מס',
                        entityName: `לקוח (הזמנה ${order.orderNumber})`,
                        status: p.status || 'PENDING',
                        statusHistory: p.statusHistory || [],
                        sources: [{
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            paymentId: p.id,
                            amount: p.amount
                        }]
                    });
                }
            });

            const processOutgoing = (items: any[], type: 'lineItem' | 'additionalService') => {
                items.forEach((item, idx) => {
                    item.supplierPayments?.forEach((p: SupplierPayment) => {
                        if (p.method === PaymentMethod.CHECK) {
                            rawItems.push({
                                uniqueId: p.id,
                                type: 'OUTGOING',
                                date: new Date(p.date),
                                repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                                amount: p.amount,
                                reference: p.reference || 'ללא מס',
                                entityName: `ספק (הזמנה ${order.orderNumber})`,
                                status: p.status || 'PENDING',
                                statusHistory: p.statusHistory || [],
                                sources: [{
                                    orderId: order.id,
                                    orderNumber: order.orderNumber,
                                    paymentId: p.id,
                                    sourceIndex: idx,
                                    sourceType: type,
                                    amount: p.amount
                                }]
                            });
                        }
                    });
                });
            };
            processOutgoing(order.lineItems, 'lineItem');
            processOutgoing(order.additionalServices, 'additionalService');
        });

        receivables.forEach(receivable => {
            receivable.payments?.forEach(p => {
                if (p.method === PaymentMethod.CHECK) {
                    rawItems.push({
                        uniqueId: p.id,
                        type: 'INCOMING',
                        date: new Date(p.date),
                        repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                        amount: p.amount,
                        reference: p.reference || 'ללא מס',
                        entityName: `חייב: ${receivable.name}`,
                        status: p.status || 'PENDING',
                        statusHistory: p.statusHistory || [],
                        sources: [{
                            orderId: 'REC',
                            orderNumber: 'RECEIVABLE',
                            paymentId: p.id,
                            sourceType: 'receivable',
                            receivableId: receivable.id,
                            amount: p.amount
                        }]
                    });
                }
            });
        });

        fixedExpenses.forEach(fe => {
            fe.checks?.forEach(p => {
                rawItems.push({
                    uniqueId: p.id,
                    type: 'OUTGOING',
                    date: new Date(p.date),
                    repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                    amount: p.amount,
                    reference: p.reference || 'ללא מס',
                    entityName: `הוצאה קבועה: ${fe.name}`,
                    status: p.status || 'PENDING',
                    statusHistory: p.statusHistory || [],
                    sources: [{
                        orderId: 'FIXED',
                        orderNumber: 'FIXED',
                        paymentId: p.id,
                        sourceType: 'fixedExpense',
                        fixedExpenseId: fe.id,
                        amount: p.amount
                    }]
                });
            });
        });

        variableExpenses.forEach(ve => {
            ve.checks?.forEach(p => {
                rawItems.push({
                    uniqueId: p.id,
                    type: 'OUTGOING',
                    date: new Date(p.date),
                    repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                    amount: p.amount,
                    reference: p.reference || 'ללא מס',
                    entityName: `הוצאה משתנה: ${ve.name}`,
                    status: p.status || 'PENDING',
                    statusHistory: p.statusHistory || [],
                    sources: [{
                        orderId: 'VAR',
                        orderNumber: 'VAR',
                        paymentId: p.id,
                        sourceType: 'variableExpense',
                        variableExpenseId: ve.id,
                        amount: p.amount
                    }]
                });
            });
        });

        const incoming = rawItems.filter(i => i.type === 'INCOMING');
        const outgoing = rawItems.filter(i => i.type === 'OUTGOING');
        
        const groupedMap = new Map<string, AggregatedCheck>();
        
        outgoing.forEach(item => {
            const key = `${item.reference}_${item.repaymentDate.getTime()}`;
            
            if (groupedMap.has(key)) {
                const existing = groupedMap.get(key)!;
                existing.amount += item.amount;
                existing.sources = [...existing.sources, ...item.sources];
                
                if (!existing.entityName.includes(item.entityName)) {
                    if (existing.sources.length <= 3) {
                         existing.entityName += `, ${item.entityName}`;
                    } else if (!existing.entityName.includes('מרוכז')) {
                         existing.entityName = `תשלום מרוכז (צ'ק ${item.reference})`;
                    }
                }
            } else {
                groupedMap.set(key, { ...item });
            }
        });

        return [...incoming, ...Array.from(groupedMap.values())];
    }, [orders, fixedExpenses, variableExpenses, debts, receivables]);

    // Use stats from server
    const stats = checksStats;

    const handleUpdateCheckStatus = (check: AggregatedCheck, newStatus: TransactionStatus, metadata?: any) => {
        if (check.status === newStatus) return;

        let updatedOrders = [...orders];
        let updatedFixed = [...fixedExpenses];
        let updatedVariable = [...variableExpenses];
        let updatedDebts = [...debts];
        let updatedReceivables = [...receivables];

        check.sources.forEach(source => {
            if (source.sourceType === 'debt') {
                updatedDebts = updatedDebts.map(debt => {
                    if (debt.id !== source.debtId) return debt;
                    const updatedPayments = (debt.payments || []).map(p => {
                        if (p.id !== source.paymentId) return p;
                        return { 
                            ...p, 
                            status: newStatus, 
                            statusHistory: [...(p.statusHistory || []), { date: new Date(), status: newStatus, changedBy: 'משתמש', reason: metadata?.note }] 
                        };
                    });
                    return { ...debt, payments: updatedPayments };
                });
            } else if (source.sourceType === 'receivable') {
                updatedReceivables = updatedReceivables.map(rec => {
                    if (rec.id !== source.receivableId) return rec;
                    const updatedPayments = (rec.payments || []).map(p => {
                        if (p.id !== source.paymentId) return p;
                        return { 
                            ...p, 
                            status: newStatus, 
                            statusHistory: [...(p.statusHistory || []), { date: new Date(), status: newStatus, changedBy: 'משתמש', reason: metadata?.note }] 
                        };
                    });
                    return { ...rec, payments: updatedPayments };
                });
            } else if (source.sourceType === 'fixedExpense') {
                updatedFixed = updatedFixed.map(fe => {
                    if (fe.id !== source.fixedExpenseId) return fe;
                    const updatedChecks = (fe.checks || []).map(p => {
                        if (p.id !== source.paymentId) return p;
                        return { ...p, status: newStatus, statusHistory: [...(p.statusHistory || []), { date: new Date(), status: newStatus, changedBy: 'משתמש', reason: metadata?.note }] };
                    });
                    return { ...fe, checks: updatedChecks };
                });
            } else if (source.sourceType === 'variableExpense') {
                updatedVariable = updatedVariable.map(ve => {
                    if (ve.id !== source.variableExpenseId) return ve;
                    const updatedChecks = (ve.checks || []).map(p => {
                        if (p.id !== source.paymentId) return p;
                        return { ...p, status: newStatus, statusHistory: [...(p.statusHistory || []), { date: new Date(), status: newStatus, changedBy: 'משתמש', reason: metadata?.note }] };
                    });
                    return { ...ve, checks: updatedChecks };
                });
            } else {
                const orderIndex = updatedOrders.findIndex(o => o.id === source.orderId);
                if (orderIndex === -1) return;
                const order = { ...updatedOrders[orderIndex] };
                
                const updatePaymentObj = (payment: any) => {
                    if (payment.id !== source.paymentId) return payment;
                    return { ...payment, status: newStatus, statusHistory: [...(payment.statusHistory || []), { date: new Date(), status: newStatus, changedBy: 'משתמש', reason: metadata?.note }] };
                };

                if (check.type === 'INCOMING') {
                    order.payments = order.payments.map(updatePaymentObj);
                    if (newStatus === 'BOUNCED' && metadata?.bounceFee > 0) {
                        order.lineItems = [...order.lineItems, { id: `li_fee_${Date.now()}`, description: `עמלת החזרת צ'ק (מס' ${check.reference})`, quantity: 1, unitPrice: metadata.bounceFee, cost: 0, unitType: LineItemUnit.UNIT }];
                    }
                } else {
                    if (source.sourceType === 'lineItem') {
                        const items = [...order.lineItems];
                        items[source.sourceIndex!].supplierPayments = items[source.sourceIndex!].supplierPayments?.map(updatePaymentObj);
                        order.lineItems = items;
                    } else {
                        const items = [...order.additionalServices];
                        items[source.sourceIndex!].supplierPayments = items[source.sourceIndex!].supplierPayments?.map(updatePaymentObj);
                        order.additionalServices = items;
                    }
                }
                updatedOrders[orderIndex] = order;
            }
        });

        setOrders(updatedOrders);
        setFixedExpenses(updatedFixed);
        setVariableExpenses(updatedVariable);
        setDebts(updatedDebts);
        setReceivables(updatedReceivables);
        
        addActivity(`סטטוס צ'ק ${check.reference} (${check.type === 'INCOMING' ? 'נכנס' : 'יוצא'}) עודכן ל-${newStatus}`, { entityType: 'finance', action: 'status_change', metadata: { reference: check.reference, type: check.type, newStatus } });
        
        // Refetch checks to reflect the updated status
        refetchChecks();
    };

    const getStatusBadge = (status: TransactionStatus) => {
        switch (status) {
            case 'PENDING': return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-bold shadow-sm border border-yellow-200">ביד</span>;
            case 'CLEARED': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold shadow-sm border border-green-200">נפרע</span>;
            case 'BOUNCED': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold animate-pulse shadow-sm border border-red-200">חזר</span>;
            case 'IN_BANK_CUSTODY': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold shadow-sm border border-blue-200">במשמורת</span>;
            case 'RETURNED': return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold shadow-sm border border-orange-200">הוחזר</span>;
            case 'CANCELED': return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-bold shadow-sm border border-gray-200">בוטל</span>;
            default: return <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs">{status}</span>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">סה"כ פתוח ({tab === 'INCOMING' ? 'נכנס' : 'יוצא'})</p>
                    <p className="text-2xl font-black text-slate-800">₪{stats.pending.toLocaleString()}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200 shadow-sm">
                    <p className="text-[10px] text-red-700 font-bold uppercase tracking-widest">בפיגור / באיחור</p>
                    <p className="text-2xl font-black text-red-800">₪{stats.overdue.toLocaleString()}</p>
                </div>
                <div className="bg-red-100 p-4 rounded-lg border border-red-300 shadow-sm animate-pulse">
                    <p className="text-[10px] text-red-900 font-bold uppercase tracking-widest">צ'קים שחזרו</p>
                    <p className="text-2xl font-black text-red-900">₪{stats.bounced.toLocaleString()}</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 shadow-sm">
                    <p className="text-[10px] text-indigo-700 font-bold uppercase tracking-widest">בסינון הנוכחי</p>
                    <p className="text-2xl font-black text-indigo-800">₪{stats.filteredTotal.toLocaleString()}</p>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                {!incomingOnly && (
                <div className="flex border-b border-slate-200 px-4 pt-2 bg-slate-50/50">
                    <button onClick={() => { setTab('INCOMING'); setChecksCurrentPage(1); }} className={`px-4 py-3 font-black text-sm border-b-2 transition-colors ${tab === 'INCOMING' ? 'border-green-500 text-green-700' : 'border-transparent text-slate-500'}`}>צ'קים נכנסים</button>
                    <button onClick={() => { setTab('OUTGOING'); setChecksCurrentPage(1); }} className={`px-4 py-3 font-black text-sm border-b-2 transition-colors ${tab === 'OUTGOING' ? 'border-red-500 text-red-700' : 'border-transparent text-slate-500'}`}>צ'קים יוצאים</button>
                </div>
                )}
                
                {/* SMART LIFECYCLE FILTERS */}
                <div className="p-4 border-b border-slate-200 bg-white grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">תור עבודה חכם (Queue)</label>
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            {(['ACTIVE', 'URGENT', 'ARCHIVE', 'ALL'] as const).map(f => (
                                <button 
                                    key={f} 
                                    onClick={() => { setSmartFilter(f); setSearchQuery(''); setChecksCurrentPage(1); }}
                                    className={`flex-1 text-xs font-black py-2.5 px-2 rounded-md transition-all ${smartFilter === f ? 'bg-white text-primary shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {f === 'ACTIVE' ? 'בתהליך (פתוחים)' : f === 'URGENT' ? 'בטיפול דחוף' : f === 'ARCHIVE' ? 'ארכיון (היסטוריה)' : 'הכל'}
                                </button>
                            ))}
                        </div>
                        <p className="text-[9px] text-slate-400 font-medium italic">
                            {smartFilter === 'ACTIVE' && '* מציג את כל הצ׳קים שטרם נפרעו (כולל עתידיים רחוקים)'}
                            {smartFilter === 'URGENT' && '* מציג רק צ׳קים שחזרו או שעבר תאריך פירעונם'}
                            {smartFilter === 'ARCHIVE' && '* מציג צ׳קים שכבר נפרעו, בוטלו או הוחזרו'}
                        </p>
                    </div>
                    <div className="relative">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">חיפוש גלובלי (מספר צ'ק / שם גורם)</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="חפש מספר צ'ק, ספק או לקוח..." 
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setChecksCurrentPage(1); }}
                                className="w-full text-sm border-slate-300 rounded-lg focus:ring-primary focus:border-primary p-2.5 pl-10 shadow-sm"
                            />
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-300">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[400px]">
                    <table className="min-w-full text-sm text-right">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest sticky top-0 z-10 border-b">
                            <tr><th className="px-6 py-4">תאריך פירעון</th><th className="px-6 py-4">מספר צ'ק</th><th className="px-6 py-4">משויך / גורם</th><th className="px-6 py-4">סכום</th><th className="px-6 py-4">סטטוס</th><th className="px-6 py-4 text-left">פעולות</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loadingChecks && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-32 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-400">
                                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                                            <p className="text-sm font-medium">טוען צ'קים...</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loadingChecks && paginatedChecks.map(check => {
                                const today = new Date();
                                today.setHours(0,0,0,0);
                                const isOverdue = ['PENDING', 'IN_BANK_CUSTODY'].includes(check.status) && check.repaymentDate < today;
                                const isBounced = check.status === 'BOUNCED';
                                
                                return (
                                    <tr key={check.uniqueId} className={`hover:bg-slate-50 transition-colors group ${isOverdue ? 'bg-red-50/10' : ''} ${isBounced ? 'bg-red-100/20 font-bold' : ''}`}>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className={`font-black ${isOverdue ? 'text-red-600 underline decoration-dotted' : isBounced ? 'text-red-700' : 'text-slate-700'}`}>
                                                    {check.repaymentDate.toLocaleDateString('he-IL')}
                                                </span>
                                                {isOverdue && <span className="text-[9px] font-black text-red-500 uppercase tracking-tighter mt-0.5">⚠️ עבר זמן פירעון</span>}
                                                {isBounced && <span className="text-[9px] font-black text-red-700 uppercase tracking-tighter mt-0.5">🚨 חזר מהבנק</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono font-bold text-slate-500">{check.reference}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800">{check.entityName}</span>
                                                {check.sources.length > 1 && <span className="text-[10px] text-slate-400">תשלום מרוכז ({check.sources.length} פריטים)</span>}
                                            </div>
                                        </td>
                                        <td className={`px-6 py-4 font-black text-lg ${isBounced ? 'text-red-700' : 'text-slate-900'}`}>₪{check.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4">{getStatusBadge(check.status)}</td>
                                        <td className="px-6 py-4 text-left">
                                            <div className="flex items-center gap-2 justify-end">
                                                {check.hasAttachments && (
                                                    <>
                                                        <span className="text-slate-400" title="מצורף תמונה/PDF לצ'ק">
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                mongoService.getCheckAttachments(check.uniqueId).then(atts => {
                                                                    if (atts.length && onViewCheckAttachments) {
                                                                        onViewCheckAttachments(atts);
                                                                    }
                                                                });
                                                            }}
                                                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                            title="צפייה מהירה במצורפים"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                        </button>
                                                    </>
                                                )}
                                                <button onClick={() => setSelectedCheck({check, viewOnly: false})} className="bg-white hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-lg border border-indigo-200 text-primary text-xs font-black shadow-sm transition-all group-hover:shadow-md">ניהול צ'ק</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loadingChecks && paginatedChecks.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-32 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-400 opacity-60">
                                            <CashIcon className="w-16 h-16 text-slate-200" />
                                            <div className="max-w-xs">
                                                <p className="font-black text-lg">לא נמצאו צ'קים</p>
                                                <p className="text-sm">לא נמצאו פריטים העונים על תנאי הסינון או החיפוש. נסה לשנות את תור העבודה או לנקות את החיפוש.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination Controls */}
                {checksTotalCount > 0 && (
                    <div className="p-4 border-t border-slate-200 bg-white flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="text-sm text-slate-600">
                            מציג {((checksCurrentPage - 1) * checksPageSize) + 1} - {Math.min(checksCurrentPage * checksPageSize, checksTotalCount)} מתוך {checksTotalCount} צ'קים
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-600">פריטים לעמוד:</label>
                                <select 
                                    value={checksPageSize}
                                    onChange={(e) => {
                                        setChecksPageSize(Number(e.target.value));
                                        setChecksCurrentPage(1);
                                    }}
                                    className="border border-slate-300 rounded-md px-2 py-1 text-sm focus:ring-primary focus:border-primary"
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={200}>200</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setChecksCurrentPage(1)}
                                    disabled={checksCurrentPage === 1 || loadingChecks}
                                    className="px-3 py-1.5 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    ראשון
                                </button>
                                <button 
                                    onClick={() => setChecksCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={checksCurrentPage === 1 || loadingChecks}
                                    className="px-3 py-1.5 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    קודם
                                </button>
                                <span className="px-3 py-1.5 text-sm font-medium text-slate-700">
                                    עמוד {checksCurrentPage} מתוך {Math.ceil(checksTotalCount / checksPageSize) || 1}
                                </span>
                                <button 
                                    onClick={() => setChecksCurrentPage(prev => Math.min(Math.ceil(checksTotalCount / checksPageSize) || 1, prev + 1))}
                                    disabled={checksCurrentPage >= Math.ceil(checksTotalCount / checksPageSize) || loadingChecks}
                                    className="px-3 py-1.5 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    הבא
                                </button>
                                <button 
                                    onClick={() => setChecksCurrentPage(Math.ceil(checksTotalCount / checksPageSize) || 1)}
                                    disabled={checksCurrentPage >= Math.ceil(checksTotalCount / checksPageSize) || loadingChecks}
                                    className="px-3 py-1.5 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    אחרון
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {selectedCheck && <CheckActionModal check={selectedCheck.check} onClose={() => setSelectedCheck(null)} onUpdateStatus={handleUpdateCheckStatus} viewOnlyHistory={selectedCheck.viewOnly} onViewAttachment={onViewCheckAttachment} />}
        </div>
    );
};

const CheckSeriesGenerator: React.FC<{ 
    initialAmount: number; 
    onGenerated: (checks: SupplierPayment[]) => void 
}> = ({ initialAmount, onGenerated }) => {
    const [count, setCount] = useState(12);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [startRef, setStartRef] = useState('');
    const [amountPerCheck, setAmountPerCheck] = useState(initialAmount);

    useEffect(() => {
        setAmountPerCheck(initialAmount);
    }, [initialAmount]);

    const handleGenerate = () => {
        const checks: SupplierPayment[] = [];
        const startNum = parseInt(startRef) || 1001;
        const baseDate = new Date(startDate);

        for (let i = 0; i < count; i++) {
            const dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
            checks.push({
                id: `sp_fix_${Date.now()}_${i}`,
                amount: amountPerCheck,
                date: new Date(),
                repaymentDate: dueDate,
                method: PaymentMethod.CHECK,
                reference: (startNum + i).toString(),
                status: 'PENDING',
                statusHistory: []
            });
        }
        onGenerated(checks);
    };

    return (
        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 space-y-4">
            <h4 className="font-bold text-indigo-900 text-sm">מחולל סדרת צ'קים מהיר</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                    <label className="block text-[10px] font-bold text-indigo-600 mb-1">סכום לכל צ'ק</label>
                    <input type="number" value={amountPerCheck} onChange={e => setAmountPerCheck(Number(e.target.value))} className="w-full text-sm rounded border-indigo-200 font-bold p-1" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-indigo-600 mb-1">מס' תשלומים</label>
                    <input type="number" value={count} onChange={e => setCount(Number(e.target.value))} className="w-full text-sm rounded border-indigo-200 p-1" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-indigo-600 mb-1">פירעון ראשון</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-sm rounded border-indigo-200 p-1" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-indigo-600 mb-1">מספר צ'ק התחלתי</label>
                    <input type="text" value={startRef} onChange={e => setStartRef(e.target.value)} placeholder="1001" className="w-full text-sm rounded border-indigo-200 p-1" />
                </div>
            </div>
            <button type="button" onClick={handleGenerate} className="w-full bg-indigo-600 text-white py-2 rounded font-bold text-xs shadow-sm hover:bg-indigo-700">ייצר סדרת צ'קים</button>
        </div>
    );
};

const FinancePage: React.FC<FinancePageProps> = ({ 
    fixedExpenses, setFixedExpenses, variableExpenses, setVariableExpenses, loans, setLoans, debts, setDebts, receivables, setReceivables, equity, setEquity, addActivity, vatRate, orders, setOrders, employees, attendanceRecords, statusConfigs, payrollOverrides, onNavigateToOrder
}) => {
    const { user } = useAuth();
    const isChecksOnlyUser = user?.roleType === 'MANAGER' || user?.roleType === 'EMPLOYEE';

    const [activeTab, setActiveTab] = useState<'FIXED' | 'VARIABLE' | 'LOANS' | 'DEBTS' | 'RECEIVABLES' | 'EQUITY' | 'CHECKS' | 'PNL'>('PNL');
    const [pnlOrders, setPnlOrders] = useState<Order[] | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isAmortizationModalOpen, setIsAmortizationModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedDebtForPayment, setSelectedDebtForPayment] = useState<Debt | null>(null);
    const [selectedReceivableForCollection, setSelectedReceivableForCollection] = useState<Receivable | null>(null);
    const [selectedLoanForAmortization, setSelectedLoanForAmortization] = useState<Loan | null>(null);
    const [selectedCheckForDebt, setSelectedCheckForDebt] = useState<{check: AggregatedCheck, viewOnly: boolean} | null>(null);
    const [viewingLoanDoc, setViewingLoanDoc] = useState<Attachment | null>(null);
    const [viewingAttachmentList, setViewingAttachmentList] = useState<Attachment[] | null>(null);
    const [viewingAttachmentIndex, setViewingAttachmentIndex] = useState(0);
    
    // Preview state for manual loan calculation
    const [showLoanPreview, setShowLoanPreview] = useState(false);

    // Debt Filter States
    const [debtSearch, setDebtSearch] = useState('');
    const [debtStatusFilter, setDebtStatusFilter] = useState<'ALL' | 'OPEN' | 'OVERDUE' | 'PAID'>('OPEN');
    
    // Debt Pagination States
    const [paginatedDebts, setPaginatedDebts] = useState<(Debt & { gross: number; paid: number; remaining: number; isFullyPaid: boolean; isOverdue: boolean })[]>([]);
    const [debtsCurrentPage, setDebtsCurrentPage] = useState(1);
    const [debtsPageSize, setDebtsPageSize] = useState(50);
    const [debtsTotalCount, setDebtsTotalCount] = useState(0);
    const [loadingDebts, setLoadingDebts] = useState(false);

    // Receivable Filter States
    const [receivableSearch, setReceivableSearch] = useState('');
    const [receivableStatusFilter, setReceivableStatusFilter] = useState<'ALL' | 'OPEN' | 'OVERDUE' | 'PAID'>('OPEN');
    
    // Receivable Pagination States
    const [paginatedReceivables, setPaginatedReceivables] = useState<(Receivable & { gross: number; collected: number; remaining: number; isFullyPaid: boolean; isOverdue: boolean })[]>([]);
    const [receivablesCurrentPage, setReceivablesCurrentPage] = useState(1);
    const [receivablesPageSize, setReceivablesPageSize] = useState(50);
    const [receivablesTotalCount, setReceivablesTotalCount] = useState(0);
    const [loadingReceivables, setLoadingReceivables] = useState(false);

    const [equityLogs, setEquityLogs] = useState<AuditLogEntry[]>(() => {
        const saved = localStorage.getItem('equity_audit_logs');
        return saved ? JSON.parse(saved) : [];
    });
    useEffect(() => { localStorage.setItem('equity_audit_logs', JSON.stringify(equityLogs)); }, [equityLogs]);

    const [vMonthFilter, setVMonthFilter] = useState<string | number>(new Date().getMonth() + 1);
    const [vYearFilter, setVYearFilter] = useState<string | number>(new Date().getFullYear());

    // Fixed Expenses Pagination States (only when FIXED tab is active)
    const [paginatedFixedActive, setPaginatedFixedActive] = useState<FixedExpense[]>([]);
    const [fixedActiveCurrentPage, setFixedActiveCurrentPage] = useState(1);
    const [fixedActivePageSize, setFixedActivePageSize] = useState(50);
    const [fixedActiveTotalCount, setFixedActiveTotalCount] = useState(0);
    const [loadingFixedActive, setLoadingFixedActive] = useState(false);
    
    const [paginatedFixedHistorical, setPaginatedFixedHistorical] = useState<FixedExpense[]>([]);
    const [fixedHistoricalCurrentPage, setFixedHistoricalCurrentPage] = useState(1);
    const [fixedHistoricalPageSize, setFixedHistoricalPageSize] = useState(50);
    const [fixedHistoricalTotalCount, setFixedHistoricalTotalCount] = useState(0);
    const [loadingFixedHistorical, setLoadingFixedHistorical] = useState(false);

    // Variable Expenses Pagination States (only when VARIABLE tab is active)
    const [paginatedVariableExpenses, setPaginatedVariableExpenses] = useState<VariableDisplayItem[]>([]);
    const [variableCurrentPage, setVariableCurrentPage] = useState(1);
    const [variablePageSize, setVariablePageSize] = useState(50);
    const [variableTotalCount, setVariableTotalCount] = useState(0);
    const [loadingVariable, setLoadingVariable] = useState(false);

    const [fixedForm, setFixedForm] = useState<Partial<FixedExpense>>({});
    const [variableForm, setVariableForm] = useState<Partial<VariableExpense>>({});
    const [loanForm, setLoanForm] = useState<Partial<Loan>>({});
    const [debtForm, setDebtForm] = useState<Partial<Debt>>({});
    const [receivableForm, setReceivableForm] = useState<Partial<Receivable>>({});
    const [equityForm, setEquityForm] = useState<Partial<EquityInvestment>>({});
    const [isNewInvestor, setIsNewInvestor] = useState(false); 
    const [expandedInvestors, setExpandedInvestors] = useState<Set<string>>(new Set());
    const [expandedDebts, setExpandedDebts] = useState<Set<string>>(new Set());
    const [expandedReceivables, setExpandedReceivables] = useState<Set<string>>(new Set());

    // P&L report: same order set as Orders page (getOrdersPaginated with active-deal-only, cap 15k) so הכנסות/עלות המכר match
    useEffect(() => {
        if (activeTab !== 'PNL' || !statusConfigs?.length) return;
        const activeDealLabels = statusConfigs.filter(c => c.isActiveDeal).map(c => c.label);
        const filters = {
            orderStatusFilter: activeDealLabels.length > 0 ? activeDealLabels : undefined,
            showCompletedOrders: true
        };
        mongoService.getOrdersPaginated(filters, 1, 15000)
            .then((result: { orders: Order[] }) => {
                setPnlOrders(result?.orders ?? []);
            })
            .catch((err) => {
                console.error('Error fetching P&L report orders:', err);
                setPnlOrders([]);
            });
    }, [activeTab, statusConfigs]);

    // Available years for Variable Expenses Filter (fixed range: 10 years back, 2 years ahead)
    const vAvailableYears = useMemo(() => {
        const now = new Date().getFullYear();
        const from = now - 10;
        const to = now + 2;
        return Array.from({ length: to - from + 1 }, (_, i) => from + i).sort((a, b) => b - a);
    }, []);

    // Effect for Real-time PMT calculation in Loan Form
    useEffect(() => {
        if (activeTab === 'LOANS' && isModalOpen) {
            const principal = loanForm.principalAmount || 0;
            const rate = loanForm.interestRate || 0;
            const duration = loanForm.durationMonths || 0;
            
            if (principal > 0 && duration > 0) {
                const calculatedPmt = calculatePMT(principal, rate, duration);
                if (calculatedPmt !== loanForm.monthlyPayment) {
                    setLoanForm(prev => ({ ...prev, monthlyPayment: calculatedPmt }));
                }
            }
        }
    }, [loanForm.principalAmount, loanForm.interestRate, loanForm.durationMonths, activeTab, isModalOpen]);

    const totalFixedMonthly = useMemo(() => {
        return fixedExpenses
            .filter(e => e.isActive && (!e.endDate || new Date(e.endDate) >= new Date()))
            .reduce((sum, e) => {
                const amount = e.monthlyAmount || 0;
                if (e.isVatExempt) return sum + amount;
                return sum + (e.includesVat ? amount : amount * (1 + vatRate / 100));
            }, 0);
    }, [fixedExpenses, vatRate]);

    const totalVariableCurrentMonth = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const immediateExpensesSum = variableExpenses.filter(e => {
            const d = new Date(e.date);
            const isThisMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            return isThisMonth && e.paymentMethod !== PaymentMethod.CHECK;
        }).reduce((sum, e) => {
            const amount = e.amount || 0;
            const gross = e.isVatExempt ? amount : (e.includesVat ? amount : amount * (1 + vatRate / 100));
            return sum + gross;
        }, 0);

        const monthlyChecksSum = variableExpenses.reduce((sum, e) => {
            if (!e.checks) return sum;
            const validChecks = e.checks.filter(p => {
                if (!p.repaymentDate) return false;
                const rd = new Date(p.repaymentDate);
                const isThisMonth = rd.getMonth() === currentMonth && rd.getFullYear() === currentYear;
                return isThisMonth && p.status !== 'CANCELED' && p.status !== 'BOUNCED';
            });
            return sum + validChecks.reduce((pSum, p) => pSum + p.amount, 0);
        }, 0);
        
        const debtPaymentsSum = debts.reduce((sum, debt) => {
            if (!debt.payments) return sum;
            return sum + debt.payments.filter(p => { 
                const d = new Date(p.date); 
                const isThisMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                return isThisMonth && (!p.status || !invalidStatuses.includes(p.status)); 
            }).reduce((pSum, p) => pSum + p.amount, 0);
        }, 0);

        return immediateExpensesSum + monthlyChecksSum + debtPaymentsSum;
    }, [variableExpenses, debts, vatRate]);

    const totalLoanBalance = loans.reduce((sum, l) => {
        if (l.schedule && l.schedule.length > 0) {
            const unpaid = l.schedule.filter(s => !s.isPaid).reduce((acc, s) => acc + s.totalMonthlyPayment, 0);
            return sum + unpaid;
        }
        return sum + ((l.monthlyPayment * l.durationMonths) - (l.monthlyPayment * l.paymentsMade));
    }, 0);
    
    const totalDebts = useMemo(() => {
        return debts.reduce((sum, d) => {
            const amount = d.amount || 0;
            let gross = d.isVatExempt ? amount : (d.includesVat ? amount : amount * (1 + vatRate / 100));
            const paidAmount = (d.payments || []).reduce((acc, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return acc;
                return acc + p.amount;
            }, 0);
            const remaining = Math.round((gross - paidAmount) * 100) / 100;
            return sum + (remaining > 0.1 ? remaining : 0);
        }, 0);
    }, [debts, vatRate]);

    const totalReceivables = useMemo(() => {
        return receivables.reduce((sum, r) => {
            const amount = r.amount || 0;
            let gross = r.isVatExempt ? amount : (r.includesVat ? amount : amount * (1 + vatRate / 100));
            const collectedAmount = (r.payments || []).reduce((acc, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return acc;
                return acc + p.amount;
            }, 0);
            const remaining = Math.round((gross - collectedAmount) * 100) / 100;
            return sum + (remaining > 0.1 ? remaining : 0);
        }, 0);
    }, [receivables, vatRate]);

    const equityByInvestor = useMemo(() => {
        const groups: Record<string, { name: string, type: string, totalInvested: number, totalWithdrawn: number, transactions: EquityInvestment[] }> = {};
        equity.forEach(item => {
            if (!groups[item.investorName]) groups[item.investorName] = { name: item.investorName, type: item.type, totalInvested: 0, totalWithdrawn: 0, transactions: [] };
            if (item.transactionType === 'WITHDRAWAL') groups[item.investorName].totalWithdrawn += item.amount;
            else groups[item.investorName].totalInvested += item.amount;
            groups[item.investorName].transactions.push(item);
        });
        return Object.values(groups);
    }, [equity]);
    const totalEquityBalance = equityByInvestor.reduce((sum, inv) => sum + (inv.totalInvested - inv.totalWithdrawn), 0);
    
    const uniqueInvestorNames = useMemo(() => Array.from(new Set(equity.map(e => e.investorName))).sort(), [equity]);

    const activeFixedServices = useMemo(() => 
        fixedExpenses
            .filter(e => !e.endDate || new Date(e.endDate) >= new Date())
            .sort((a,b) => (a.paymentDay || 1) - (b.paymentDay || 1))
    , [fixedExpenses]);

    const historicalFixedServices = useMemo(() => 
        fixedExpenses
            .filter(e => e.endDate && new Date(e.endDate) < new Date())
            .sort((a,b) => new Date(b.endDate!).getTime() - new Date(a.endDate!).getTime())
    , [fixedExpenses]);

    const filteredVariableExpenses = useMemo(() => {
        const year = vYearFilter;
        const month = vMonthFilter;
        const displayItems: VariableDisplayItem[] = [];

        // 1. Base Variable Expenses
        variableExpenses.forEach(e => {
            const expenseDate = new Date(e.date);
            const yearMatches = year === 'all' || expenseDate.getFullYear() === Number(year);
            const monthMatches = month === 'all' || (expenseDate.getMonth() + 1) === Number(month);
            
            if (yearMatches && monthMatches) {
                displayItems.push({
                    id: e.id,
                    originalId: e.id,
                    name: e.name,
                    category: e.category,
                    amount: e.amount,
                    date: expenseDate,
                    paymentMethod: e.paymentMethod || PaymentMethod.BANK_TRANSFER,
                    isInstallment: false,
                    includesVat: e.includesVat,
                    isVatExempt: e.isVatExempt,
                    checksCount: e.checks?.length
                });
            }

            // 2. Future installments (checks) for this variable expense
            if (e.checks && e.checks.length > 0) {
                const checksInFilter = e.checks.filter(c => {
                    if (!c.repaymentDate) return false;
                    const rd = new Date(c.repaymentDate);
                    const yMatches = year === 'all' || rd.getFullYear() === Number(year);
                    const mMatches = month === 'all' || (rd.getMonth() + 1) === Number(month);
                    return yMatches && mMatches;
                });

                checksInFilter.forEach((check, idx) => {
                    displayItems.push({
                        id: `${e.id}_inst_${idx}`,
                        originalId: e.id,
                        name: `תשלום (פריסה): ${e.name}`,
                        category: e.category,
                        amount: check.amount,
                        date: new Date(check.repaymentDate!),
                        paymentMethod: `צ'ק (מס' ${check.reference || '?'})`,
                        isInstallment: true,
                        isVatExempt: true
                    });
                });
            }
        });

        // 3. Debt Payments
        debts.forEach(debt => {
            if (!debt.payments) return;
            debt.payments.forEach(p => {
                const pDate = new Date(p.date);
                const yearMatches = year === 'all' || pDate.getFullYear() === Number(year);
                const monthMatches = month === 'all' || (pDate.getMonth() + 1) === Number(month);
                
                if (yearMatches && monthMatches) {
                    const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                    if (p.status && invalidStatuses.includes(p.status)) return;

                    displayItems.push({
                        id: p.id,
                        originalId: debt.id,
                        name: `תשלום חוב: ${debt.name}`,
                        category: 'חובות',
                        amount: p.amount,
                        date: pDate,
                        paymentMethod: p.method === PaymentMethod.CHECK ? `צ'ק (מס' ${p.reference || '?'})` : p.method,
                        isInstallment: true, // Mark as special row
                        isVatExempt: true, // Debt amounts are gross usually, don't re-calculate
                        isDebtPayment: true
                    });
                }
            });
        });

        return displayItems.sort((a,b) => b.date.getTime() - a.date.getTime());
    }, [variableExpenses, debts, vMonthFilter, vYearFilter]);

    // Calculate Totals for the summary row
    const variableSummaryTotals = useMemo(() => {
        return filteredVariableExpenses.reduce((acc, item) => {
            const amount = item.amount || 0;
            const gross = item.isVatExempt ? amount : (item.includesVat ? amount : amount * (1 + vatRate / 100));
            const net = item.isVatExempt ? amount : (item.includesVat ? amount / (1 + vatRate / 100) : amount);
            acc.net += net;
            acc.gross += gross;
            return acc;
        }, { net: 0, gross: 0 });
    }, [filteredVariableExpenses, vatRate]);

    // Refetch paginated debts
    const refetchDebts = async () => {
        if (activeTab !== 'DEBTS') return; // Only refetch when DEBTS tab is active
        try {
            setLoadingDebts(true);
            const filters: any = {};
            if (debtSearch) filters.searchTerm = debtSearch;
            if (debtStatusFilter) filters.statusFilter = debtStatusFilter;
            
            const result = await mongoService.getDebtsPaginated(filters, debtsCurrentPage, debtsPageSize, vatRate);
            setPaginatedDebts(result.debts);
            setDebtsTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading paginated debts:', error);
        } finally {
            setLoadingDebts(false);
        }
    };
    
    // Refetch paginated receivables
    const refetchReceivables = async () => {
        if (activeTab !== 'RECEIVABLES') return; // Only refetch when RECEIVABLES tab is active
        try {
            setLoadingReceivables(true);
            const filters: any = {};
            if (receivableSearch) filters.searchTerm = receivableSearch;
            if (receivableStatusFilter) filters.statusFilter = receivableStatusFilter;
            
            const result = await mongoService.getReceivablesPaginated(filters, receivablesCurrentPage, receivablesPageSize, vatRate);
            setPaginatedReceivables(result.receivables);
            setReceivablesTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading paginated receivables:', error);
        } finally {
            setLoadingReceivables(false);
        }
    };
    
    // Load paginated debts when filters or pagination change (only when DEBTS tab is active)
    useEffect(() => {
        if (activeTab === 'DEBTS') {
            refetchDebts();
        }
    }, [debtSearch, debtStatusFilter, debtsCurrentPage, debtsPageSize, vatRate, activeTab]);
    
    // Load paginated receivables when filters or pagination change (only when RECEIVABLES tab is active)
    useEffect(() => {
        if (activeTab === 'RECEIVABLES') {
            refetchReceivables();
        }
    }, [receivableSearch, receivableStatusFilter, receivablesCurrentPage, receivablesPageSize, vatRate, activeTab]);

    // Refetch paginated fixed expenses (active)
    const refetchFixedActive = useCallback(async () => {
        if (activeTab !== 'FIXED') return;
        try {
            setLoadingFixedActive(true);
            const result = await mongoService.getFixedExpensesPaginated({ showHistorical: false }, fixedActiveCurrentPage, fixedActivePageSize);
            setPaginatedFixedActive(result.expenses);
            setFixedActiveTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading paginated fixed active expenses:', error);
        } finally {
            setLoadingFixedActive(false);
        }
    }, [fixedActiveCurrentPage, fixedActivePageSize, activeTab]);

    // Refetch paginated fixed expenses (historical)
    const refetchFixedHistorical = useCallback(async () => {
        if (activeTab !== 'FIXED') return;
        try {
            setLoadingFixedHistorical(true);
            const result = await mongoService.getFixedExpensesPaginated({ showHistorical: true }, fixedHistoricalCurrentPage, fixedHistoricalPageSize);
            setPaginatedFixedHistorical(result.expenses);
            setFixedHistoricalTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading paginated fixed historical expenses:', error);
        } finally {
            setLoadingFixedHistorical(false);
        }
    }, [fixedHistoricalCurrentPage, fixedHistoricalPageSize, activeTab]);

    // Refetch paginated variable expenses
    const refetchVariableExpenses = useCallback(async () => {
        if (activeTab !== 'VARIABLE') return;
        try {
            setLoadingVariable(true);
            const filters: any = {};
            if (vYearFilter !== 'all') filters.year = vYearFilter;
            else filters.year = 'all';
            if (vMonthFilter !== 'all') filters.month = vMonthFilter;
            else filters.month = 'all';
            
            const result = await mongoService.getVariableExpensesPaginated(filters, variableCurrentPage, variablePageSize);
            
            // Convert server items to VariableDisplayItem format (convert dates)
            const convertedItems: VariableDisplayItem[] = result.items.map((item: any) => ({
                ...item,
                date: new Date(item.date)
            }));
            
            setPaginatedVariableExpenses(convertedItems);
            setVariableTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading paginated variable expenses:', error);
        } finally {
            setLoadingVariable(false);
        }
    }, [vMonthFilter, vYearFilter, variableCurrentPage, variablePageSize, activeTab]);

    // Load paginated fixed expenses when FIXED tab is active
    useEffect(() => {
        if (activeTab === 'FIXED') {
            refetchFixedActive();
            refetchFixedHistorical();
        }
    }, [activeTab, fixedActiveCurrentPage, fixedActivePageSize, fixedHistoricalCurrentPage, fixedHistoricalPageSize, refetchFixedActive, refetchFixedHistorical]);

    // Load paginated variable expenses when VARIABLE tab is active
    useEffect(() => {
        if (activeTab === 'VARIABLE') {
            refetchVariableExpenses();
        }
    }, [activeTab, vMonthFilter, vYearFilter, variableCurrentPage, variablePageSize, refetchVariableExpenses]);

    // --- Debts Logic with Filtering and Sorting ---
    // Use paginated debts instead of client-side filtering when DEBTS tab is active
    const filteredDebtsClientSide = useMemo(() => {
        let result = debts.map(d => {
            const amount = d.amount || 0;
            const gross = d.isVatExempt ? amount : (d.includesVat ? amount : amount * (1 + vatRate / 100));
            const paid = (d.payments || []).reduce((sum, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const remaining = Math.max(0, gross - paid);
            const isFullyPaid = remaining <= 0.1;
            
            const today = new Date();
            today.setHours(0,0,0,0);
            const isOverdue = !isFullyPaid && new Date(d.dueDate) < today;

            return { ...d, gross, paid, remaining, isFullyPaid, isOverdue };
        });

        if (debtSearch.trim()) {
            const lowSearch = debtSearch.toLowerCase();
            result = result.filter(d => d.name.toLowerCase().includes(lowSearch) || d.description?.toLowerCase().includes(lowSearch));
        }

        if (debtStatusFilter === 'OPEN') result = result.filter(d => !d.isFullyPaid);
        else if (debtStatusFilter === 'OVERDUE') result = result.filter(d => d.isOverdue);
        else if (debtStatusFilter === 'PAID') result = result.filter(d => d.isFullyPaid);

        return result.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            if (a.isFullyPaid && !b.isFullyPaid) return 1;
            if (!a.isFullyPaid && b.isFullyPaid) return -1;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
    }, [debts, debtSearch, debtStatusFilter, vatRate]);
    
    const filteredDebts = activeTab === 'DEBTS' ? paginatedDebts : filteredDebtsClientSide;

    // --- Receivables Logic ---
    const filteredReceivablesClientSide = useMemo(() => {
        let result = receivables.map(r => {
            const amount = r.amount || 0;
            const gross = r.isVatExempt ? amount : (r.includesVat ? amount : amount * (1 + vatRate / 100));
            const collected = (r.payments || []).reduce((sum, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const remaining = Math.max(0, gross - collected);
            const isFullyPaid = remaining <= 0.1;
            
            const today = new Date();
            today.setHours(0,0,0,0);
            const isOverdue = !isFullyPaid && new Date(r.dueDate) < today;

            return { ...r, gross, collected, remaining, isFullyPaid, isOverdue };
        });

        if (receivableSearch.trim()) {
            const lowSearch = receivableSearch.toLowerCase();
            result = result.filter(r => r.name.toLowerCase().includes(lowSearch) || r.description?.toLowerCase().includes(lowSearch));
        }

        if (receivableStatusFilter === 'OPEN') result = result.filter(r => !r.isFullyPaid);
        else if (receivableStatusFilter === 'OVERDUE') result = result.filter(r => r.isOverdue);
        else if (receivableStatusFilter === 'PAID') result = result.filter(r => r.isFullyPaid);

        return result.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            if (a.isFullyPaid && !b.isFullyPaid) return 1;
            if (!a.isFullyPaid && b.isFullyPaid) return -1;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
    }, [receivables, receivableSearch, receivableStatusFilter, vatRate]);
    
    const filteredReceivables = activeTab === 'RECEIVABLES' ? paginatedReceivables : filteredReceivablesClientSide;

    const handleAdd = (type: string) => {
        setEditingId(null);
        if (type === 'FIXED') setFixedForm({ name: '', monthlyAmount: 0, paymentDay: 1, category: '', isActive: true, startDate: new Date(), paymentMethod: PaymentMethod.STANDING_ORDER, paymentDetails: '', includesVat: true, isVatExempt: false, description: '', checks: [] });
        else if (type === 'VARIABLE') setVariableForm({ name: '', amount: 0, date: new Date(), category: '', includesVat: true, isVatExempt: false, description: '', paymentMethod: PaymentMethod.BANK_TRANSFER, paymentDetails: '', checks: [] });
        else if (type === 'LOANS') {
             setLoanForm({ lenderName: '', principalAmount: 0, interestRate: 0, monthlyPayment: 0, durationMonths: 12, paymentsMade: 0, startDate: new Date(), schedule: [] });
             setShowLoanPreview(false);
        }
        else if (type === 'DEBTS') setDebtForm({ name: '', amount: 0, createdAt: new Date(), dueDate: new Date(), description: '', payments: [], includesVat: true, isVatExempt: false, attachments: [] });
        else if (type === 'RECEIVABLES') setReceivableForm({ name: '', amount: 0, createdAt: new Date(), dueDate: new Date(), description: '', payments: [], includesVat: true, isVatExempt: false, attachments: [] });
        else if (type === 'EQUITY') {
            setEquityForm({ investorName: '', amount: 0, type: 'הון בעלים', date: new Date(), transactionType: 'DEPOSIT' });
            setIsNewInvestor(uniqueInvestorNames.length === 0);
        }
        setIsModalOpen(true);
    };

    const handleEditFixed = (expense: FixedExpense) => { 
        setEditingId(expense.id); 
        setFixedForm({ 
            ...expense, 
            startDate: expense.startDate ? new Date(expense.startDate) : new Date(), 
            endDate: expense.endDate ? new Date(expense.endDate) : undefined,
            checks: expense.checks || []
        }); 
        setIsModalOpen(true); 
    };

    const handleEditVariable = (expenseId: string) => { 
        const expense = variableExpenses.find(v => v.id === expenseId);
        if (!expense) return;
        setEditingId(expense.id); 
        setVariableForm({ 
            ...expense, 
            date: new Date(expense.date),
            paymentMethod: expense.paymentMethod || PaymentMethod.BANK_TRANSFER,
            paymentDetails: expense.paymentDetails || '',
            checks: expense.checks || []
        }); 
        setIsModalOpen(true); 
    };

    const handleEditEquity = (item: EquityInvestment) => { 
        setEditingId(item.id); 
        setEquityForm({ ...item, date: new Date(item.date) }); 
        setIsNewInvestor(false);
        setIsModalOpen(true); 
    };

    const handleEditLoan = (loan: Loan) => {
        setEditingId(loan.id);
        setLoanForm({
            ...loan,
            startDate: new Date(loan.startDate),
            schedule: loan.schedule || []
        });
        setShowLoanPreview(false);
        setIsModalOpen(true);
    };

    const handleEditDebt = (debt: Debt) => {
        setEditingId(debt.id);
        const attachments = debt.attachments ?? (debt.attachment ? [debt.attachment] : []);
        setDebtForm({
            ...debt,
            createdAt: new Date(debt.createdAt),
            dueDate: new Date(debt.dueDate),
            attachments,
            attachment: undefined,
        });
        setIsModalOpen(true);
    };

    const handleEditReceivable = (receivable: Receivable) => {
        setEditingId(receivable.id);
        setReceivableForm({
            ...receivable,
            createdAt: new Date(receivable.createdAt),
            dueDate: new Date(receivable.dueDate),
            attachments: receivable.attachments ?? [],
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (type: 'FIXED' | 'VARIABLE' | 'LOANS' | 'DEBTS' | 'RECEIVABLES' | 'EQUITY', id: string) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק פריט זה?')) return;
        
        try {
            switch (type) {
                case 'FIXED':
                    await mongoService.deleteFixedExpense(id);
                    setFixedExpenses(prev => prev.filter(e => e.id !== id));
                    // Refetch paginated data if FIXED tab is active
                    if (activeTab === 'FIXED') {
                        refetchFixedActive();
                        refetchFixedHistorical();
                    }
                    break;
                case 'VARIABLE':
                    await mongoService.deleteVariableExpense(id);
                    setVariableExpenses(prev => prev.filter(e => e.id !== id));
                    // Refetch paginated data if VARIABLE tab is active
                    if (activeTab === 'VARIABLE') {
                        refetchVariableExpenses();
                    }
                    break;
                case 'LOANS':
                    await mongoService.deleteLoan(id);
                    setLoans(prev => prev.filter(e => e.id !== id));
                    break;
                case 'DEBTS':
                    await mongoService.deleteDebt(id);
                    setDebts(prev => prev.filter(e => e.id !== id));
                    break;
                case 'RECEIVABLES':
                    await mongoService.deleteReceivable(id);
                    setReceivables(prev => prev.filter(r => r.id !== id));
                    break;
                case 'EQUITY':
                    await mongoService.deleteEquity(id);
                    setEquity(prev => prev.filter(e => e.id !== id));
                    break;
            }
        } catch (error) {
            console.error('Error deleting from MongoDB:', error);
            alert('שגיאה במחיקה ממונגו. אנא נסה שוב.');
        }
    };

    const handleUpdateLoanSchedule = async (loanId: string, newSchedule: AmortizationEntry[]) => {
        try {
            const loan = loans.find(l => l.id === loanId);
            if (!loan) return;
            
            const updatedLoan = {
                ...loan,
                schedule: newSchedule,
                paymentsMade: newSchedule.filter(s => s.isPaid).length
            };
            
            const saved = await mongoService.updateLoan(updatedLoan);
            setLoans(prev => prev.map(l => l.id === loanId ? saved : l));
        } catch (error) {
            console.error('Error updating loan schedule in MongoDB:', error);
            alert('שגיאה בעדכון לוח סילוקין במונגו. אנא נסה שוב.');
        }
    };

    const toggleInvestorExpansion = (name: string) => {
        setExpandedInvestors(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const toggleDebtExpansion = (id: string) => {
        setExpandedDebts(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleReceivableExpansion = (id: string) => {
        setExpandedReceivables(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSaveDebtPayment = async (debtId: string, payment: DebtPayment) => {
        try {
            const debt = debts.find(d => d.id === debtId);
            if (!debt) return;
            
            const updatedPayments = [...(debt.payments || []), payment];
            const totalPaid = updatedPayments.reduce((sum, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const amount = debt.amount || 0;
            let gross = amount;
            if (!debt.isVatExempt) {
                gross = debt.includesVat ? amount : amount * (1 + vatRate / 100);
            }
            
            const updatedDebt = {
                ...debt,
                payments: updatedPayments,
                isPaid: totalPaid >= gross - 0.05
            };
            
            const saved = await mongoService.updateDebt(updatedDebt);
            setDebts(prev => prev.map(d => d.id === debtId ? saved : d));
            setIsPaymentModalOpen(false);
            setSelectedDebtForPayment(null);
            await refetchDebts(); // Refresh paginated debts after payment
        } catch (error) {
            console.error('Error saving debt payment to MongoDB:', error);
            alert('שגיאה בשמירת תשלום חוב למונגו. אנא נסה שוב.');
        }
    };

    const handleSaveReceivableCollection = async (receivableId: string, payment: ReceivablePayment) => {
        try {
            const receivable = receivables.find(r => r.id === receivableId);
            if (!receivable) return;
            
            const updatedPayments = [...(receivable.payments || []), payment];
            const totalCollected = updatedPayments.reduce((sum, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const amount = receivable.amount || 0;
            let gross = amount;
            if (!receivable.isVatExempt) {
                gross = receivable.includesVat ? amount : amount * (1 + vatRate / 100);
            }
            
            const updatedReceivable = {
                ...receivable,
                payments: updatedPayments,
                isPaid: totalCollected >= gross - 0.05
            };
            
            const saved = await mongoService.updateReceivable(updatedReceivable);
            setReceivables(prev => prev.map(r => r.id === receivableId ? saved : r));
            setIsPaymentModalOpen(false);
            setSelectedReceivableForCollection(null);
            await refetchReceivables(); // Refresh paginated receivables after payment
        } catch (error) {
            console.error('Error saving receivable collection to MongoDB:', error);
            alert('שגיאה בשמירת גבייה למונגו. אנא נסה שוב.');
        }
    };

    const handleDeleteDebtPayment = async (debtId: string, paymentId: string) => {
        if (!window.confirm('האם למחוק תשלום זה? היתרה תתעדכן בהתאם.')) return;
        
        try {
            const debt = debts.find(d => d.id === debtId);
            if (!debt) return;
            
            const updatedPayments = (debt.payments || []).filter(p => p.id !== paymentId);
            const totalPaid = updatedPayments.reduce((sum, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const amount = debt.amount || 0;
            let gross = amount;
            if (!debt.isVatExempt) {
                gross = debt.includesVat ? amount : amount * (1 + vatRate / 100);
            }
            
            const updatedDebt = {
                ...debt,
                payments: updatedPayments,
                isPaid: totalPaid >= gross - 0.05
            };
            
            const saved = await mongoService.updateDebt(updatedDebt);
            setDebts(prev => prev.map(d => d.id === debtId ? saved : d));
            await refetchDebts(); // Refresh paginated debts after payment delete
        } catch (error) {
            console.error('Error deleting debt payment from MongoDB:', error);
            alert('שגיאה במחיקת תשלום חוב ממונגו. אנא נסה שוב.');
        }
    };

    const handleDeleteReceivablePayment = async (receivableId: string, paymentId: string) => {
        if (!window.confirm('האם למחוק גבייה זו? היתרה תתעדכן בהתאם.')) return;
        
        try {
            const receivable = receivables.find(r => r.id === receivableId);
            if (!receivable) return;
            
            const updatedPayments = (receivable.payments || []).filter(p => p.id !== paymentId);
            const totalCollected = updatedPayments.reduce((sum, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const amount = receivable.amount || 0;
            let gross = amount;
            if (!receivable.isVatExempt) {
                gross = receivable.includesVat ? amount : amount * (1 + vatRate / 100);
            }
            
            const updatedReceivable = {
                ...receivable,
                payments: updatedPayments,
                isPaid: totalCollected >= gross - 0.05
            };
            
            const saved = await mongoService.updateReceivable(updatedReceivable);
            setReceivables(prev => prev.map(r => r.id === receivableId ? saved : r));
            await refetchReceivables(); // Refresh paginated receivables after payment delete
        } catch (error) {
            console.error('Error deleting receivable payment from MongoDB:', error);
            alert('שגיאה במחיקת גבייה ממונגו. אנא נסה שוב.');
        }
    };

    const handleUpdateDebtPaymentStatus = async (debtId: string, paymentId: string, newStatus: TransactionStatus, note?: string) => {
        try {
            const debt = debts.find(d => d.id === debtId);
            if (!debt) return;
            
            const updatedPayments = (debt.payments || []).map(p => {
                if (p.id !== paymentId) return p;
                return { 
                    ...p, 
                    status: newStatus, 
                    statusHistory: [...(p.statusHistory || []), { date: new Date(), status: newStatus, changedBy: 'משתמש', reason: note }] 
                };
            });
            const totalPaid = updatedPayments.reduce((sum, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const amount = debt.amount || 0;
            let gross = amount;
            if (!debt.isVatExempt) gross = debt.includesVat ? amount : amount * (1 + vatRate / 100);

            const updatedDebt = { ...debt, payments: updatedPayments, isPaid: totalPaid >= gross - 0.05 };
            const saved = await mongoService.updateDebt(updatedDebt);
            setDebts(prev => prev.map(d => d.id === debtId ? saved : d));
            addActivity(`סטטוס תשלום חוב עודכן ל-${newStatus}`, { entityType: 'finance', action: 'status_change', metadata: { debtId, newStatus } });
            await refetchDebts(); // Refresh paginated debts after payment status update
        } catch (error) {
            console.error('Error updating debt payment status in MongoDB:', error);
            alert('שגיאה בעדכון סטטוס תשלום חוב במונגו. אנא נסה שוב.');
        }
    };

    const handleUpdateReceivablePaymentStatus = async (receivableId: string, paymentId: string, newStatus: TransactionStatus, note?: string) => {
        try {
            const receivable = receivables.find(r => r.id === receivableId);
            if (!receivable) return;
            
            const updatedPayments = (receivable.payments || []).map(p => {
                if (p.id !== paymentId) return p;
                return { 
                    ...p, 
                    status: newStatus, 
                    statusHistory: [...(p.statusHistory || []), { date: new Date(), status: newStatus, changedBy: 'משתמש', reason: note }] 
                };
            });
            const totalCollected = updatedPayments.reduce((sum, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const amount = receivable.amount || 0;
            let gross = amount;
            if (!receivable.isVatExempt) gross = receivable.includesVat ? amount : amount * (1 + vatRate / 100);

            const updatedReceivable = { ...receivable, payments: updatedPayments, isPaid: totalCollected >= gross - 0.05 };
            const saved = await mongoService.updateReceivable(updatedReceivable);
            setReceivables(prev => prev.map(r => r.id === receivableId ? saved : r));
            addActivity(`סטטוס גבייה עודכן ל-${newStatus}`, { entityType: 'finance', action: 'status_change', metadata: { receivableId, newStatus } });
            await refetchReceivables(); // Refresh paginated receivables after payment status update
        } catch (error) {
            console.error('Error updating receivable payment status in MongoDB:', error);
            alert('שגיאה בעדכון סטטוס גבייה במונגו. אנא נסה שוב.');
        }
    };

    const handleLoanFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setLoanForm(prev => ({
                        ...prev,
                        amortizationFile: {
                            id: `att_${Date.now()}`,
                            fileName: file.name,
                            dataUrl: event.target.result as string,
                            type: file.type,
                        }
                    }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const readFileAsAttachment = (file: File): Promise<Attachment> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    resolve({
                        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                        fileName: file.name,
                        dataUrl: event.target.result as string,
                        type: file.type,
                    });
                } else reject(new Error('Failed to read file'));
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    };

    const handleDebtFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const current = debtForm.attachments ?? (debtForm.attachment ? [debtForm.attachment] : []);
        const newAttachments: Attachment[] = [];
        for (let i = 0; i < files.length; i++) {
            try {
                const att = await readFileAsAttachment(files[i]);
                newAttachments.push(att);
            } catch (_) { /* skip failed */ }
        }
        setDebtForm(prev => ({ ...prev, attachments: [...current, ...newAttachments], attachment: undefined }));
        e.target.value = '';
    };

    const handleReceivableFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const current = receivableForm.attachments ?? [];
        const newAttachments: Attachment[] = [];
        for (let i = 0; i < files.length; i++) {
            try {
                const att = await readFileAsAttachment(files[i]);
                newAttachments.push(att);
            } catch (_) { /* skip failed */ }
        }
        setReceivableForm(prev => ({ ...prev, attachments: [...current, ...newAttachments] }));
        e.target.value = '';
    };

    const handleUpdateFixedFormCheck = (index: number, field: string, value: any) => {
        const updatedChecks = [...(fixedForm.checks || [])];
        const check = { ...updatedChecks[index] };
        if (field === 'repaymentDate') check.repaymentDate = new Date(value);
        else (check as any)[field] = field === 'amount' ? Number(value) : value;
        updatedChecks[index] = check;
        setFixedForm(prev => ({ ...prev, checks: updatedChecks }));
    };

    const handleUpdateVariableFormCheck = (index: number, field: string, value: any) => {
        const updatedChecks = [...(variableForm.checks || [])];
        const check = { ...updatedChecks[index] };
        if (field === 'repaymentDate') check.repaymentDate = new Date(value);
        else (check as any)[field] = field === 'amount' ? Number(value) : value;
        updatedChecks[index] = check;
        setVariableForm(prev => ({ ...prev, checks: updatedChecks }));
    };

    const handleRemoveCheckFromFixedForm = (index: number) => {
        const check = fixedForm.checks?.[index];
        const checkInfo = check ? `צ'ק בסכום ₪${check.amount.toLocaleString()}` : 'צ\'ק';
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את ${checkInfo}?`)) {
            return;
        }
        const updatedChecks = (fixedForm.checks || []).filter((_, i) => i !== index);
        setFixedForm(prev => ({ ...prev, checks: updatedChecks }));
    };

    const handleRemoveCheckFromVariableForm = (index: number) => {
        const check = variableForm.checks?.[index];
        const checkInfo = check ? `צ'ק בסכום ₪${check.amount.toLocaleString()}` : 'צ\'ק';
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את ${checkInfo}?`)) {
            return;
        }
        const updatedChecks = (variableForm.checks || []).filter((_, i) => i !== index);
        setVariableForm(prev => ({ ...prev, checks: updatedChecks }));
    };

    const handleSaveInternal = async () => {
        if (activeTab === 'FIXED') {
            const newItem = { ...fixedForm, id: editingId || `fe_${Date.now()}` } as FixedExpense;
            if (editingId) {
                const saved = await mongoService.updateFixedExpense(newItem);
                setFixedExpenses(prev => prev.map(item => item.id === editingId ? saved : item));
            } else {
                const saved = await mongoService.createFixedExpense(newItem);
                setFixedExpenses(prev => [...prev, saved]);
            }
            // Refetch paginated data if FIXED tab is active
            if (activeTab === 'FIXED') {
                refetchFixedActive();
                refetchFixedHistorical();
            }
        } else if (activeTab === 'VARIABLE') {
            const newItem = { 
                ...variableForm, 
                id: editingId || `ve_${Date.now()}`, 
                date: new Date(variableForm.date || new Date()),
                paymentMethod: variableForm.paymentMethod || PaymentMethod.BANK_TRANSFER,
                paymentDetails: variableForm.paymentDetails || '',
                checks: variableForm.checks || []
            } as VariableExpense;
            if (editingId) {
                const saved = await mongoService.updateVariableExpense(newItem);
                setVariableExpenses(prev => prev.map(item => item.id === editingId ? saved : item));
            } else {
                const saved = await mongoService.createVariableExpense(newItem);
                setVariableExpenses(prev => [...prev, saved]);
            }
            // Refetch paginated data if VARIABLE tab is active
            if (activeTab === 'VARIABLE') {
                refetchVariableExpenses();
            }
        } else if (activeTab === 'LOANS') {
            const principal = loanForm.principalAmount || 0;
            const rate = loanForm.interestRate || 0;
            const duration = loanForm.durationMonths || 12;
            const startDate = loanForm.startDate || new Date();
            const paymentsMadeCount = loanForm.paymentsMade || 0;
            
            let schedule = loanForm.schedule || [];
            const scheduleTotalPrincipal = schedule.reduce((sum, s) => sum + s.principalAmount, 0);
            const needsSync = schedule.length === 0 || schedule.length !== duration || Math.abs(scheduleTotalPrincipal - principal) > 1.0;

            if (needsSync && principal > 0 && duration > 0) {
                schedule = generateSpitzerSchedule(principal, rate, duration, startDate, paymentsMadeCount);
            }

            const newItem = { 
                ...loanForm, 
                id: editingId || `ln_${Date.now()}`, 
                startDate: new Date(loanForm.startDate || new Date()),
                schedule: schedule,
                paymentsMade: schedule.filter(s => s.isPaid).length 
            } as Loan;
            if (editingId) {
                const saved = await mongoService.updateLoan(newItem);
                setLoans(prev => prev.map(l => l.id === editingId ? saved : l));
            } else {
                const saved = await mongoService.createLoan(newItem);
                setLoans(prev => [...prev, saved]);
            }
        } else if (activeTab === 'DEBTS') {
            const attachments = debtForm.attachments ?? (debtForm.attachment ? [debtForm.attachment] : []);
            const newItem = { 
                ...debtForm, 
                id: editingId || `db_${Date.now()}`, 
                createdAt: new Date(debtForm.createdAt || new Date()), 
                dueDate: new Date(debtForm.dueDate || new Date()), 
                payments: debtForm.payments || [], 
                includesVat: debtForm.includesVat ?? true, 
                isVatExempt: debtForm.isVatExempt ?? false,
                attachments,
                attachment: undefined,
            } as Debt;
            if (editingId) {
                const saved = await mongoService.updateDebt(newItem);
                setDebts(prev => prev.map(d => d.id === editingId ? saved : d));
            } else {
                const saved = await mongoService.createDebt(newItem);
                setDebts(prev => [...prev, saved]);
            }
        } else if (activeTab === 'RECEIVABLES') {
            const newItem = { 
                ...receivableForm, 
                id: editingId || `rec_${Date.now()}`, 
                createdAt: new Date(receivableForm.createdAt || new Date()), 
                dueDate: new Date(receivableForm.dueDate || new Date()), 
                payments: receivableForm.payments || [], 
                includesVat: receivableForm.includesVat ?? true, 
                isVatExempt: receivableForm.isVatExempt ?? false 
            } as Receivable;
            if (editingId) {
                const saved = await mongoService.updateReceivable(newItem);
                setReceivables(prev => prev.map(r => r.id === editingId ? saved : r));
                await refetchReceivables(); // Refresh paginated receivables after update
            } else {
                const saved = await mongoService.createReceivable(newItem);
                setReceivables(prev => [...prev, saved]);
                await refetchReceivables(); // Refresh paginated receivables after create
            }
        } else if (activeTab === 'EQUITY') {
            if (!equityForm.investorName || !equityForm.amount) { 
                throw new Error('חסרים שדות חובה'); 
            }
            const newItem = { ...equityForm, id: editingId || `eq_${Date.now()}`, date: new Date(equityForm.date || new Date()) } as EquityInvestment;
            if (editingId) {
                const saved = await mongoService.updateEquity(newItem);
                setEquity(prev => prev.map(item => item.id === editingId ? saved : item));
            } else {
                const saved = await mongoService.createEquity(newItem);
                setEquity(prev => [...prev, saved]);
            }
        }
        setIsModalOpen(false);
    };

    const { execute: handleSave, isLoading: isSaving } = useAsyncAction(handleSaveInternal, {
        preventDoubleClick: true,
        onError: (error) => {
            console.error('Error saving to MongoDB:', error);
            alert(`שגיאה בשמירה למונגו: ${error.message || 'שגיאה לא ידועה'}`);
        }
    });

    const FixedExpensesTable = ({ items, title, isHistorical = false }: { items: FixedExpense[], title: string, isHistorical?: boolean }) => (
        <div className={isHistorical ? "mt-12 pt-8 border-t border-slate-200 opacity-70" : ""}>
            <h4 className={`text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-2 ${isHistorical ? 'text-slate-400' : 'text-blue-600'}`}>
                {!isHistorical && <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div>}
                {title}
            </h4>
            <div className={`overflow-x-auto border rounded-lg shadow-sm ${isHistorical ? 'bg-slate-50/30' : 'bg-white'}`}>
                <table className="min-w-full text-sm text-right">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b">
                        <tr>
                            <th className="px-4 py-3">יום</th>
                            <th className="px-4 py-3">שם ההוצאה</th>
                            <th className="px-4 py-3">אמצעי תשלום</th>
                            <th className="px-4 py-3">נטו</th>
                            <th className="px-4 py-3">מע"מ</th>
                            <th className={`px-4 py-3 ${isHistorical ? 'bg-slate-100' : 'bg-blue-50/30'}`}>סה"כ לתשלום</th>
                            {isHistorical && <th className="px-4 py-3">תאריך סיום</th>}
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {items.map(item => {
                            const amount = item.monthlyAmount || 0;
                            let gross = item.isVatExempt ? amount : (item.includesVat ? amount : amount * (1 + vatRate / 100));
                            let net = item.isVatExempt ? amount : (item.includesVat ? amount / (1 + vatRate / 100) : amount);
                            const checksCount = item.checks?.length || 0;
                            return (
                                <tr key={item.id} className="hover:bg-slate-50 group">
                                    <td className={`px-4 py-4 font-bold ${isHistorical ? 'text-slate-400' : 'text-blue-600'}`}>{item.paymentDay}</td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1">
                                                <span className={`font-bold ${isHistorical ? 'text-slate-500' : 'text-slate-800'}`}>{item.name}</span>
                                                {item.isVatExempt && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-black">פטור</span>}
                                            </div>
                                            <span className="text-[10px] text-slate-400">{item.category}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-xs">
                                        <div className="flex flex-col">
                                            <span>{item.paymentMethod}</span>
                                            {item.paymentMethod === PaymentMethod.CHECK && checksCount > 0 && (
                                                <span className={`text-[10px] font-bold ${isHistorical ? 'text-slate-400' : 'text-indigo-500'}`}>({checksCount} צ'קים במערכת)</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-slate-500">₪{net.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td className="px-4 py-4 text-slate-400">₪{(gross - net).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td className={`px-4 py-4 font-black text-slate-900 ${isHistorical ? '' : 'bg-blue-50/10'}`}>₪{gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    {isHistorical && <td className="px-4 py-4 text-xs text-red-500 font-bold">{new Date(item.endDate!).toLocaleDateString('he-IL')}</td>}
                                    <td className="px-4 py-4 text-left">
                                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100">
                                            <button onClick={() => handleEditFixed(item)} className="text-primary p-1"><EditIcon className="w-4 h-4"/></button>
                                            <button onClick={() => handleDelete('FIXED', item.id)} className="text-red-500 p-1"><DeleteIcon className="w-4 h-4"/></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr><td colSpan={isHistorical ? 9 : 8} className="px-4 py-8 text-center text-slate-400 italic">אין פריטים להצגה</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const closeViewer = () => {
        setViewingLoanDoc(null);
        setViewingAttachmentList(null);
    };

    const renderFilePreview = (file: Attachment, list?: Attachment[] | null, index?: number) => {
        const isImage = file.type.startsWith('image/');
        const isPdf = file.type === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
        const hasMultiple = list && list.length > 1 && index !== undefined;
        const currentNum = (index ?? 0) + 1;
        const totalNum = list?.length ?? 1;

        return (
            <Modal title={`צפייה במסמך: ${file.fileName}`} onClose={closeViewer} size="5xl">
                <div className="flex flex-col h-[75vh]">
                    <div className="flex-1 bg-slate-100 rounded overflow-hidden flex items-center justify-center p-0 relative">
                        {isImage ? (
                            <img src={file.dataUrl} alt={file.fileName} className="max-w-full max-h-full object-contain" />
                        ) : isPdf ? (
                            <iframe src={file.dataUrl} className="w-full h-full border-none bg-white" title="Document Preview" />
                        ) : (
                            <div className="text-center p-10">
                                <p className="text-slate-600 mb-6 font-bold">סוג קובץ זה אינו נתמך לצפייה ישירה בדפדפן.</p>
                                <a 
                                    href={file.dataUrl} 
                                    download={file.fileName}
                                    className="px-6 py-3 bg-primary text-white rounded-lg font-black shadow-lg flex items-center gap-2 hover:bg-indigo-700 transition-all mx-auto w-fit"
                                >
                                    <DownloadIcon className="w-5 h-5"/>
                                    הורד קובץ למחשב
                                </a>
                            </div>
                        )}
                    </div>
                    <div className="mt-4 flex flex-wrap justify-between items-center gap-2 p-2 bg-slate-50 border rounded border-slate-200">
                        <div className="flex items-center gap-3">
                            {hasMultiple && (
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => setViewingAttachmentIndex(Math.max(0, index! - 1))} disabled={index === 0} className="px-3 py-1 rounded bg-white border border-slate-300 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">← קודם</button>
                                    <span className="text-sm font-medium text-slate-600">קובץ {currentNum} מתוך {totalNum}</span>
                                    <button type="button" onClick={() => setViewingAttachmentIndex(Math.min(list!.length - 1, index! + 1))} disabled={index === list!.length - 1} className="px-3 py-1 rounded bg-white border border-slate-300 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">הבא →</button>
                                </div>
                            )}
                            {(isImage || isPdf) && <span className="text-sm font-medium text-slate-500">{file.fileName}</span>}
                        </div>
                        <a href={file.dataUrl} download={file.fileName} className="text-primary font-bold hover:underline flex items-center gap-1">
                            <DownloadIcon className="w-4 h-4"/>
                            הורד קובץ
                        </a>
                    </div>
                </div>
            </Modal>
        );
    };

    const currentViewingFile = viewingAttachmentList ? viewingAttachmentList[viewingAttachmentIndex] : viewingLoanDoc;

    if (isChecksOnlyUser) {
        return (
            <div className="space-y-6 pb-12">
                {currentViewingFile && renderFilePreview(currentViewingFile, viewingAttachmentList, viewingAttachmentList ? viewingAttachmentIndex : undefined)}
                <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                        <h2 className="text-lg font-black text-slate-800">ניהול צ'קים נכנסים</h2>
                        <p className="text-sm text-slate-500 mt-0.5">צפייה ועדכון סטטוס לצ'קים שנכנסו מלקוחות וחייבים</p>
                    </div>
                    <div className="p-6 min-h-[400px]">
                        <CheckCenter orders={orders} setOrders={setOrders} fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses} variableExpenses={variableExpenses} setVariableExpenses={setVariableExpenses} debts={debts} setDebts={setDebts} receivables={receivables} setReceivables={setReceivables} addActivity={addActivity} incomingOnly={true} onViewCheckAttachment={(att) => { setViewingLoanDoc(att); setViewingAttachmentList(null); }} onViewCheckAttachments={(attachments) => { setViewingAttachmentList(attachments); setViewingAttachmentIndex(0); setViewingLoanDoc(attachments[0]); }} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {currentViewingFile && renderFilePreview(currentViewingFile, viewingAttachmentList, viewingAttachmentList ? viewingAttachmentIndex : undefined)}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-blue-500">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-tighter">קבועות (ברוטו)</h3>
                    <p className="text-2xl font-black text-slate-800 mt-1">₪{totalFixedMonthly.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-orange-500">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-tighter">משתנות (החודש)</h3>
                    <p className="text-2xl font-black text-slate-800 mt-1">₪{totalVariableCurrentMonth.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-red-500">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-tighter">יתרת הלוואות</h3>
                    <p className="text-2xl font-black text-red-600 mt-1">₪{totalLoanBalance.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-purple-500">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-tighter">חובות (יתרה)</h3>
                    <p className="text-2xl font-black text-purple-600 mt-1">₪{totalDebts.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-indigo-500">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-tighter">חייבים (יתרה)</h3>
                    <p className="text-2xl font-black text-indigo-600 mt-1">₪{totalReceivables.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border-t-4 border-green-500">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-tighter">הון עצמי</h3>
                    <p className="text-2xl font-black text-green-600 mt-1">₪{totalEquityBalance.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
                <div className="flex border-b border-slate-200 px-4 overflow-x-auto bg-slate-50/50 scrollbar-hide">
                    <TabButton label="דוח רווח והפסד (P&L)" active={activeTab === 'PNL'} onClick={() => setActiveTab('PNL')} icon={<TrendingUpIcon className="w-4 h-4"/>} />
                    <TabButton label="ניהול צ'קים" active={activeTab === 'CHECKS'} onClick={() => setActiveTab('CHECKS')} icon={<CashIcon className="w-4 h-4"/>} />
                    <TabButton label="קבועות" active={activeTab === 'FIXED'} onClick={() => setActiveTab('FIXED')} />
                    <TabButton label="משתנות" active={activeTab === 'VARIABLE'} onClick={() => setActiveTab('VARIABLE')} />
                    <TabButton label="הלוואות" active={activeTab === 'LOANS'} onClick={() => setActiveTab('LOANS')} />
                    <TabButton label="חובות" active={activeTab === 'DEBTS'} onClick={() => setActiveTab('DEBTS')} />
                    <TabButton label="חייבים" active={activeTab === 'RECEIVABLES'} onClick={() => setActiveTab('RECEIVABLES')} />
                    <TabButton label="הון בעלים" active={activeTab === 'EQUITY'} onClick={() => setActiveTab('EQUITY')} />
                </div>

                <div className="p-6 min-h-[400px]">
                    {activeTab === 'PNL' && (
                        <ErrorBoundary>
                            <PnLReport 
                                orders={pnlOrders ?? orders} 
                                fixedExpenses={fixedExpenses} 
                                variableExpenses={variableExpenses} 
                                loans={loans} 
                                employees={employees} 
                                attendanceRecords={attendanceRecords} 
                                statusConfigs={statusConfigs} 
                                vatRate={vatRate} 
                                debts={debts} 
                                receivables={receivables} 
                                payrollOverrides={payrollOverrides}
                                onNavigateToOrder={onNavigateToOrder}
                            />
                        </ErrorBoundary>
                    )}

                    {activeTab === 'CHECKS' && <CheckCenter orders={orders} setOrders={setOrders} fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses} variableExpenses={variableExpenses} setVariableExpenses={setVariableExpenses} debts={debts} setDebts={setDebts} receivables={receivables} setReceivables={setReceivables} addActivity={addActivity} onViewCheckAttachment={(att) => { setViewingLoanDoc(att); setViewingAttachmentList(null); }} onViewCheckAttachments={(attachments) => { setViewingAttachmentList(attachments); setViewingAttachmentIndex(0); setViewingLoanDoc(attachments[0]); }} />}

                    {activeTab === 'FIXED' && (
                        <div className="text-start">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-lg font-black text-slate-700">ניהול הוצאות קבועות</h3>
                                    <p className="text-sm text-slate-500">שכירות, תוכנות, ביטוחים ושירותים חודשיים</p>
                                </div>
                                <button onClick={() => handleAdd('FIXED')} className="flex items-center px-5 py-2.5 bg-primary text-white rounded-lg shadow-lg hover:bg-indigo-700 font-bold transition-all"><PlusIcon className="w-5 h-5 me-2"/> הוסף הוצאה</button>
                            </div>
                            <div className="space-y-12">
                                <div>
                                    <FixedExpensesTable items={loadingFixedActive ? [] : paginatedFixedActive} title="שירותים פעילים" />
                                    {/* Pagination Controls for Active Fixed Expenses */}
                                    {fixedActiveTotalCount > 0 && (
                                        <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200">
                                            <div className="flex items-center gap-4">
                                                <div className="text-sm text-slate-600">
                                                    מציג {((fixedActiveCurrentPage - 1) * fixedActivePageSize) + 1} - {Math.min(fixedActiveCurrentPage * fixedActivePageSize, fixedActiveTotalCount)} מתוך {fixedActiveTotalCount} שירותים פעילים
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <label className="text-sm text-slate-600">שורות לעמוד:</label>
                                                    <select 
                                                        value={fixedActivePageSize} 
                                                        onChange={(e) => {
                                                            setFixedActivePageSize(parseInt(e.target.value));
                                                            setFixedActiveCurrentPage(1);
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
                                                    onClick={() => setFixedActiveCurrentPage(1)}
                                                    disabled={fixedActiveCurrentPage === 1 || loadingFixedActive}
                                                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    ראשון
                                                </button>
                                                <button
                                                    onClick={() => setFixedActiveCurrentPage(prev => Math.max(1, prev - 1))}
                                                    disabled={fixedActiveCurrentPage === 1 || loadingFixedActive}
                                                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    קודם
                                                </button>
                                                <span className="px-3 py-1 text-sm text-slate-600">
                                                    עמוד {fixedActiveCurrentPage} מתוך {Math.ceil(fixedActiveTotalCount / fixedActivePageSize) || 1}
                                                </span>
                                                <button
                                                    onClick={() => setFixedActiveCurrentPage(prev => Math.min(Math.ceil(fixedActiveTotalCount / fixedActivePageSize) || 1, prev + 1))}
                                                    disabled={fixedActiveCurrentPage >= Math.ceil(fixedActiveTotalCount / fixedActivePageSize) || loadingFixedActive}
                                                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    הבא
                                                </button>
                                                <button
                                                    onClick={() => setFixedActiveCurrentPage(Math.ceil(fixedActiveTotalCount / fixedActivePageSize) || 1)}
                                                    disabled={fixedActiveCurrentPage >= Math.ceil(fixedActiveTotalCount / fixedActivePageSize) || loadingFixedActive}
                                                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    אחרון
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {fixedHistoricalTotalCount > 0 && (
                                    <div>
                                        <FixedExpensesTable items={loadingFixedHistorical ? [] : paginatedFixedHistorical} title="היסטוריית שירותים (הסתיימו)" isHistorical={true} />
                                        {/* Pagination Controls for Historical Fixed Expenses */}
                                        {fixedHistoricalTotalCount > 0 && (
                                            <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200">
                                                <div className="flex items-center gap-4">
                                                    <div className="text-sm text-slate-600">
                                                        מציג {((fixedHistoricalCurrentPage - 1) * fixedHistoricalPageSize) + 1} - {Math.min(fixedHistoricalCurrentPage * fixedHistoricalPageSize, fixedHistoricalTotalCount)} מתוך {fixedHistoricalTotalCount} שירותים היסטוריים
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-sm text-slate-600">שורות לעמוד:</label>
                                                        <select 
                                                            value={fixedHistoricalPageSize} 
                                                            onChange={(e) => {
                                                                setFixedHistoricalPageSize(parseInt(e.target.value));
                                                                setFixedHistoricalCurrentPage(1);
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
                                                        onClick={() => setFixedHistoricalCurrentPage(1)}
                                                        disabled={fixedHistoricalCurrentPage === 1 || loadingFixedHistorical}
                                                        className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        ראשון
                                                    </button>
                                                    <button
                                                        onClick={() => setFixedHistoricalCurrentPage(prev => Math.max(1, prev - 1))}
                                                        disabled={fixedHistoricalCurrentPage === 1 || loadingFixedHistorical}
                                                        className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        קודם
                                                    </button>
                                                    <span className="px-3 py-1 text-sm text-slate-600">
                                                        עמוד {fixedHistoricalCurrentPage} מתוך {Math.ceil(fixedHistoricalTotalCount / fixedHistoricalPageSize) || 1}
                                                    </span>
                                                    <button
                                                        onClick={() => setFixedHistoricalCurrentPage(prev => Math.min(Math.ceil(fixedHistoricalTotalCount / fixedHistoricalPageSize) || 1, prev + 1))}
                                                        disabled={fixedHistoricalCurrentPage >= Math.ceil(fixedHistoricalTotalCount / fixedHistoricalPageSize) || loadingFixedHistorical}
                                                        className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        הבא
                                                    </button>
                                                    <button
                                                        onClick={() => setFixedHistoricalCurrentPage(Math.ceil(fixedHistoricalTotalCount / fixedHistoricalPageSize) || 1)}
                                                        disabled={fixedHistoricalCurrentPage >= Math.ceil(fixedHistoricalTotalCount / fixedHistoricalPageSize) || loadingFixedHistorical}
                                                        className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        אחרון
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {/* Rest of the tabs remain the same... */}
                    {activeTab === 'VARIABLE' && (
                        <div className="text-start">
                            <div className="flex flex-col sm:flex-row justify-between items-end mb-6 gap-4">
                                <div>
                                    <h3 className="text-xl font-black text-slate-800">הוצאות משתנות</h3>
                                    <div className="flex flex-wrap items-center gap-3 mt-3">
                                        <div className="flex flex-col">
                                            <label className="text-[10px] font-black text-slate-400 uppercase">שנה</label>
                                            <select 
                                                value={vYearFilter} 
                                                onChange={e => { setVYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setVariableCurrentPage(1); }} 
                                                className="text-sm border p-2 rounded-md border-slate-300 shadow-sm focus:ring-primary focus:border-primary bg-white min-w-[100px]"
                                            >
                                                <option value="all">כל השנים</option>
                                                {vAvailableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[10px] font-black text-slate-400 uppercase">חודש</label>
                                            <select 
                                                value={vMonthFilter} 
                                                onChange={e => { setVMonthFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setVariableCurrentPage(1); }} 
                                                className="text-sm border p-2 rounded-md border-slate-300 shadow-sm focus:ring-primary focus:border-primary bg-white min-w-[120px]"
                                            >
                                                <option value="all">כל החודשים</option>
                                                {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('he-IL', {month: 'long'})}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button 
                                            onClick={() => { setVMonthFilter('all'); setVYearFilter('all'); setVariableCurrentPage(1); }} 
                                            className="text-xs px-4 py-2 mt-4 rounded-md font-bold transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        >
                                            נקה סינון
                                        </button>
                                    </div>
                                </div>
                                <button onClick={() => handleAdd('VARIABLE')} className="flex items-center px-6 py-3 bg-[#c2410c] text-white rounded-lg shadow-xl hover:bg-[#9a3412] font-black transition-all"><PlusIcon className="w-6 h-6 me-2"/> הוסף הוצאה</button>
                            </div>
                            <div className="overflow-x-auto border rounded-xl shadow-sm">
                                <table className="min-w-full text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-500 font-black border-b">
                                        <tr>
                                            <th className="px-6 py-4">תאריך</th>
                                            <th className="px-6 py-4">שם ההוצאה</th>
                                            <th className="px-6 py-4">אמצעי תשלום</th>
                                            <th className="px-6 py-4">קטגוריה</th>
                                            <th className="px-6 py-4">נטו</th>
                                            <th className="px-6 py-4">ברוטו</th>
                                            <th className="px-6 py-4"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {loadingVariable && (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-32 text-center">
                                                    <div className="flex flex-col items-center gap-4 text-slate-400">
                                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                                                        <p className="text-sm font-medium">טוען הוצאות...</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {!loadingVariable && paginatedVariableExpenses.map(item => {
                                            const amount = item.amount || 0;
                                            let net = item.isVatExempt ? amount : (item.includesVat ? amount / (1 + vatRate / 100) : amount);
                                            let gross = item.isVatExempt ? amount : (item.includesVat ? amount : amount * (1 + vatRate / 100));
                                            return (
                                                <tr key={item.id} className={`hover:bg-slate-50 group ${item.isInstallment ? 'bg-slate-50/50' : ''}`}>
                                                    <td className="px-6 py-4 font-medium text-slate-500">{new Date(item.date).toLocaleDateString('he-IL')}</td>
                                                    <td className="px-6 py-4"><div className="flex flex-col"><span className={`font-black ${item.isInstallment ? 'text-slate-500 text-xs italic' : 'text-slate-800'}`}>{item.name}</span>{item.isInstallment && <span className="text-[9px] text-primary font-bold">{item.isDebtPayment ? 'תשלום חוב' : 'תשלום מחודש קודם'}</span>}</div></td>
                                                    <td className="px-6 py-4 text-xs"><div className="flex flex-col"><span>{item.paymentMethod}</span>{!item.isInstallment && item.checksCount ? <span className="text-[10px] font-bold text-indigo-500">({item.checksCount} צ'קים)</span> : null}</div></td>
                                                    <td className="px-6 py-4"><span className={`${item.isDebtPayment ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-orange-50 text-orange-700 border-orange-100'} px-3 py-1 rounded-full border text-[11px] font-bold`}>{item.category}</span></td>
                                                    <td className="px-6 py-4 text-slate-500 font-mono">₪{net.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className="px-6 py-4 font-black text-slate-900 font-mono">₪{gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className="px-6 py-4 text-left"><div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100">{!item.isInstallment ? <><button onClick={() => handleEditVariable(item.originalId)} className="text-primary hover:bg-blue-50 p-1.5 rounded"><EditIcon className="w-5 h-5"/></button><button onClick={() => handleDelete('VARIABLE', item.originalId)} className="text-red-500 p-1.5 rounded"><DeleteIcon className="w-5 h-5"/></button></> : <span className="text-[10px] text-slate-300 italic">מערכת</span>}</div></td>
                                                </tr>
                                            );
                                        })}
                                        {!loadingVariable && paginatedVariableExpenses.length === 0 && (
                                            <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">לא נמצאו הוצאות בסינון הנבחר</td></tr>
                                        )}
                                    </tbody>
                                    {!loadingVariable && paginatedVariableExpenses.length > 0 && (
                                        <tfoot className="bg-slate-50 font-black border-t-2 border-slate-200">
                                            <tr>
                                                <td colSpan={4} className="px-6 py-4 text-start text-slate-600">סה"כ לסינון הנוכחי:</td>
                                                <td className="px-6 py-4 text-slate-800 font-mono">₪{variableSummaryTotals.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                <td className="px-6 py-4 text-primary font-mono">₪{variableSummaryTotals.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                            
                            {/* Pagination Controls for Variable Expenses */}
                            {variableTotalCount > 0 && (
                                <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200">
                                    <div className="flex items-center gap-4">
                                        <div className="text-sm text-slate-600">
                                            מציג {((variableCurrentPage - 1) * variablePageSize) + 1} - {Math.min(variableCurrentPage * variablePageSize, variableTotalCount)} מתוך {variableTotalCount} הוצאות
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm text-slate-600">שורות לעמוד:</label>
                                            <select 
                                                value={variablePageSize} 
                                                onChange={(e) => {
                                                    setVariablePageSize(parseInt(e.target.value));
                                                    setVariableCurrentPage(1);
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
                                            onClick={() => setVariableCurrentPage(1)}
                                            disabled={variableCurrentPage === 1 || loadingVariable}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            ראשון
                                        </button>
                                        <button
                                            onClick={() => setVariableCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={variableCurrentPage === 1 || loadingVariable}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            קודם
                                        </button>
                                        <span className="px-3 py-1 text-sm text-slate-600">
                                            עמוד {variableCurrentPage} מתוך {Math.ceil(variableTotalCount / variablePageSize) || 1}
                                        </span>
                                        <button
                                            onClick={() => setVariableCurrentPage(prev => Math.min(Math.ceil(variableTotalCount / variablePageSize) || 1, prev + 1))}
                                            disabled={variableCurrentPage >= Math.ceil(variableTotalCount / variablePageSize) || loadingVariable}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            הבא
                                        </button>
                                        <button
                                            onClick={() => setVariableCurrentPage(Math.ceil(variableTotalCount / variablePageSize) || 1)}
                                            disabled={variableCurrentPage >= Math.ceil(variableTotalCount / variablePageSize) || loadingVariable}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            אחרון
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'LOANS' && (
                        <div className="text-start">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-slate-800">ניהול הלוואות ומימון</h3>
                                    <p className="text-sm text-slate-500">מעקב אחר הלוואות בנקאיות, לוחות סילוקין והחזרים</p>
                                </div>
                                <button onClick={() => handleAdd('LOANS')} className="flex items-center px-5 py-2.5 bg-red-600 text-white rounded-lg shadow-lg font-black hover:bg-red-700 transition-all"><PlusIcon className="w-5 h-5 me-2"/> הוסף הלוואה</button>
                            </div>
                            
                            <div className="overflow-x-auto border rounded-xl shadow-sm bg-white">
                                <table className="min-w-full text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-500 font-black border-b uppercase text-[10px] tracking-widest">
                                        <tr>
                                            <th className="px-6 py-4">מלווה</th>
                                            <th className="px-6 py-4 text-center">תאריך התחלה</th>
                                            <th className="px-6 py-4 text-center">קרן מקורית</th>
                                            <th className="px-6 py-4 text-center">החזר חודשי</th>
                                            <th className="px-6 py-4 text-center">ריבית</th>
                                            <th className="px-6 py-4 text-center">מסמכים</th>
                                            <th className="px-6 py-4 text-center">התקדמות</th>
                                            <th className="px-6 py-4 text-center">יתרה נוכחית</th>
                                            <th className="px-6 py-4"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {loans.map(loan => {
                                            const schedule = loan.schedule || [];
                                            const totalPaymentsCount = schedule.length > 0 ? schedule.length : loan.durationMonths;
                                            const paymentsMadeCount = schedule.length > 0 ? schedule.filter(s => s.isPaid).length : loan.paymentsMade;
                                            
                                            const totalToPay = schedule.length > 0 
                                                ? schedule.reduce((acc, s) => acc + s.totalMonthlyPayment, 0)
                                                : loan.monthlyPayment * loan.durationMonths;
                                            
                                            const amountPaid = schedule.length > 0
                                                ? schedule.filter(s => s.isPaid).reduce((acc, s) => acc + s.totalMonthlyPayment, 0)
                                                : loan.monthlyPayment * loan.paymentsMade;
                                            
                                            const progress = totalToPay > 0 ? (amountPaid / totalToPay) * 100 : 0;
                                            const remaining = totalToPay - amountPaid;

                                            return (
                                                <tr key={loan.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => { setSelectedLoanForAmortization(loan); setIsAmortizationModalOpen(true); }}>
                                                    <td className="px-6 py-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-red-50 rounded-lg text-red-600"><BankIcon className="w-5 h-5"/></div>
                                                            <div>
                                                                <div className="font-black text-slate-800">{loan.lenderName}</div>
                                                                <div className="text-[10px] text-slate-400">{loan.description || 'ללא תיאור'}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5 text-center text-slate-500 font-medium">
                                                        {new Date(loan.startDate).toLocaleDateString('he-IL')}
                                                    </td>
                                                    <td className="px-6 py-5 text-center font-bold text-slate-700">
                                                        ₪{loan.principalAmount.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-5 text-center font-bold text-slate-800">
                                                        ₪{loan.monthlyPayment.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-5 text-center">
                                                        <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600">{loan.interestRate}%</span>
                                                    </td>
                                                    <td className="px-6 py-5 text-center">
                                                        {loan.amortizationFile ? (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setViewingLoanDoc(loan.amortizationFile!); }}
                                                                className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                                                                title="צפה במסמך"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                            </button>
                                                        ) : <span className="text-slate-300 text-xs">-</span>}
                                                    </td>
                                                    <td className="px-6 py-5 text-center">
                                                        <div className="flex flex-col items-center gap-1 min-w-[120px]">
                                                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                                <div className="bg-red-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, progress)}%` }}></div>
                                                            </div>
                                                            <span className="text-[12px] font-black text-slate-800 leading-tight">
                                                                {paymentsMadeCount} מתוך {totalPaymentsCount}
                                                            </span>
                                                            <span className="text-[9px] text-slate-400 font-bold uppercase">תשלומים</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5 text-center">
                                                        <span className="font-black text-red-600 text-lg">₪{remaining.toLocaleString()}</span>
                                                    </td>
                                                    <td className="px-6 py-5 text-left" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => { setSelectedLoanForAmortization(loan); setIsAmortizationModalOpen(true); }} className="text-primary hover:bg-blue-50 p-1.5 rounded" title="לוח סילוקין"><LogIcon className="w-5 h-5"/></button>
                                                            <button onClick={() => handleEditLoan(loan)} className="text-slate-400 hover:text-blue-500 p-1.5 rounded"><EditIcon className="w-5 h-5"/></button>
                                                            <button onClick={() => handleDelete('LOANS', loan.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded"><DeleteIcon className="h-5 w-5"/></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {loans.length === 0 && (
                                            <tr><td colSpan={9} className="px-6 py-20 text-center text-slate-400 italic">לא נמצאו הלוואות פעילות.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {activeTab === 'DEBTS' && (
                        <div className="text-start">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-slate-800">חובות לספקים ורשויות</h3>
                                    <p className="text-sm text-slate-500 mt-1">ניהול חובות פתוחים ותשלומים דחויים</p>
                                </div>
                                <button onClick={() => handleAdd('DEBTS')} className="flex items-center px-5 py-2.5 bg-purple-600 text-white rounded-lg shadow-lg font-black hover:bg-purple-700 transition-all"><PlusIcon className="w-5 h-5 me-2"/> הוסף חוב</button>
                            </div>

                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center">
                                <div className="relative flex-1 w-full">
                                    <input 
                                        type="text" 
                                        placeholder="חיפוש חוב או ספק..." 
                                        value={debtSearch}
                                        onChange={e => {
                                            setDebtSearch(e.target.value);
                                            setDebtsCurrentPage(1); // Reset to first page on search
                                        }}
                                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm bg-white p-2"
                                    />
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>
                                </div>
                                <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
                                    <button onClick={() => { setDebtStatusFilter('OPEN'); setDebtsCurrentPage(1); }} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${debtStatusFilter === 'OPEN' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>פתוחים</button>
                                    <button onClick={() => { setDebtStatusFilter('OVERDUE'); setDebtsCurrentPage(1); }} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${debtStatusFilter === 'OVERDUE' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>באיחור</button>
                                    <button onClick={() => { setDebtStatusFilter('ALL'); setDebtsCurrentPage(1); }} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${debtStatusFilter === 'ALL' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>הכל</button>
                                    <button onClick={() => { setDebtStatusFilter('PAID'); setDebtsCurrentPage(1); }} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${debtStatusFilter === 'PAID' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>שולמו</button>
                                </div>
                                <div className="text-xs text-slate-400 font-medium px-2 whitespace-nowrap">מציג {filteredDebts.length} מתוך {debtsTotalCount}</div>
                            </div>

                            <div className="border rounded-xl overflow-x-auto bg-white shadow-sm">
                                <table className="min-w-full text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-500 font-black border-b uppercase text-[10px] tracking-widest text-center">
                                        <tr><th className="px-6 py-4 w-12 text-right"></th><th className="px-6 py-4 text-right">שם החוב</th><th className="px-6 py-4">תאריך יצירה</th><th className="px-6 py-4">תאריך יעד</th><th className="px-6 py-4">נטו</th><th className="px-6 py-4">מע"מ</th><th className="px-6 py-4 bg-purple-50/30">סה"כ</th><th className="px-6 py-4">יתרה פתוחה</th><th className="px-6 py-4"></th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredDebts.map(debt => {
                                            const isExpanded = expandedDebts.has(debt.id);
                                            const net = debt.isVatExempt ? debt.amount : (debt.includesVat ? debt.amount / (1 + vatRate / 100) : debt.amount);
                                            return (
                                                <React.Fragment key={debt.id}>
                                                    <tr className={`hover:bg-slate-50 transition-colors ${debt.isFullyPaid ? 'opacity-60 bg-green-50/10' : ''}`}>
                                                        <td className="px-6 py-5 text-center"><button onClick={() => toggleDebtExpansion(debt.id)} className={`text-slate-400 hover:text-primary transition-transform ${isExpanded ? 'rotate-180' : ''}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg></button></td>
                                                        <td className="px-6 py-5 font-black text-slate-800"><div className="flex flex-col"><div className="flex items-center gap-2"><span>{debt.name}</span>{debt.isVatExempt && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-black">פטור</span>}{debt.isOverdue && <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded font-black animate-pulse">בפיגור</span>}</div>{debt.description && <span className="text-[10px] text-slate-400 font-normal line-clamp-1">{debt.description}</span>}</div></td>
                                                        <td className="px-6 py-5 text-slate-500 font-medium text-center">{new Date(debt.createdAt).toLocaleDateString('he-IL')}</td>
                                                        <td className="px-6 py-5 text-slate-500 font-medium text-center"><span className={debt.isOverdue ? 'text-red-600 font-bold' : ''}>{new Date(debt.dueDate).toLocaleDateString('he-IL')}</span></td>
                                                        <td className="px-6 py-5 text-slate-500 font-mono text-center">₪{net.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                        <td className="px-6 py-5 text-slate-400 font-mono text-center">₪{(debt.gross - net).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                        <td className="px-6 py-5 font-black text-slate-900 bg-purple-50/10 text-center">₪{debt.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                        <td className="px-6 py-5 text-center">{debt.isFullyPaid ? <span className="text-green-600 font-black bg-green-50 px-3 py-1 rounded-full border border-green-100 text-xs">שולם</span> : <div className="flex flex-col items-center"><span className="text-red-600 font-black text-lg leading-none">₪{debt.remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>{debt.paid > 0.1 && <span className="text-[10px] text-blue-600 font-bold mt-1">שולם חלקית (₪{debt.paid.toLocaleString()})</span>}</div>}</td>
                                                        <td className="px-6 py-5 text-left"><div className="flex gap-3 justify-end items-center">{!debt.isFullyPaid && <button onClick={() => { setSelectedDebtForPayment(debt); setIsPaymentModalOpen(true); }} className="text-white bg-purple-600 px-4 py-1.5 rounded-lg font-black text-xs shadow-lg hover:bg-purple-700 transition-all">בצע החזר</button>}{((): boolean => { const list = debt.attachments ?? (debt.attachment ? [debt.attachment] : []); return list.length > 0; })() && (() => { const list = debt.attachments ?? (debt.attachment ? [debt.attachment] : []); return (<span className="relative inline-flex"><button onClick={(e) => { e.stopPropagation(); setViewingAttachmentList(list); setViewingAttachmentIndex(0); setViewingLoanDoc(list[0]); }} className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors" title={list.length > 1 ? `צפה במסמכים (${list.length})` : 'צפה במסמך'}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button>{list.length > 1 && <span className="absolute -top-0.5 -right-0.5 bg-purple-600 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{list.length}</span>}</span>); })()}<button onClick={() => handleEditDebt(debt)} className="text-slate-300 hover:text-blue-500"><EditIcon className="w-5 h-5"/></button></div></td>
                                                    </tr>
                                                    {isExpanded && debt.payments && debt.payments.length > 0 && (
                                                        <tr className="bg-slate-50/30"><td colSpan={9} className="px-6 py-4"><div className="bg-white rounded border border-slate-200 shadow-inner overflow-hidden"><table className="min-w-full text-xs text-right"><thead className="bg-slate-50 text-slate-500 font-bold uppercase"><tr><th className="px-4 py-2">תאריך</th><th className="px-4 py-2">סכום</th><th className="px-4 py-2">שיטה</th><th className="px-4 py-2">אסמכתא</th><th className="px-4 py-2">סטטוס</th><th className="px-4 py-2">הערה</th><th className="px-4 py-2"></th></tr></thead><tbody className="divide-y divide-slate-100">{debt.payments.map(p => (<tr key={p.id} className="hover:bg-slate-50 group"><td className="px-4 py-2">{new Date(p.date).toLocaleDateString('he-IL')}</td><td className="px-4 py-2 font-bold text-green-700">₪{p.amount.toLocaleString()}</td><td className="px-4 py-2">{p.method}</td><td className="px-4 py-2 font-mono">{p.reference || '-'}</td><td className="px-4 py-2"><button onClick={() => {const agCheck: AggregatedCheck = { uniqueId: p.id, type: 'OUTGOING', date: new Date(p.date), repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date), amount: p.amount, reference: p.reference || '-', entityName: `חוב: ${debt.name}`, status: p.status || 'CLEARED', statusHistory: p.statusHistory || [], sources: [{ orderId: 'DEBT', orderNumber: 'DEBT', paymentId: p.id, sourceType: 'debt', debtId: debt.id, amount: p.amount }] }; setSelectedCheckForDebt({ check: agCheck, viewOnly: false });}} className={`px-2 py-0.5 rounded text-[10px] font-bold shadow-sm ${['BOUNCED', 'CANCELED', 'RETURNED'].includes(p.status || '') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{p.status === 'CLEARED' ? 'נפרע' : p.status === 'PENDING' ? 'ממתין' : p.status || 'שולם'}</button></td><td className="px-4 py-2 text-slate-500 max-w-xs truncate">{p.note || '-'}</td><td className="px-4 py-2 text-left"><button onClick={() => handleDeleteDebtPayment(debt.id, p.id)} className="text-red-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><DeleteIcon className="w-3.5 h-3.5"/></button></td></tr>))}</tbody></table></div></td></tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Pagination Controls for DEBTS */}
                            {debtsTotalCount > 0 && (
                                <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200">
                                    <div className="flex items-center gap-4">
                                        <div className="text-sm text-slate-600">
                                            מציג {((debtsCurrentPage - 1) * debtsPageSize) + 1} - {Math.min(debtsCurrentPage * debtsPageSize, debtsTotalCount)} מתוך {debtsTotalCount} חובות
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm text-slate-600">שורות לעמוד:</label>
                                            <select 
                                                value={debtsPageSize} 
                                                onChange={(e) => {
                                                    setDebtsPageSize(parseInt(e.target.value));
                                                    setDebtsCurrentPage(1);
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
                                            onClick={() => setDebtsCurrentPage(1)}
                                            disabled={debtsCurrentPage === 1 || loadingDebts}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            ראשון
                                        </button>
                                        <button
                                            onClick={() => setDebtsCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={debtsCurrentPage === 1 || loadingDebts}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            קודם
                                        </button>
                                        <span className="px-3 py-1 text-sm text-slate-600">
                                            עמוד {debtsCurrentPage} מתוך {Math.ceil(debtsTotalCount / debtsPageSize) || 1}
                                        </span>
                                        <button
                                            onClick={() => setDebtsCurrentPage(prev => Math.min(Math.ceil(debtsTotalCount / debtsPageSize) || 1, prev + 1))}
                                            disabled={debtsCurrentPage >= Math.ceil(debtsTotalCount / debtsPageSize) || loadingDebts}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            הבא
                                        </button>
                                        <button
                                            onClick={() => setDebtsCurrentPage(Math.ceil(debtsTotalCount / debtsPageSize) || 1)}
                                            disabled={debtsCurrentPage >= Math.ceil(debtsTotalCount / debtsPageSize) || loadingDebts}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            אחרון
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {loadingDebts && (
                                <div className="mt-4 text-center text-slate-500 text-sm">טוען...</div>
                            )}
                        </div>
                    )}
                    {activeTab === 'RECEIVABLES' && (
                        <div className="text-start">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-slate-800">חייבים (Accounts Receivable)</h3>
                                    <p className="text-sm text-slate-500 mt-1">ניהול כספים שאמורים להיכנס לעסק (לא ממכירות שוטפות)</p>
                                </div>
                                <button onClick={() => handleAdd('RECEIVABLES')} className="flex items-center px-5 py-2.5 bg-indigo-600 text-white rounded-lg shadow-lg font-black hover:bg-indigo-700 transition-all"><PlusIcon className="w-5 h-5 me-2"/> הוסף חייב</button>
                            </div>

                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center">
                                <div className="relative flex-1 w-full">
                                    <input 
                                        type="text" 
                                        placeholder="חיפוש חייב..." 
                                        value={receivableSearch}
                                        onChange={e => {
                                            setReceivableSearch(e.target.value);
                                            setReceivablesCurrentPage(1); // Reset to first page on search
                                        }}
                                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white p-2"
                                    />
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>
                                </div>
                                <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
                                    <button onClick={() => { setReceivableStatusFilter('OPEN'); setReceivablesCurrentPage(1); }} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${receivableStatusFilter === 'OPEN' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>פתוחים</button>
                                    <button onClick={() => { setReceivableStatusFilter('OVERDUE'); setReceivablesCurrentPage(1); }} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${receivableStatusFilter === 'OVERDUE' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>בפיגור</button>
                                    <button onClick={() => { setReceivableStatusFilter('ALL'); setReceivablesCurrentPage(1); }} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${receivableStatusFilter === 'ALL' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>הכל</button>
                                    <button onClick={() => { setReceivableStatusFilter('PAID'); setReceivablesCurrentPage(1); }} className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${receivableStatusFilter === 'PAID' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>נגבו</button>
                                </div>
                            </div>

                            <div className="border rounded-xl overflow-x-auto bg-white shadow-sm">
                                <table className="min-w-full text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-500 font-black border-b uppercase text-[10px] tracking-widest text-center">
                                        <tr><th className="px-6 py-4 w-12 text-right"></th><th className="px-6 py-4 text-right">שם החייב</th><th className="px-6 py-4">תאריך יצירה</th><th className="px-6 py-4">תאריך יעד לגבייה</th><th className="px-6 py-4">ברוטו</th><th className="px-6 py-4">יתרה לגבייה</th><th className="px-6 py-4"></th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredReceivables.map(rec => {
                                            const isExpanded = expandedReceivables.has(rec.id);
                                            return (
                                                <React.Fragment key={rec.id}>
                                                    <tr className={`hover:bg-slate-50 transition-colors ${rec.isFullyPaid ? 'opacity-60 bg-green-50/10' : ''}`}>
                                                        <td className="px-6 py-5 text-center"><button onClick={() => toggleReceivableExpansion(rec.id)} className={`text-slate-400 hover:text-primary transition-transform ${isExpanded ? 'rotate-180' : ''}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg></button></td>
                                                        <td className="px-6 py-5 font-black text-slate-800"><div className="flex flex-col"><div className="flex items-center gap-2"><span>{rec.name}</span>{rec.isOverdue && <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded font-black animate-pulse">בפיגור</span>}</div>{rec.description && <span className="text-[10px] text-slate-400 font-normal line-clamp-1">{rec.description}</span>}</div></td>
                                                        <td className="px-6 py-5 text-slate-500 font-medium text-center">{new Date(rec.createdAt).toLocaleDateString('he-IL')}</td>
                                                        <td className="px-6 py-5 text-slate-500 font-medium text-center"><span className={rec.isOverdue ? 'text-red-600 font-bold' : ''}>{new Date(rec.dueDate).toLocaleDateString('he-IL')}</span></td>
                                                        <td className="px-6 py-5 font-black text-slate-900 text-center">₪{rec.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                        <td className="px-6 py-5 text-center">{rec.isFullyPaid ? <span className="text-green-600 font-black bg-green-50 px-3 py-1 rounded-full border border-green-100 text-xs">נגבה במלואו</span> : <div className="flex flex-col items-center"><span className="text-indigo-600 font-black text-lg leading-none">₪{rec.remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>{rec.collected > 0.1 && <span className="text-[10px] text-green-600 font-bold mt-1">נגבה חלקית (₪{rec.collected.toLocaleString()})</span>}</div>}</td>
                                                        <td className="px-6 py-5 text-left"><div className="flex gap-3 justify-end items-center">{!rec.isFullyPaid && <button onClick={() => { setSelectedReceivableForCollection(rec); setIsPaymentModalOpen(true); }} className="text-white bg-indigo-600 px-4 py-1.5 rounded-lg font-black text-xs shadow-lg hover:bg-indigo-700 transition-all">דווח גבייה</button>}{(rec.attachments?.length ?? 0) > 0 && (() => { const list = rec.attachments ?? []; return (<span className="relative inline-flex"><button onClick={(e) => { e.stopPropagation(); setViewingAttachmentList(list); setViewingAttachmentIndex(0); setViewingLoanDoc(list[0]); }} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors" title={list.length > 1 ? `צפה במסמכים (${list.length})` : 'צפה במסמך'}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button>{list.length > 1 && <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{list.length}</span>}</span>); })()}<button onClick={() => handleEditReceivable(rec)} className="text-slate-300 hover:text-blue-500"><EditIcon className="w-5 h-5"/></button></div></td>
                                                    </tr>
                                                    {isExpanded && rec.payments && rec.payments.length > 0 && (
                                                        <tr className="bg-slate-50/30"><td colSpan={7} className="px-6 py-4"><div className="bg-white rounded border border-slate-200 shadow-inner overflow-hidden"><table className="min-w-full text-xs text-right"><thead className="bg-slate-50 text-slate-500 font-bold uppercase"><tr><th className="px-4 py-2">תאריך קבלה</th><th className="px-4 py-2">סכום</th><th className="px-4 py-2">שיטה</th><th className="px-4 py-2">אסמכתא</th><th className="px-4 py-2">סטטוס</th><th className="px-4 py-2"></th></tr></thead><tbody className="divide-y divide-slate-100">{rec.payments.map(p => (<tr key={p.id} className="hover:bg-slate-50 group"><td className="px-4 py-2">{new Date(p.date).toLocaleDateString('he-IL')}</td><td className="px-4 py-2 font-bold text-green-700">₪{p.amount.toLocaleString()}</td><td className="px-4 py-2">{p.method}</td><td className="px-4 py-2 font-mono">{p.reference || '-'}</td><td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold shadow-sm ${['BOUNCED', 'CANCELED', 'RETURNED'].includes(p.status || '') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{p.status === 'CLEARED' ? 'תקין' : p.status === 'PENDING' ? 'ממתין' : p.status || 'נגבה'}</span></td><td className="px-4 py-2 text-left"><button onClick={() => handleDeleteReceivablePayment(rec.id, p.id)} className="text-red-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><DeleteIcon className="w-3.5 h-3.5"/></button></td></tr>))}</tbody></table></div></td></tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                        {filteredReceivables.length === 0 && (
                                            <tr><td colSpan={7} className="px-6 py-20 text-center text-slate-400 font-medium">לא נמצאו חייבים התואמים את הסינון.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Pagination Controls for RECEIVABLES */}
                            {receivablesTotalCount > 0 && (
                                <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200">
                                    <div className="flex items-center gap-4">
                                        <div className="text-sm text-slate-600">
                                            מציג {((receivablesCurrentPage - 1) * receivablesPageSize) + 1} - {Math.min(receivablesCurrentPage * receivablesPageSize, receivablesTotalCount)} מתוך {receivablesTotalCount} חייבים
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm text-slate-600">שורות לעמוד:</label>
                                            <select 
                                                value={receivablesPageSize} 
                                                onChange={(e) => {
                                                    setReceivablesPageSize(parseInt(e.target.value));
                                                    setReceivablesCurrentPage(1);
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
                                            onClick={() => setReceivablesCurrentPage(1)}
                                            disabled={receivablesCurrentPage === 1 || loadingReceivables}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            ראשון
                                        </button>
                                        <button
                                            onClick={() => setReceivablesCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={receivablesCurrentPage === 1 || loadingReceivables}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            קודם
                                        </button>
                                        <span className="px-3 py-1 text-sm text-slate-600">
                                            עמוד {receivablesCurrentPage} מתוך {Math.ceil(receivablesTotalCount / receivablesPageSize) || 1}
                                        </span>
                                        <button
                                            onClick={() => setReceivablesCurrentPage(prev => Math.min(Math.ceil(receivablesTotalCount / receivablesPageSize) || 1, prev + 1))}
                                            disabled={receivablesCurrentPage >= Math.ceil(receivablesTotalCount / receivablesPageSize) || loadingReceivables}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            הבא
                                        </button>
                                        <button
                                            onClick={() => setReceivablesCurrentPage(Math.ceil(receivablesTotalCount / receivablesPageSize) || 1)}
                                            disabled={receivablesCurrentPage >= Math.ceil(receivablesTotalCount / receivablesPageSize) || loadingReceivables}
                                            className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            אחרון
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {loadingReceivables && (
                                <div className="mt-4 text-center text-slate-500 text-sm">טוען...</div>
                            )}
                        </div>
                    )}
                    {activeTab === 'EQUITY' && (
                        <div className="text-start">
                             <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-slate-800">הון בעלים והשקעות</h3>
                                <button onClick={() => handleAdd('EQUITY')} className="flex items-center px-5 py-2.5 bg-green-600 text-white rounded-lg shadow-lg font-black hover:bg-green-700 transition-all"><PlusIcon className="w-5 h-5 me-2"/> הוסף תנועת הון</button>
                            </div>
                            <div className="space-y-4">
                                {equityByInvestor.map(inv => {
                                    const isExpanded = expandedInvestors.has(inv.name);
                                    return (
                                        <div key={inv.name} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                                            <div onClick={() => toggleInvestorExpansion(inv.name)} className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}><svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg></div>
                                                    <div><h4 className="font-black text-lg text-slate-800">{inv.name}</h4><p className="text-xs text-slate-500">{inv.type}</p></div>
                                                </div>
                                                <div className="flex gap-10">
                                                    <div className="text-center"><span className="block text-[10px] uppercase font-black text-slate-400">הזרמות הון</span><span className="font-black text-green-600">₪{inv.totalInvested.toLocaleString()}</span></div>
                                                    <div className="text-center"><span className="block text-[10px] uppercase font-black text-slate-400">משיכות / החזר</span><span className="font-black text-red-600">₪{inv.totalWithdrawn.toLocaleString()}</span></div>
                                                    <div className="text-center border-r pr-10"><span className="block text-[10px] uppercase font-black text-slate-400">יתרה נוכחית</span><span className="font-black text-xl text-primary">₪{(inv.totalInvested - inv.totalWithdrawn).toLocaleString()}</span></div>
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div className="border-t bg-slate-50 p-5">
                                                    <table className="min-w-full text-xs text-right">
                                                        <thead className="text-slate-400 font-black uppercase"><tr><th className="px-4 py-2">תאריך</th><th className="px-4 py-2">סוג פעולה</th><th className="px-4 py-2">סכום</th><th className="px-4 py-2">תיאור</th><th className="px-4 py-2"></th></tr></thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {inv.transactions.map(item => (
                                                                <tr key={item.id}>
                                                                    <td className="px-4 py-3">{new Date(item.date).toLocaleDateString('he-IL')}</td>
                                                                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full font-bold ${item.transactionType === 'DEPOSIT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.transactionType === 'DEPOSIT' ? 'הזרמה' : 'משיכה'}</span></td>
                                                                    <td className="px-4 py-3 font-black">₪{item.amount.toLocaleString()}</td>
                                                                    <td className="px-4 py-3 text-slate-500">{item.description}</td>
                                                                    <td className="px-4 py-3 text-left"><div className="flex gap-2 justify-end"><button onClick={() => handleEditEquity(item)} className="text-slate-300 hover:text-blue-500"><EditIcon className="w-4 h-4"/></button><button onClick={() => handleDelete('EQUITY', item.id)} className="text-slate-300 hover:text-red-500"><DeleteIcon className="w-4 h-4"/></button></div></td>
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
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <Modal title={editingId ? 'עריכת פריט' : (activeTab === 'FIXED' ? 'הוצאה קבועה' : activeTab === 'VARIABLE' ? 'הוצאה משתנה' : activeTab === 'LOANS' ? 'הלוואה' : activeTab === 'DEBTS' ? 'חוב' : activeTab === 'RECEIVABLES' ? 'חייב חדש' : 'תנועת הון')} onClose={() => setIsModalOpen(false)} size="4xl">
                    <div className="space-y-4 text-start">
                        {activeTab === 'FIXED' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">שם ההוצאה / הספק</label><input type="text" value={fixedForm.name || ''} onChange={e => setFixedForm({...fixedForm, name: e.target.value})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" placeholder="לדוג': ארנונה, בזק, מנורה..." /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">קטגוריה</label><input type="text" list="fixed-categories" value={fixedForm.category || ''} onChange={e => setFixedForm({...fixedForm, category: e.target.value})} className="block w-full border-slate-300 rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /><datalist id="fixed-categories"><option value="תקשורת"/><option value="נדל''ן"/><option value="מיסים"/><option value="ביטוח"/><option value="שירותים מקצועיים"/></datalist></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">יום חיוב (1-31)</label><input type="number" min="1" max="31" value={fixedForm.paymentDay || ''} onChange={e => setFixedForm({...fixedForm, paymentDay: parseInt(e.target.value)})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">סכום חודשי (נטו)</label><input type="number" value={fixedForm.monthlyAmount || ''} onChange={e => setFixedForm({...fixedForm, monthlyAmount: parseFloat(e.target.value)})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div className="grid grid-cols-2 gap-2 mt-4"><label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2 rounded border border-slate-200"><input type="checkbox" checked={fixedForm.includesVat} onChange={e => setFixedForm({...fixedForm, includesVat: e.target.checked})} className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary" disabled={fixedForm.isVatExempt} /><span className={`text-sm font-bold ${fixedForm.isVatExempt ? 'text-slate-400' : 'text-slate-700'}`}>הסכום שהוזן כולל מע"מ</span></label><label className="flex items-center gap-2 cursor-pointer bg-amber-50 p-2 rounded border border-amber-200"><input type="checkbox" checked={fixedForm.isVatExempt} onChange={e => setFixedForm({...fixedForm, isVatExempt: e.target.checked})} className="h-4 w-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500" /><span className="text-sm font-bold text-amber-800">הוצאה פטורה ממע"מ</span></label></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">אמצעי תשלום</label><select value={fixedForm.paymentMethod} onChange={e => setFixedForm({...fixedForm, paymentMethod: e.target.value as PaymentMethod})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm bg-white p-2">{Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">פרטי תשלום (כרטיס/חשבון)</label><input type="text" value={fixedForm.paymentDetails || ''} onChange={e => setFixedForm({...fixedForm, paymentDetails: e.target.value})} className="block w-full border-slate-300 rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" placeholder="ויזה 1234, חשבון בנק..." /></div>
                                {fixedForm.paymentMethod === PaymentMethod.CHECK && (
                                    <div className="md:col-span-2 mt-4 space-y-4">
                                        <CheckSeriesGenerator initialAmount={fixedForm.isVatExempt ? (fixedForm.monthlyAmount || 0) : (fixedForm.includesVat ? (fixedForm.monthlyAmount || 0) : (fixedForm.monthlyAmount || 0) * (1 + vatRate / 100))} onGenerated={(checks) => setFixedForm({ ...fixedForm, checks: [...(fixedForm.checks || []), ...checks] })} />
                                        {fixedForm.checks && fixedForm.checks.length > 0 && (
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                                <div className="flex justify-between items-center mb-3"><h4 className="text-sm font-bold text-slate-700">עריכת רשימת צ'קים ({fixedForm.checks.length})</h4><button type="button" onClick={() => setFixedForm({ ...fixedForm, checks: [] })} className="text-[10px] text-red-500 font-bold hover:underline">נקה הכל</button></div>
                                                <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar pe-2">
                                                    {fixedForm.checks.map((c, i) => (
                                                        <div key={c.id || i} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded shadow-sm border border-slate-100 group">
                                                            <div className="col-span-1 text-[10px] font-bold text-slate-400">#{i+1}</div>
                                                            <div className="col-span-3"><label className="text-[9px] text-slate-400 block">מספר צ'ק</label><input type="text" value={c.reference} onChange={(e) => handleUpdateFixedFormCheck(i, 'reference', e.target.value)} className="w-full text-xs p-1 border border-slate-300 rounded" /></div>
                                                            <div className="col-span-3"><label className="text-[9px] text-slate-400 block">סכום</label><input type="number" value={c.amount} onChange={(e) => handleUpdateFixedFormCheck(i, 'amount', e.target.value)} className="w-full text-xs p-1 border border-slate-300 rounded font-bold text-indigo-600" /></div>
                                                            <div className="col-span-4"><label className="text-[9px] text-slate-400 block">תאריך פירעון</label><input type="date" value={c.repaymentDate ? new Date(c.repaymentDate).toISOString().split('T')[0] : ''} onChange={(e) => handleUpdateFixedFormCheck(i, 'repaymentDate', e.target.value)} className="w-full text-xs p-1 border border-slate-300 rounded" /></div>
                                                            <div className="col-span-1 text-center"><button type="button" onClick={() => handleRemoveCheckFromFixedForm(i)} className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><DeleteIcon className="w-4 h-4"/></button></div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => setFixedForm({ ...fixedForm, checks: [...(fixedForm.checks || []), { id: `sp_fix_${Date.now()}`, amount: fixedForm.monthlyAmount || 0, date: new Date(), repaymentDate: new Date(), method: PaymentMethod.CHECK, reference: '', status: 'PENDING' }] })} className="w-full mt-3 py-1.5 border border-dashed border-indigo-300 text-indigo-600 text-xs font-bold rounded hover:bg-indigo-50 transition-colors">+ הוסף צ'ק בודד לרשימה</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך התחלה</label><input type="date" value={fixedForm.startDate ? new Date(fixedForm.startDate).toISOString().split('T')[0] : ''} onChange={e => setFixedForm({...fixedForm, startDate: new Date(e.target.value)})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך סיום (אופציונלי)</label><input type="date" value={fixedForm.endDate ? new Date(fixedForm.endDate).toISOString().split('T')[0] : ''} onChange={e => setFixedForm({...fixedForm, endDate: e.target.value ? new Date(e.target.value) : undefined})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">תיאור / הערות</label><textarea value={fixedForm.description || ''} onChange={e => setFixedForm({...fixedForm, description: e.target.value})} rows={2} className="block w-full border-slate-300 rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                            </div>
                        )}
                        {activeTab === 'VARIABLE' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">שם ההוצאה</label><input type="text" value={variableForm.name || ''} onChange={e => setVariableForm({...variableForm, name: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">קטגוריה</label><input type="text" value={variableForm.category || ''} onChange={e => setVariableForm({...variableForm, category: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך</label><input type="date" value={variableForm.date ? new Date(variableForm.date).toISOString().split('T')[0] : ''} onChange={e => setVariableForm({...variableForm, date: new Date(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">סכום (נטו)</label><input type="number" value={variableForm.amount || ''} onChange={e => setVariableForm({...variableForm, amount: parseFloat(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div className="grid grid-cols-2 gap-2 mt-4"><label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2 rounded border border-slate-200"><input type="checkbox" checked={variableForm.includesVat} onChange={e => setVariableForm({...variableForm, includesVat: e.target.checked})} className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary" disabled={variableForm.isVatExempt} /><span className={`text-sm font-bold ${variableForm.isVatExempt ? 'text-slate-400' : 'text-slate-700'}`}>הסכום שהוזן כולל מע"מ</span></label><label className="flex items-center gap-2 cursor-pointer bg-amber-50 p-2 rounded border border-amber-200"><input type="checkbox" checked={variableForm.isVatExempt} onChange={e => setVariableForm({...variableForm, isVatExempt: e.target.checked})} className="h-4 w-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500" /><span className="text-sm font-bold text-amber-800">הוצאה פטורה ממע"מ</span></label></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">אמצעי תשלום</label><select value={variableForm.paymentMethod} onChange={e => setVariableForm({...variableForm, paymentMethod: e.target.value as PaymentMethod})} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-white p-2">{Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">פרטי תשלום (כרטיס/חשבון)</label><input type="text" value={variableForm.paymentDetails || ''} onChange={e => setVariableForm({...variableForm, paymentDetails: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" placeholder="ויזה 1234, חשבון בנק..." /></div>
                                {variableForm.paymentMethod === PaymentMethod.CHECK && (
                                    <div className="md:col-span-2 mt-4 space-y-4">
                                        <CheckSeriesGenerator initialAmount={variableForm.isVatExempt ? (variableForm.amount || 0) : (variableForm.includesVat ? (variableForm.amount || 0) : (variableForm.amount || 0) * (1 + vatRate / 100))} onGenerated={(checks) => setVariableForm({ ...variableForm, checks: [...(variableForm.checks || []), ...checks] })} />
                                        {variableForm.checks && variableForm.checks.length > 0 && (
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                                <div className="flex justify-between items-center mb-3"><h4 className="text-sm font-bold text-slate-700">עריכת רשימת צ'קים ({variableForm.checks.length})</h4><button type="button" onClick={() => setVariableForm({ ...variableForm, checks: [] })} className="text-[10px] text-red-500 font-bold hover:underline">נקה הכל</button></div>
                                                <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar pe-2">
                                                    {variableForm.checks.map((c, i) => (
                                                        <div key={c.id || i} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded shadow-sm border border-slate-100 group">
                                                            <div className="col-span-1 text-[10px] font-bold text-slate-400">#{i+1}</div>
                                                            <div className="col-span-3"><label className="text-[9px] text-slate-400 block">מספר צ'ק</label><input type="text" value={c.reference} onChange={(e) => handleUpdateVariableFormCheck(i, 'reference', e.target.value)} className="w-full text-xs p-1 border border-slate-300 rounded" /></div>
                                                            <div className="col-span-3"><label className="text-[9px] text-slate-400 block">סכום</label><input type="number" value={c.amount} onChange={(e) => handleUpdateVariableFormCheck(i, 'amount', e.target.value)} className="w-full text-xs p-1 border border-slate-300 rounded font-bold text-indigo-600" /></div>
                                                            <div className="col-span-4"><label className="text-[9px] text-slate-400 block">תאריך פירעון</label><input type="date" value={c.repaymentDate ? new Date(c.repaymentDate).toISOString().split('T')[0] : ''} onChange={(e) => handleUpdateVariableFormCheck(i, 'repaymentDate', e.target.value)} className="w-full text-xs p-1 border border-slate-300 rounded" /></div>
                                                            <div className="col-span-1 text-center"><button type="button" onClick={() => handleRemoveCheckFromVariableForm(i)} className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><DeleteIcon className="w-4 h-4"/></button></div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => setVariableForm({ ...variableForm, checks: [...(variableForm.checks || []), { id: `sp_var_${Date.now()}`, amount: variableForm.amount || 0, date: new Date(), repaymentDate: new Date(), method: PaymentMethod.CHECK, reference: '', status: 'PENDING' }] })} className="w-full mt-3 py-1.5 border border-dashed border-indigo-300 text-indigo-600 text-xs font-bold rounded hover:bg-indigo-50 transition-colors">+ הוסף צ'ק בודד לרשימה</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">תיאור / הערות</label><textarea value={variableForm.description || ''} onChange={e => setVariableForm({...variableForm, description: e.target.value})} rows={2} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                            </div>
                        )}
                        {activeTab === 'LOANS' && (
                            <div className="space-y-6 text-start">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                                    <h4 className="text-sm font-black text-slate-700 border-b pb-2">נתוני יסוד להלוואה</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">שם המלווה / בנק</label><input type="text" value={loanForm.lenderName || ''} onChange={e => setLoanForm({...loanForm, lenderName: e.target.value})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                        <div><label className="block text-sm font-bold text-slate-700 mb-1">סכום הקרן (₪)</label><input type="number" value={loanForm.principalAmount || ''} onChange={e => setLoanForm({...loanForm, principalAmount: parseFloat(e.target.value)})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                        <div><label className="block text-sm font-bold text-slate-700 mb-1">ריבית שנתית (%)</label><input type="number" value={loanForm.interestRate || ''} onChange={e => setLoanForm({...loanForm, interestRate: parseFloat(e.target.value)})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                        <div><label className="block text-sm font-bold text-slate-700 mb-1">תקופה (חודשים)</label><input type="number" value={loanForm.durationMonths || ''} onChange={e => setLoanForm({...loanForm, durationMonths: parseInt(e.target.value)})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                        <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך התחלה</label><input type="date" value={loanForm.startDate ? new Date(loanForm.startDate).toISOString().split('T')[0] : ''} onChange={e => setLoanForm({...loanForm, startDate: new Date(e.target.value)})} className="block w-full border-slate-300 rounded-md shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                    </div>
                                </div>

                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col md:flex-row justify-between items-center gap-4">
                                    <div>
                                        <h4 className="text-xs font-black text-indigo-700 uppercase">החזר חודשי מחושב (שפיצר)</h4>
                                        <div className="flex items-baseline gap-2 mt-1">
                                            <span className="text-3xl font-black text-indigo-900">₪{(loanForm.monthlyPayment || 0).toLocaleString()}</span>
                                            <span className="text-xs text-indigo-500 font-bold">לחודש</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            type="button" 
                                            onClick={() => setShowLoanPreview(!showLoanPreview)}
                                            className="px-4 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-100 transition-all flex items-center gap-2"
                                        >
                                            <LogIcon className="w-4 h-4"/>
                                            {showLoanPreview ? 'הסתר תצוגה מקדימה' : 'תצוגה מקדימה של הלוח'}
                                        </button>
                                    </div>
                                </div>

                                {showLoanPreview && (
                                    <div className="animate-fadeIn">
                                        <AmortizationModal 
                                            loan={{
                                                ...loanForm,
                                                id: 'preview',
                                                schedule: generateSpitzerSchedule(
                                                    loanForm.principalAmount || 0, 
                                                    loanForm.interestRate || 0, 
                                                    loanForm.durationMonths || 12, 
                                                    loanForm.startDate || new Date(),
                                                    loanForm.paymentsMade || 0
                                                )
                                            } as Loan}
                                            onClose={() => setShowLoanPreview(false)}
                                            onUpdateSchedule={() => {}}
                                            isReadOnly={true}
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                                    <div><label className="block text-sm font-bold text-slate-700 mb-1">תשלומים שכבר בוצעו</label><input type="number" value={loanForm.paymentsMade || ''} onChange={e => setLoanForm({...loanForm, paymentsMade: parseInt(e.target.value)})} className="block w-full border-slate-300 rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">מסמכי הלוואה (חוזה/לוח סילוקין)</label>
                                        {!loanForm.amortizationFile ? (
                                            <input type="file" onChange={handleLoanFileChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                                        ) : (
                                            <div className="flex items-center justify-between p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <svg className="w-5 h-5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    <span className="text-xs font-bold text-indigo-700 truncate">{loanForm.amortizationFile.fileName}</span>
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    <button type="button" onClick={() => setViewingLoanDoc(loanForm.amortizationFile!)} className="text-[10px] bg-white border border-indigo-200 px-2 py-1 rounded font-bold text-indigo-600 hover:bg-indigo-100">צפה</button>
                                                    <button type="button" onClick={() => {
                                                        if (window.confirm(`האם אתה בטוח שברצונך להסיר את הקובץ "${loanForm.amortizationFile?.fileName || 'קובץ'}"?`)) {
                                                            setLoanForm({...loanForm, amortizationFile: undefined});
                                                        }
                                                    }} className="text-[10px] text-red-500 font-bold px-2 py-1 hover:bg-red-50 rounded">הסר</button>
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-[10px] text-slate-400 mt-1">תומך בתמונות, PDF, וקבצי Office</p>
                                    </div>
                                    <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">תיאור / הערות</label><textarea value={loanForm.description || ''} onChange={e => setLoanForm({...loanForm, description: e.target.value})} rows={2} className="block w-full border-slate-300 rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                </div>
                                <div className="bg-amber-50 p-3 rounded border border-amber-200 text-[10px] text-amber-800">
                                    <strong>שים לב:</strong> שינוי של סכום הקרן או פריסת החודשים יעדכן אוטומטית את לוח הסילוקין בעת השמירה.
                                </div>
                            </div>
                        )}
                        {activeTab === 'DEBTS' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">שם החוב / הספק</label><input type="text" value={debtForm.name || ''} onChange={e => setDebtForm({...debtForm, name: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך יצירה</label><input type="date" value={debtForm.createdAt ? new Date(debtForm.createdAt).toISOString().split('T')[0] : ''} onChange={e => setDebtForm({...debtForm, createdAt: new Date(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך יעד לתשלום</label><input type="date" value={debtForm.dueDate ? new Date(debtForm.dueDate).toISOString().split('T')[0] : ''} onChange={e => setDebtForm({...debtForm, dueDate: new Date(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">סכום הקרן (נטו)</label><input type="number" value={debtForm.amount || ''} onChange={e => setDebtForm({...debtForm, amount: parseFloat(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div className="grid grid-cols-2 gap-2 mt-4"><label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2 rounded border border-slate-200"><input type="checkbox" checked={debtForm.includesVat ?? true} onChange={e => setDebtForm({...debtForm, includesVat: e.target.checked})} className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary" disabled={debtForm.isVatExempt} /><span className={`text-sm font-bold ${debtForm.isVatExempt ? 'text-slate-400' : 'text-slate-700'}`}>הסכום שהוזן כולל מע"מ</span></label><label className="flex items-center gap-2 cursor-pointer bg-amber-50 p-2 rounded border border-amber-200"><input type="checkbox" checked={debtForm.isVatExempt} onChange={e => setDebtForm({...debtForm, isVatExempt: e.target.checked})} className="h-4 w-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500" /><span className="text-sm font-bold text-amber-800">הוצאה פטורה ממע"מ</span></label></div>
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">תיאור / הערות</label><textarea value={debtForm.description || ''} onChange={e => setDebtForm({...debtForm, description: e.target.value})} rows={2} className="block w-full border-slate-300 rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">תמונות / קבצים מצורפים לחוב</label>
                                    <input type="file" multiple onChange={handleDebtFileChange} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100" />
                                    <p className="text-[10px] text-slate-400 mt-1">ניתן לבחור מספר קבצים. תמונות, PDF וקבצי Office</p>
                                    {((debtForm.attachments?.length ?? 0) + (debtForm.attachment ? 1 : 0)) > 0 && (
                                        <ul className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                                            {(debtForm.attachments ?? (debtForm.attachment ? [debtForm.attachment] : [])).map((att, idx) => (
                                                <li key={att.id} className="flex items-center justify-between p-2 bg-purple-50 border border-purple-200 rounded-lg">
                                                    <span className="text-xs font-bold text-purple-700 truncate flex-1 min-w-0">{att.fileName}</span>
                                                    <div className="flex gap-2 shrink-0">
                                                        <button type="button" onClick={() => { setViewingLoanDoc(att); setViewingAttachmentList(null); }} className="text-[10px] bg-white border border-purple-200 px-2 py-1 rounded font-bold text-purple-600 hover:bg-purple-100">צפה</button>
                                                        <button type="button" onClick={() => {
                                                            const list = debtForm.attachments ?? (debtForm.attachment ? [debtForm.attachment] : []);
                                                            const next = list.filter((_, i) => i !== idx);
                                                            setDebtForm({ ...debtForm, attachments: next, attachment: undefined });
                                                        }} className="text-[10px] text-red-500 font-bold px-2 py-1 hover:bg-red-50 rounded">הסר</button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}
                        {activeTab === 'RECEIVABLES' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">שם הגורם החייב</label><input type="text" value={receivableForm.name || ''} onChange={e => setReceivableForm({...receivableForm, name: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך יצירה</label><input type="date" value={receivableForm.createdAt ? new Date(receivableForm.createdAt).toISOString().split('T')[0] : ''} onChange={e => setReceivableForm({...receivableForm, createdAt: new Date(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:ring-primary focus:border-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך יעד לגבייה</label><input type="date" value={receivableForm.dueDate ? new Date(receivableForm.dueDate).toISOString().split('T')[0] : ''} onChange={e => setReceivableForm({...receivableForm, dueDate: new Date(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">סכום החוב (נטו)</label><input type="number" value={receivableForm.amount || ''} onChange={e => setReceivableForm({...receivableForm, amount: parseFloat(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div className="grid grid-cols-2 gap-2 mt-4"><label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2 rounded border border-slate-200"><input type="checkbox" checked={receivableForm.includesVat ?? true} onChange={e => setReceivableForm({...receivableForm, includesVat: e.target.checked})} className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary" disabled={receivableForm.isVatExempt} /><span className={`text-sm font-bold ${receivableForm.isVatExempt ? 'text-slate-400' : 'text-slate-700'}`}>הסכום שהוזן כולל מע"מ</span></label><label className="flex items-center gap-2 cursor-pointer bg-amber-50 p-2 rounded border border-amber-200"><input type="checkbox" checked={receivableForm.isVatExempt} onChange={e => setReceivableForm({...receivableForm, isVatExempt: e.target.checked})} className="h-4 w-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500" /><span className="text-sm font-bold text-amber-800">החזר פטור ממע"מ</span></label></div>
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">תיאור / הערות</label><textarea value={receivableForm.description || ''} onChange={e => setReceivableForm({...receivableForm, description: e.target.value})} rows={2} className="block w-full border-slate-300 rounded-md shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">תמונות / קבצים מצורפים לחייב</label>
                                    <input type="file" multiple onChange={handleReceivableFileChange} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                                    <p className="text-[10px] text-slate-400 mt-1">ניתן לבחור מספר קבצים. תמונות, PDF וקבצי Office</p>
                                    {(receivableForm.attachments?.length ?? 0) > 0 && (
                                        <ul className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                                            {(receivableForm.attachments ?? []).map((att, idx) => (
                                                <li key={att.id} className="flex items-center justify-between p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                                                    <span className="text-xs font-bold text-indigo-700 truncate flex-1 min-w-0">{att.fileName}</span>
                                                    <div className="flex gap-2 shrink-0">
                                                        <button type="button" onClick={() => { setViewingLoanDoc(att); setViewingAttachmentList(null); }} className="text-[10px] bg-white border border-indigo-200 px-2 py-1 rounded font-bold text-indigo-600 hover:bg-indigo-100">צפה</button>
                                                        <button type="button" onClick={() => {
                                                            const next = (receivableForm.attachments ?? []).filter((_, i) => i !== idx);
                                                            setReceivableForm({ ...receivableForm, attachments: next });
                                                        }} className="text-[10px] text-red-500 font-bold px-2 py-1 hover:bg-red-50 rounded">הסר</button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}
                        {activeTab === 'EQUITY' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">שם המשקיע/בעלים</label>
                                    <div className="flex gap-2">
                                        {isNewInvestor ? (
                                            <input 
                                                type="text" 
                                                value={equityForm.investorName || ''} 
                                                onChange={e => setEquityForm({...equityForm, investorName: e.target.value})} 
                                                className="flex-1 mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" 
                                                placeholder="הזן שם משקיע חדש..."
                                                required
                                            />
                                        ) : (
                                            <select 
                                                value={equityForm.investorName || ''} 
                                                onChange={e => setEquityForm({...equityForm, investorName: e.target.value})} 
                                                className="flex-1 mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white"
                                                required
                                            >
                                                <option value="">בחר משקיע קיים...</option>
                                                {uniqueInvestorNames.map(name => <option key={name} value={name}>{name}</option>)}
                                            </select>
                                        )}
                                        <button 
                                            type="button" 
                                            onClick={() => setIsNewInvestor(!isNewInvestor)} 
                                            className="mt-1 px-3 py-2 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-600 hover:bg-slate-200"
                                        >
                                            {isNewInvestor ? 'בחר מקיים' : 'משקיע חדש'}
                                        </button>
                                    </div>
                                </div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">סוג השקעה</label><select value={equityForm.type} onChange={e => setEquityForm({...equityForm, type: e.target.value as any})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white"><option value="הון בעלים">הון בעלים</option><option value="השקעה חיצונית">השקעה חיצונית</option></select></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">סכום (₪)</label><input type="number" value={equityForm.amount || ''} onChange={e => setEquityForm({...equityForm, amount: parseFloat(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">סוג תנועה</label><select value={equityForm.transactionType} onChange={e => setEquityForm({...equityForm, transactionType: e.target.value as any})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white"><option value="DEPOSIT">הזרמה לקופה</option><option value="WITHDRAWAL">משיכה / החזר</option></select></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">תאריך</label><input type="date" value={equityForm.date ? new Date(equityForm.date).toISOString().split('T')[0] : ''} onChange={e => setEquityForm({...equityForm, date: new Date(e.target.value)})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">תיאור</label><input type="text" value={equityForm.description || ''} onChange={e => setEquityForm({...equityForm, description: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 bg-white" /></div>
                            </div>
                        )}
                        <div className="flex justify-end pt-6 border-t mt-4 gap-2">
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                disabled={isSaving}
                                className="px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ביטול
                            </button>
                            <button 
                                onClick={() => handleSave()} 
                                disabled={isSaving}
                                className="px-6 py-2 bg-primary text-white rounded shadow hover:bg-indigo-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSaving ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        שומר...
                                    </>
                                ) : (
                                    'שמור שינויים'
                                )}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {isPaymentModalOpen && selectedDebtForPayment && (
                <Modal title={`תשלום עבור: ${selectedDebtForPayment.name}`} onClose={() => setIsPaymentModalOpen(false)}>
                    <DebtPaymentModal debt={selectedDebtForPayment} onSavePayment={handleSaveDebtPayment} onClose={() => setIsPaymentModalOpen(false)} vatRate={vatRate} />
                </Modal>
            )}

            {isPaymentModalOpen && selectedReceivableForCollection && (
                <Modal title={`קליטת גבייה: ${selectedReceivableForCollection.name}`} onClose={() => setIsPaymentModalOpen(false)}>
                    <ReceivableCollectionModal receivable={selectedReceivableForCollection} onSavePayment={handleSaveReceivableCollection} onClose={() => setIsPaymentModalOpen(false)} vatRate={vatRate} />
                </Modal>
            )}

            {isAmortizationModalOpen && selectedLoanForAmortization && (
                <Modal title={`לוח סילוקין - ${selectedLoanForAmortization.lenderName}`} onClose={() => setIsAmortizationModalOpen(false)} size="5xl">
                    <AmortizationModal 
                        loan={selectedLoanForAmortization} 
                        onClose={() => setIsAmortizationModalOpen(false)}
                        onUpdateSchedule={handleUpdateLoanSchedule}
                    />
                </Modal>
            )}

            {selectedCheckForDebt && (
                <CheckActionModal 
                    check={selectedCheckForDebt.check} 
                    onClose={() => setSelectedCheckForDebt(null)} 
                    onUpdateStatus={(check, newStatus, metadata) => {
                        if (check.sources[0].sourceType === 'debt') {
                            handleUpdateDebtPaymentStatus(check.sources[0].debtId!, check.uniqueId, newStatus, metadata?.note);
                        } else if (check.sources[0].sourceType === 'receivable') {
                            handleUpdateReceivablePaymentStatus(check.sources[0].receivableId!, check.uniqueId, newStatus, metadata?.note);
                        }
                    }} 
                    viewOnlyHistory={selectedCheckForDebt.viewOnly}
                    onViewAttachment={(att) => { setViewingLoanDoc(att); setViewingAttachmentList(null); }}
                />
            )}
        </div>
    );
};

export default FinancePage;
