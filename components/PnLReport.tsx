
import React, { useMemo, useState } from 'react';
import { Order, FixedExpense, VariableExpense, Loan, Employee, AttendanceRecord, OrderStatusConfiguration, Debt, Receivable, TransactionStatus } from '../types';
import { calculateOrderTotals, getEmployeeSalaryAtDate } from '../utils/calculations';
import Modal from './Modal';

interface PnLReportProps {
    orders: Order[];
    fixedExpenses: FixedExpense[];
    variableExpenses: VariableExpense[];
    loans: Loan[];
    employees: Employee[];
    attendanceRecords: AttendanceRecord[];
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
    debts: Debt[];
    receivables: Receivable[];
}

interface DrillDownItem {
    name: string;
    amount: number;
    date?: Date;
    description?: string;
    subtext?: string;
}

interface MonthlyPnL {
    monthKey: string; // YYYY-MM
    label: string;
    income: number;
    incomeItems: DrillDownItem[];
    cogs: number; 
    cogsItems: DrillDownItem[];
    grossProfit: number;
    payroll: number;
    payrollItems: DrillDownItem[];
    fixedExpenses: number;
    fixedItems: DrillDownItem[];
    variableExpenses: number;
    variableItems: DrillDownItem[];
    operatingProfit: number;
    financingExpenses: number; // Loan Interest
    financingItems: DrillDownItem[];
    netProfit: number; // Accounting Profit
    
    // Cash Flow Adjustments
    debtPayments: number;
    debtPaymentItems: DrillDownItem[];
    receivableCollections: number;
    receivableCollectionItems: DrillDownItem[];
    loanPrincipal: number;
    loanPrincipalItems: DrillDownItem[];
    
    netCashFlow: number; 
    
    vatOutput: number; 
    vatOutputItems: DrillDownItem[];
    vatInput: number; 
    vatInputItems: DrillDownItem[];
    vatBalance: number;
    vatCashFlowAdjustment: number; // New field for clarity
}

const PnLReport: React.FC<PnLReportProps> = ({ 
    orders, fixedExpenses, variableExpenses, loans, employees, attendanceRecords, statusConfigs, vatRate, debts, receivables
}) => {
    const [drillDown, setDrillDown] = useState<{ title: string; items: DrillDownItem[] } | null>(null);

    // Filter State - Defaulting to full current year
    const now = new Date();
    const [startMonth, setStartMonth] = useState(1); 
    const [startYear, setStartYear] = useState(now.getFullYear()); 
    const [endMonth, setEndMonth] = useState(12);
    const [endYear, setEndYear] = useState(now.getFullYear());

    const monthsList = [
        { val: 1, label: 'ינואר' }, { val: 2, label: 'פברואר' }, { val: 3, label: 'מרץ' },
        { val: 4, label: 'אפריל' }, { val: 5, label: 'מאי' }, { val: 6, label: 'יוני' },
        { val: 7, label: 'יולי' }, { val: 8, label: 'אוגוסט' }, { val: 9, label: 'ספטמבר' },
        { val: 10, label: 'אוקטובר' }, { val: 11, label: 'נובמבר' }, { val: 12, label: 'דצמבר' }
    ];

    const yearsList = useMemo(() => {
        const years = [];
        const currentY = new Date().getFullYear();
        for (let i = currentY - 3; i <= currentY + 1; i++) years.push(i);
        return years;
    }, []);

    const monthlyData = useMemo(() => {
        const pnlMap: Record<string, MonthlyPnL> = {};
        
        const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const getLabel = (date: Date) => date.toLocaleString('he-IL', { month: 'long', year: 'numeric' });

        // Initialize range of months based on filters
        const startDate = new Date(startYear, startMonth - 1, 1);
        const endDate = new Date(endYear, endMonth - 1, 1);
        
        const tempDate = new Date(startDate);
        while (tempDate <= endDate) {
            const key = getMonthKey(tempDate);
            pnlMap[key] = {
                monthKey: key, label: getLabel(tempDate),
                income: 0, incomeItems: [],
                cogs: 0, cogsItems: [],
                grossProfit: 0,
                payroll: 0, payrollItems: [],
                fixedExpenses: 0, fixedItems: [],
                variableExpenses: 0, variableItems: [],
                operatingProfit: 0,
                financingExpenses: 0, financingItems: [],
                netProfit: 0,
                debtPayments: 0, debtPaymentItems: [],
                receivableCollections: 0, receivableCollectionItems: [],
                loanPrincipal: 0, loanPrincipalItems: [],
                netCashFlow: 0,
                vatOutput: 0, vatOutputItems: [],
                vatInput: 0, vatInputItems: [],
                vatBalance: 0,
                vatCashFlowAdjustment: 0
            };
            tempDate.setMonth(tempDate.getMonth() + 1);
        }

        // 1. Process Orders (Income & COGS & VAT)
        orders.forEach(order => {
            const config = statusConfigs.find(c => c.label === order.orderStatus);
            if (!config?.isActiveDeal) return;

            const date = order.dealStartDate || order.date;
            const key = getMonthKey(date);
            if (!pnlMap[key]) return;

            const totals = calculateOrderTotals(order);
            const currentVat = order.vatRate ?? vatRate;

            const vatOutAmount = totals.totalAmount * (currentVat / 100);
            const vatInAmount = totals.totalCost * (currentVat / 100);
            const displayDate = order.dealStartDate || order.date;

            pnlMap[key].income += totals.totalAmount;
            pnlMap[key].incomeItems.push({ 
                name: `${order.orderNumber} - ${order.description}`, 
                amount: totals.totalAmount, 
                date: displayDate 
            });
            
            pnlMap[key].cogs += totals.totalCost;
            pnlMap[key].cogsItems.push({ 
                name: `עלויות ייצור: ${order.orderNumber}`, 
                amount: totals.totalCost, 
                date: displayDate 
            });
            
            pnlMap[key].vatOutput += vatOutAmount;
            if (vatOutAmount > 0) {
                pnlMap[key].vatOutputItems.push({ 
                    name: `מע"מ עסקאות: ${order.orderNumber}`, 
                    amount: vatOutAmount, 
                    date: displayDate, 
                    subtext: `${currentVat}% מתוך ₪${totals.totalAmount.toLocaleString()}` 
                });
            }

            pnlMap[key].vatInput += vatInAmount;
            if (vatInAmount > 0) {
                pnlMap[key].vatInputItems.push({ 
                    name: `מע"מ תשומות ייצור: ${order.orderNumber}`, 
                    amount: vatInAmount, 
                    date: displayDate, 
                    subtext: `${currentVat}% מתוך ₪${totals.totalCost.toLocaleString()}` 
                });
            }
        });

        // 2. Process Fixed Expenses
        fixedExpenses.forEach(fe => {
            if (!fe.isActive) return;
            const feStart = new Date(fe.startDate);
            const feEnd = fe.endDate ? new Date(fe.endDate) : new Date(2099, 11, 31);

            Object.keys(pnlMap).forEach(key => {
                const [y, m] = key.split('-').map(Number);
                const currentMonthDate = new Date(y, m - 1, 1);
                
                if (currentMonthDate >= new Date(feStart.getFullYear(), feStart.getMonth(), 1) && 
                    currentMonthDate <= new Date(feEnd.getFullYear(), feEnd.getMonth(), 1)) {
                    
                    const amount = fe.monthlyAmount;
                    const net = fe.isVatExempt ? amount : (fe.includesVat ? amount / (1 + vatRate / 100) : amount);
                    const vat = fe.isVatExempt ? 0 : net * (vatRate / 100);

                    pnlMap[key].fixedExpenses += net;
                    pnlMap[key].fixedItems.push({ name: fe.name, amount: net, subtext: fe.category });
                    
                    if (vat > 0) {
                        pnlMap[key].vatInput += vat;
                        pnlMap[key].vatInputItems.push({ name: `מע"מ תשומות (קבועות): ${fe.name}`, amount: vat, subtext: fe.category });
                    }
                }
            });
        });

        // 3. Process Variable Expenses
        variableExpenses.forEach(ve => {
            const date = new Date(ve.date);
            const key = getMonthKey(date);
            if (!pnlMap[key]) return;

            const amount = ve.amount;
            const net = ve.isVatExempt ? amount : (ve.includesVat ? amount / (1 + vatRate / 100) : amount);
            const vat = ve.isVatExempt ? 0 : net * (vatRate / 100);

            pnlMap[key].variableExpenses += net;
            pnlMap[key].variableItems.push({ name: ve.name, amount: net, date: ve.date, subtext: ve.category });
            
            if (vat > 0) {
                pnlMap[key].vatInput += vat;
                pnlMap[key].vatInputItems.push({ name: `מע"מ תשומות (משתנות): ${ve.name}`, amount: vat, date: ve.date, subtext: ve.category });
            }
        });

        // 4. Process Payroll
        Object.keys(pnlMap).forEach(monthKey => {
            const [year, month] = monthKey.split('-').map(Number);
            employees.forEach(emp => {
                if (emp.status === 'INACTIVE' && emp.startDate > new Date(year, month, 0)) return;

                const empRecords = attendanceRecords.filter(r => {
                    const d = new Date(r.date);
                    return r.employeeId === emp.id && d.getMonth() + 1 === month && d.getFullYear() === year;
                });

                let monthlyGross = 0;
                if (emp.salaryType === 'GLOBAL') {
                    monthlyGross = getEmployeeSalaryAtDate(emp, new Date(year, month, 0)).amount;
                } else {
                    empRecords.forEach(r => {
                        if (r.status === 'PRESENT' || r.status === 'WFH') {
                            const hourlyRate = getEmployeeSalaryAtDate(emp, new Date(r.date)).amount;
                            monthlyGross += (r.totalHours * hourlyRate);
                        }
                    });
                }
                
                const employerCost = monthlyGross * (emp.employerCostPercentage / 100);
                const totalPayroll = monthlyGross + employerCost;
                if (totalPayroll > 0) {
                    pnlMap[monthKey].payroll += totalPayroll;
                    pnlMap[monthKey].payrollItems.push({ name: emp.name, amount: totalPayroll, subtext: `שכר: ${monthlyGross.toLocaleString()}, סוציאליות: ${employerCost.toLocaleString()}` });
                }
            });
        });

        // 5. Loan Financing vs Principal
        loans.forEach(loan => {
            if (!loan.schedule) return;
            loan.schedule.forEach(entry => {
                if (!entry.isPaid) return;
                const date = new Date(entry.dueDate);
                const key = getMonthKey(date);
                if (!pnlMap[key]) return;
                
                pnlMap[key].financingExpenses += entry.interestAmount;
                pnlMap[key].financingItems.push({ name: `ריבית: ${loan.lenderName}`, amount: entry.interestAmount, date: date });
                
                pnlMap[key].loanPrincipal += entry.principalAmount;
                pnlMap[key].loanPrincipalItems.push({ name: `קרן: ${loan.lenderName}`, amount: entry.principalAmount, date: date });
            });
        });

        // 6. Debt Payments
        debts.forEach(debt => {
            debt.payments?.forEach(p => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return;
                
                const date = new Date(p.date);
                const key = getMonthKey(date);
                if (!pnlMap[key]) return;

                pnlMap[key].debtPayments += p.amount;
                pnlMap[key].debtPaymentItems.push({ name: `חוב: ${debt.name}`, amount: p.amount, date: p.date, subtext: p.method });
                
                // NEW: Reverse calculate VAT from debt payment
                if (!debt.isVatExempt) {
                    const netAmount = p.amount / (1 + vatRate / 100);
                    const vatAmount = p.amount - netAmount;
                    if (vatAmount > 0.01) {
                        pnlMap[key].vatInput += vatAmount;
                        pnlMap[key].vatInputItems.push({ 
                            name: `מע"מ תשומות (חוב): ${debt.name}`, 
                            amount: vatAmount, 
                            date: p.date, 
                            subtext: `חולץ מתשלום ₪${p.amount.toLocaleString()}` 
                        });
                    }
                }
            });
        });

        // 7. Receivable Collections
        receivables.forEach(rec => {
            rec.payments?.forEach(p => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return;

                const date = new Date(p.date);
                const key = getMonthKey(date);
                if (!pnlMap[key]) return;

                pnlMap[key].receivableCollections += p.amount;
                pnlMap[key].receivableCollectionItems.push({ name: `חייב: ${rec.name}`, amount: p.amount, date: p.date, subtext: p.method });

                // NEW: Reverse calculate VAT from receivable collection
                if (!rec.isVatExempt) {
                    const netAmount = p.amount / (1 + vatRate / 100);
                    const vatAmount = p.amount - netAmount;
                    if (vatAmount > 0.01) {
                        pnlMap[key].vatOutput += vatAmount;
                        pnlMap[key].vatOutputItems.push({ 
                            name: `מע"מ עסקאות (חייב): ${rec.name}`, 
                            amount: vatAmount, 
                            date: p.date, 
                            subtext: `חולץ מגבייה ₪${p.amount.toLocaleString()}` 
                        });
                    }
                }
            });
        });

        // 8. Totals Calculation
        return Object.values(pnlMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey)).map(m => {
            m.grossProfit = m.income - m.cogs;
            m.operatingProfit = m.grossProfit - (m.payroll + m.fixedExpenses + m.variableExpenses);
            m.netProfit = m.operatingProfit - m.financingExpenses;
            m.vatBalance = m.vatOutput - m.vatInput;
            m.vatCashFlowAdjustment = -m.vatBalance; // Positive balance means money owed to state (negative cash impact)
            
            // Net Cash Flow Logic: Includes VAT balance impact
            m.netCashFlow = m.netProfit + m.receivableCollections - m.debtPayments - m.loanPrincipal + m.vatCashFlowAdjustment;
            
            return m;
        });

    }, [orders, fixedExpenses, variableExpenses, loans, employees, attendanceRecords, statusConfigs, vatRate, debts, receivables, startMonth, startYear, endMonth, endYear]);

    // Period Totals Logic
    const periodTotals = useMemo((): MonthlyPnL => {
        const initial: MonthlyPnL = {
            monthKey: 'total', label: 'סה"כ תקופה',
            income: 0, incomeItems: [],
            cogs: 0, cogsItems: [],
            grossProfit: 0,
            payroll: 0, payrollItems: [],
            fixedExpenses: 0, fixedItems: [],
            variableExpenses: 0, variableItems: [],
            operatingProfit: 0,
            financingExpenses: 0, financingItems: [],
            netProfit: 0,
            debtPayments: 0, debtPaymentItems: [],
            receivableCollections: 0, receivableCollectionItems: [],
            loanPrincipal: 0, loanPrincipalItems: [],
            netCashFlow: 0,
            vatOutput: 0, vatOutputItems: [],
            vatInput: 0, vatInputItems: [],
            vatBalance: 0,
            vatCashFlowAdjustment: 0
        };

        return monthlyData.reduce((acc, m) => {
            acc.income += m.income;
            acc.incomeItems.push(...m.incomeItems);
            acc.cogs += m.cogs;
            acc.cogsItems.push(...m.cogsItems);
            acc.grossProfit += m.grossProfit;
            acc.payroll += m.payroll;
            acc.payrollItems.push(...m.payrollItems);
            acc.fixedExpenses += m.fixedExpenses;
            acc.fixedItems.push(...m.fixedItems);
            acc.variableExpenses += m.variableExpenses;
            acc.variableItems.push(...m.variableItems);
            acc.operatingProfit += m.operatingProfit;
            acc.financingExpenses += m.financingExpenses;
            acc.financingItems.push(...m.financingItems);
            acc.netProfit += m.netProfit;
            acc.debtPayments += m.debtPayments;
            acc.debtPaymentItems.push(...m.debtPaymentItems);
            acc.receivableCollections += m.receivableCollections;
            acc.receivableCollectionItems.push(...m.receivableCollectionItems);
            acc.loanPrincipal += m.loanPrincipal;
            acc.loanPrincipalItems.push(...m.loanPrincipalItems);
            acc.netCashFlow += m.netCashFlow;
            acc.vatOutput += m.vatOutput;
            acc.vatOutputItems.push(...m.vatOutputItems);
            acc.vatInput += m.vatInput;
            acc.vatInputItems.push(...m.vatInputItems);
            acc.vatBalance += m.vatBalance;
            acc.vatCashFlowAdjustment += m.vatCashFlowAdjustment;
            return acc;
        }, initial);
    }, [monthlyData]);

    const formatCurrency = (val: number) => 
        val.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const PnLRow = ({ label, field, itemsField, isNegative = false, isHeader = false, isSummary = false, customColor }: { label: string; field: keyof MonthlyPnL; itemsField?: keyof MonthlyPnL; isNegative?: boolean; isHeader?: boolean; isSummary?: boolean; customColor?: string }) => (
        <tr className={`${isHeader ? 'bg-slate-50/80 font-black' : isSummary ? 'bg-slate-100 font-black border-t border-slate-300' : 'hover:bg-slate-50 transition-colors'}`}>
            <td className={`px-4 py-3 text-right flex items-center gap-2 sticky right-0 z-20 ${isSummary ? 'text-slate-900 bg-slate-100' : 'text-slate-600 bg-white'} ${itemsField ? 'cursor-pointer hover:text-primary group' : ''}`}>
                {label}
                {itemsField && (
                    <div className="text-[10px] bg-slate-200 text-slate-500 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">פירוט</div>
                )}
            </td>
            {/* Render Total Column First (RTL logic) */}
            <td 
                onClick={() => itemsField && (periodTotals[itemsField] as DrillDownItem[]).length > 0 && setDrillDown({ title: `${label} - סה"כ תקופה`, items: periodTotals[itemsField] as DrillDownItem[] })}
                className={`px-4 py-3 text-center border-l border-slate-200 font-black bg-indigo-50/20 ${itemsField && (periodTotals[itemsField] as DrillDownItem[]).length > 0 ? 'cursor-pointer hover:bg-indigo-100/50' : ''} ${customColor ? customColor : (isNegative ? 'text-rose-600' : 'text-slate-800')}`}
            >
                {isNegative && (periodTotals[field] as number) > 0 ? '(' : ''}{formatCurrency(periodTotals[field] as number)}{isNegative && (periodTotals[field] as number) > 0 ? ')' : ''}
            </td>
            {/* Render Monthly Columns */}
            {monthlyData.map(m => {
                const val = m[field] as number;
                const items = itemsField ? m[itemsField] as DrillDownItem[] : [];
                return (
                    <td 
                        key={m.monthKey} 
                        onClick={() => itemsField && items.length > 0 && setDrillDown({ title: `${label} - ${m.label}`, items })}
                        className={`px-4 py-3 text-center transition-all ${itemsField && items.length > 0 ? 'cursor-pointer hover:bg-indigo-50/50 hover:scale-105' : ''} ${customColor ? customColor : (isNegative ? 'text-rose-600' : 'text-slate-800')} ${isHeader || isSummary ? 'font-black' : ''}`}
                    >
                        {isNegative && val > 0 ? '(' : ''}{formatCurrency(val)}{isNegative && val > 0 ? ')' : ''}
                    </td>
                );
            })}
        </tr>
    );

    return (
        <div className="space-y-6 text-start">
            {drillDown && (
                <Modal title={drillDown.title} onClose={() => setDrillDown(null)} size="2xl">
                    <div className="overflow-hidden border rounded-lg shadow-inner">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-100 border-b text-right">
                                <tr>
                                    <th className="px-4 py-2">תיאור הפריט</th>
                                    <th className="px-4 py-2">תאריך אישור / ביצוע</th>
                                    <th className="px-4 py-2 text-center">סכום</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {drillDown.items.sort((a,b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)).map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-800">{item.name}</div>
                                            {item.subtext && <div className="text-[10px] text-slate-400">{item.subtext}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">
                                            {item.date ? (
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700">{new Date(item.date).toLocaleDateString('he-IL')}</span>
                                                    <span className="text-[10px] text-primary">תאריך קובע לדו"ח</span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-center font-black text-slate-700">
                                            {formatCurrency(item.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t font-black">
                                <tr>
                                    <td colSpan={2} className="px-4 py-2 text-left text-slate-500">סה"כ:</td>
                                    <td className="px-4 py-2 text-center">{formatCurrency(drillDown.items.reduce((s, i) => s + i.amount, 0))}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Modal>
            )}

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                {/* Filter Bar */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 border-b pb-6 border-slate-100">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <TrendingUpIcon className="w-6 h-6 text-emerald-600"/>
                            דוח רווח והפסד (P&L) וניתוח תזרימי
                        </h3>
                        <p className="text-xs text-slate-400 font-bold">השוואה חודשית וניתוח כדאיות כלכלית</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-400">מ-</span>
                            <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))} className="text-xs p-1.5 border rounded-md font-bold text-slate-700">
                                {monthsList.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                            </select>
                            <select value={startYear} onChange={e => setStartYear(Number(e.target.value))} className="text-xs p-1.5 border rounded-md font-bold text-slate-700">
                                {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-400">עד</span>
                            <select value={endMonth} onChange={e => setEndMonth(Number(e.target.value))} className="text-xs p-1.5 border rounded-md font-bold text-slate-700">
                                {monthsList.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                            </select>
                            <select value={endYear} onChange={e => setEndYear(Number(e.target.value))} className="text-xs p-1.5 border rounded-md font-bold text-slate-700">
                                {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="min-w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-800 text-white">
                                <th className="px-4 py-4 text-right font-black border-l border-slate-700 min-w-[200px] sticky right-0 z-30 bg-slate-800 shadow-xl">סעיף חשבונאי</th>
                                <th className="px-4 py-4 text-center font-black min-w-[150px] bg-slate-700 border-l border-slate-600">סה"כ תקופה</th>
                                {monthlyData.map(m => (
                                    <th key={m.monthKey} className="px-4 py-4 text-center font-black min-w-[140px] whitespace-nowrap">
                                        {m.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* PROFIT & LOSS SECTION */}
                            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50/50"><td className="px-4 py-1 sticky right-0 z-20 bg-slate-50/50" colSpan={monthlyData.length + 2}>פעילות עסקית שוטפת</td></tr>
                            <PnLRow label="הכנסות מעסקאות (נטו)" field="income" itemsField="incomeItems" customColor="text-emerald-600" />
                            <PnLRow label="עלות המכר (COGS)" field="cogs" itemsField="cogsItems" isNegative={true} />
                            <PnLRow label="רווח גולמי" field="grossProfit" isSummary={true} />
                            
                            <tr><td colSpan={monthlyData.length + 2} className="h-4"></td></tr>
                            <PnLRow label="שכר עבודה וסוציאליות" field="payroll" itemsField="payrollItems" isNegative={true} />
                            <PnLRow label="הוצאות קבועות" field="fixedExpenses" itemsField="fixedItems" isNegative={true} />
                            <PnLRow label="הוצאות משתנות" field="variableExpenses" itemsField="variableItems" isNegative={true} />
                            <PnLRow label="רווח תפעולי (EBITDA)" field="operatingProfit" isSummary={true} />

                            <tr><td colSpan={monthlyData.length + 2} className="h-4"></td></tr>
                            <PnLRow label="הוצאות מימון (ריבית)" field="financingExpenses" itemsField="financingItems" isNegative={true} />
                            <tr className="bg-indigo-600 text-white font-black">
                                <td className="px-4 py-3 text-right sticky right-0 z-20 bg-indigo-600">רווח נקי (חשבונאי)</td>
                                <td className="px-4 py-3 text-center border-l border-indigo-500 bg-indigo-700 font-black">{formatCurrency(periodTotals.netProfit)}</td>
                                {monthlyData.map(m => <td key={m.monthKey} className="px-4 py-3 text-center">{formatCurrency(m.netProfit)}</td>)}
                            </tr>

                            {/* CASH FLOW ADJUSTMENTS SECTION */}
                            <tr><td colSpan={monthlyData.length + 2} className="h-8"></td></tr>
                            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50/50">
                                <td className="px-4 py-1 sticky right-0 z-20 bg-slate-50/50" colSpan={monthlyData.length + 2}>תנועות הון וחובות (תזרימי)</td>
                            </tr>
                            <PnLRow label="(+) החזרי חוב מחייבים" field="receivableCollections" itemsField="receivableCollectionItems" customColor="text-green-600" />
                            <PnLRow label="(-) תשלום חובות לספקים" field="debtPayments" itemsField="debtPaymentItems" isNegative={true} />
                            <PnLRow label="(-) פירעון קרן הלוואות" field="loanPrincipal" itemsField="loanPrincipalItems" isNegative={true} />
                            
                            {/* VAT Cash Flow row */}
                            <PnLRow label="(-) יתרת מע''מ לתשלום / החזר" field="vatCashFlowAdjustment" isNegative={true} />
                            
                            <tr className="bg-amber-100 border-t-2 border-amber-300 font-black text-slate-900">
                                <td className="px-4 py-4 text-right flex items-center gap-2 sticky right-0 z-20 bg-amber-100">
                                    יתרה חופשית למשיכה/צבירה
                                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                                </td>
                                <td className={`px-4 py-4 text-center border-l border-amber-200 bg-amber-200 font-black text-lg ${periodTotals.netCashFlow < 0 ? 'text-red-700' : 'text-indigo-800'}`}>
                                    {formatCurrency(periodTotals.netCashFlow)}
                                </td>
                                {monthlyData.map(m => (
                                    <td key={m.monthKey} className={`px-4 py-4 text-center text-lg ${m.netCashFlow < 0 ? 'text-red-700' : 'text-indigo-800'}`}>
                                        {formatCurrency(m.netCashFlow)}
                                    </td>
                                ))}
                            </tr>

                            {/* VAT SECTION */}
                            <tr><td colSpan={monthlyData.length + 2} className="h-8"></td></tr>
                            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50/50"><td className="px-4 py-1 sticky right-0 z-20 bg-slate-50/50" colSpan={monthlyData.length + 2}>סיכום מע"מ תקופתי</td></tr>
                            <PnLRow label='מע"מ עסקאות (חובה)' field="vatOutput" itemsField="vatOutputItems" isNegative={true} />
                            <PnLRow label='מע"מ תשומות (זכות)' field="vatInput" itemsField="vatInputItems" customColor="text-emerald-600" />
                            <tr className="bg-slate-50">
                                <td className="px-4 py-3 font-bold text-slate-700 sticky right-0 z-20 bg-slate-50">לתשלום / החזר מע"מ</td>
                                <td className={`px-4 py-3 text-center border-l border-slate-200 font-black bg-slate-200/50 ${periodTotals.vatBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {periodTotals.vatBalance > 0 ? `לתשלום: ${formatCurrency(periodTotals.vatBalance)}` : `החזר: ${formatCurrency(Math.abs(periodTotals.vatBalance))}`}
                                </td>
                                {monthlyData.map(m => (
                                    <td key={m.monthKey} className={`px-4 py-3 text-center font-black ${m.vatBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {m.vatBalance > 0 ? `לתשלום: ${formatCurrency(m.vatBalance)}` : `החזר: ${formatCurrency(Math.abs(m.vatBalance))}`}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
                        <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2 text-base">
                             💡 הסבר על הדוח
                        </h4>
                        <ul className="text-xs text-blue-700 space-y-2 list-disc list-inside leading-relaxed">
                            <li><strong>רווח נקי:</strong> מייצג את הרווח הכלכלי של העסק (הכנסות פחות הוצאות שהתהוו בחודשים הנבחרים).</li>
                            <li><strong>תנועות תזרימיות:</strong> מציגות כסף שנכנס או יצא כתוצאה מהתחייבויות עבר (סגירת חובות) או רשויות.</li>
                            <li><strong>יתרת מע"מ לתשלום:</strong> מופחתת מהתזרים כיוון שהיא מהווה התחייבות כספית שגבית עבור המדינה.</li>
                            <li><strong>יתרה חופשית:</strong> השורה התחתונה - כמה כסף באמת נשאר בבנק אחרי ששילמת לספקים, עובדים, בנקים ורשויות המס.</li>
                        </ul>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                         <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-base">
                             📊 רווחיות גולמית (Markup)
                        </h4>
                        <div className="flex flex-wrap gap-6">
                            <div className="bg-indigo-600 p-3 rounded-lg border shadow-md text-white">
                                <span className="text-[10px] font-bold block mb-1">ממוצע תקופתי</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black">{periodTotals.income > 0 ? ((periodTotals.grossProfit / periodTotals.income) * 100).toFixed(1) : 0}%</span>
                                    <span className="text-[10px] opacity-80">רווח</span>
                                </div>
                            </div>
                            {monthlyData.slice(0, 3).map(m => (
                                <div key={m.monthKey} className="bg-white p-3 rounded-lg border shadow-sm">
                                    <span className="text-[10px] text-slate-400 font-bold block mb-1">{m.label}</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-primary">{m.income > 0 ? ((m.grossProfit / m.income) * 100).toFixed(1) : 0}%</span>
                                        <span className="text-[10px] text-slate-400">רווח</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TrendingUpIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
);

export default PnLReport;
