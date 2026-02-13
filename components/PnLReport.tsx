import React, { useMemo, useState } from 'react';
import { Order, FixedExpense, VariableExpense, Loan, Employee, AttendanceRecord, OrderStatusConfiguration, Debt, Receivable, TransactionStatus, PayrollOverrideMap } from '../types';
import { calculateOrderTotals, getEmployeeSalaryAtDate } from '../utils/calculations';
import { getStatusConfigForOrder } from '../utils/statusHelpers';
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
    payrollOverrides?: PayrollOverrideMap;
    /** When provided, order numbers in income/cogs drill-down become clickable and open the order */
    onNavigateToOrder?: (orderId: string) => void;
}

interface DrillDownItem {
    name: string;
    amount: number;
    date?: Date;
    description?: string;
    subtext?: string;
    /** True when this payroll item uses a manual override from Attendance page */
    manualOverride?: boolean;
    /** Order id for income/cogs items - makes the order number clickable in drill-down */
    orderId?: string;
    /** Order number (e.g. ORD-1007) for display when opening the order */
    orderNumber?: string;
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
    orders, fixedExpenses, variableExpenses, loans, employees, attendanceRecords, statusConfigs, vatRate, debts, receivables, payrollOverrides = {}, onNavigateToOrder
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

    // One document per orderNumber: keep the one with latest dealStartDate/date (aligned with Orders page and getPayableItems)
    const canonicalOrders = useMemo(() => {
        const ordersByNumber = new Map<string, Order>();
        orders.forEach(order => {
            const key = order.orderNumber;
            const existing = ordersByNumber.get(key);
            const orderDate = new Date(order.dealStartDate || order.date).getTime();
            if (!existing) {
                ordersByNumber.set(key, order);
                return;
            }
            const existingDate = new Date(existing.dealStartDate || existing.date).getTime();
            if (orderDate > existingDate) ordersByNumber.set(key, order);
        });
        return Array.from(ordersByNumber.values());
    }, [orders]);

    // Updated Balance Overview with Incl/Excl VAT (uses canonical orders to avoid double-counting)
    const balanceOverview = useMemo(() => {
        let customerDebtIncl = 0;
        let customerDebtExcl = 0;
        let supplierDebtIncl = 0;
        let supplierDebtExcl = 0;

        // Match status by id or label; exclude unknown status / אבוד / non-active
        canonicalOrders.forEach(order => {
            const config = getStatusConfigForOrder(order, statusConfigs);
            if (!config || config.isLost || !config.isActiveDeal) return;

            const { totalAmount, totalPaid } = calculateOrderTotals(order);
            const orderVat = order.vatRate ?? vatRate;
            const vatMult = 1 + (orderVat / 100);
            
            // 1. Customer Outstanding
            const grossIncome = totalAmount * vatMult;
            const remainingIncl = Math.max(0, grossIncome - totalPaid);
            if (remainingIncl > 0.1) {
                customerDebtIncl += remainingIncl;
                customerDebtExcl += (remainingIncl / vatMult);
            }

            // 2. Supplier Outstanding (COGS that hasn't been paid to suppliers yet)
            const invalidStatuses: TransactionStatus[] = ['BOUNCED', 'CANCELED', 'RETURNED'];
            
            order.lineItems.forEach(li => {
                const costGross = (li.cost * li.quantity) * vatMult;
                const paidToSupplier = (li.supplierPayments || []).reduce((s, p) => 
                    (p.status && invalidStatuses.includes(p.status)) ? s : s + p.amount, 0);
                const remainingInclSup = Math.max(0, costGross - paidToSupplier);
                if (remainingInclSup > 0.1) {
                    supplierDebtIncl += remainingInclSup;
                    supplierDebtExcl += (remainingInclSup / vatMult);
                }
            });

            order.additionalServices.forEach(as => {
                const costGross = as.cost * vatMult;
                const paidToSupplier = (as.supplierPayments || []).reduce((s, p) => 
                    (p.status && invalidStatuses.includes(p.status)) ? s : s + p.amount, 0);
                const remainingInclSup = Math.max(0, costGross - paidToSupplier);
                if (remainingInclSup > 0.1) {
                    supplierDebtIncl += remainingInclSup;
                    supplierDebtExcl += (remainingInclSup / vatMult);
                }
            });
            (order.lineItems || []).filter(li => li.serviceType === 'DELIVERY' || li.serviceType === 'INSTALLATION').forEach(li => {
                const costGross = (li.cost ?? 0) * (li.quantity ?? 1) * vatMult;
                const paidToSupplier = (li.supplierPayments || []).reduce((s, p) => 
                    (p.status && invalidStatuses.includes(p.status)) ? s : s + p.amount, 0);
                const remainingInclSup = Math.max(0, costGross - paidToSupplier);
                if (remainingInclSup > 0.1) {
                    supplierDebtIncl += remainingInclSup;
                    supplierDebtExcl += (remainingInclSup / vatMult);
                }
            });
        });

        return { customerDebtIncl, customerDebtExcl, supplierDebtIncl, supplierDebtExcl };
    }, [canonicalOrders, statusConfigs, vatRate]);

    const monthlyData = useMemo(() => {
        const pnlMap: Record<string, MonthlyPnL> = {};
        
        const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const getLabel = (date: Date) => date.toLocaleString('he-IL', { month: 'long', year: 'numeric' });
        /** Parse schedule dueDate from API (Date, ISO string, or DD.MM.YYYY / DD/MM/YYYY) to local Date for correct month. */
        const parseScheduleDueDate = (dueDate: Date | string): Date | null => {
            if (dueDate instanceof Date) {
                const d = new Date(dueDate.getTime());
                return isNaN(d.getTime()) ? null : d;
            }
            if (typeof dueDate !== 'string') return null;
            const iso = new Date(dueDate);
            if (!isNaN(iso.getTime())) return iso;
            const parts = dueDate.split(/[./]/).map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));
            if (parts.length >= 3) {
                const day = Math.min(Math.max(1, parts[0]), 31);
                const month = Math.min(Math.max(0, parts[1] - 1), 11);
                const year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
                const local = new Date(year, month, day);
                return isNaN(local.getTime()) ? null : local;
            }
            return null;
        };

        // Initialize range of months based on filters
        const startDate = new Date(startYear, startMonth - 1, 1);
        // endDate should be the last day of the selected month for proper filtering
        const endDate = new Date(endYear, endMonth, 0); // Day 0 = last day of previous month
        
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

        // 1. Process Orders (Income & COGS & VAT) — uses canonicalOrders (one per orderNumber, latest date)
        canonicalOrders.forEach((order) => {
            const config = getStatusConfigForOrder(order, statusConfigs);
            const skipStatus = !config || config.isLost || !config.isActiveDeal;
            if (skipStatus) return;

            const rawDate = order.dealStartDate || order.date;
            const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
            const key = getMonthKey(date);
            if (!pnlMap[key]) return;

            const totals = calculateOrderTotals(order);
            const currentVat = order.vatRate ?? vatRate;

            const vatOutAmount = totals.totalAmount * (currentVat / 100);
            const vatInAmount = totals.totalCost * (currentVat / 100);
            const displayDateRaw = order.dealStartDate || order.date;
            const displayDate = displayDateRaw instanceof Date ? displayDateRaw : new Date(displayDateRaw);

            pnlMap[key].income += totals.totalAmount;
            pnlMap[key].incomeItems.push({ 
                name: `${order.orderNumber} - ${order.description}`, 
                amount: totals.totalAmount, 
                date: displayDate,
                orderId: order.id,
                orderNumber: order.orderNumber
            });
            
            pnlMap[key].cogs += totals.totalCost;
            pnlMap[key].cogsItems.push({ 
                name: `עלויות ייצור: ${order.orderNumber}`, 
                amount: totals.totalCost, 
                date: displayDate,
                orderId: order.id,
                orderNumber: order.orderNumber
            });
            
            // VAT is now calculated on cash flow basis (when payments are made), not on order date
            // This will be processed in sections 1a and 1b below
        });
        
        // 1a. Process Customer Payments (VAT Output - Cash Flow Basis)
        // מקור: תשלומי לקוח (order.payments) – אותם נתונים כמו בעמוד הזמנות
        canonicalOrders.forEach((order) => {
            const config = getStatusConfigForOrder(order, statusConfigs);
            if (!config || config.isLost || !config.isActiveDeal) return;
            
            const currentVat = order.vatRate ?? vatRate;
            const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];

            order.payments?.forEach((payment) => {
                if (payment.status && invalidStatuses.includes(payment.status)) return;
                
                const date = payment.date instanceof Date ? payment.date : new Date(payment.date);
                const key = getMonthKey(date);
                if (!pnlMap[key]) return;
                
                // Calculate VAT from actual payment (cash flow basis)
                const netAmount = payment.amount / (1 + currentVat / 100);
                const vatAmount = payment.amount - netAmount;
                
                if (vatAmount > 0.01) {
                    pnlMap[key].vatOutput += vatAmount;
                    pnlMap[key].vatOutputItems.push({
                        name: `מע"מ עסקאות (תשלום מלקוח): ${order.orderNumber}`,
                        amount: vatAmount,
                        date: payment.date,
                        subtext: `חולץ מתשלום ₪${payment.amount.toLocaleString()}`,
                        orderId: order.id,
                        orderNumber: order.orderNumber
                    });
                }
            });
        });
        
        // 1b. Process Supplier Payments (VAT Input - Cash Flow Basis)
        canonicalOrders.forEach(order => {
            const config = getStatusConfigForOrder(order, statusConfigs);
            if (!config || config.isLost || !config.isActiveDeal) return;
            
            const currentVat = order.vatRate ?? vatRate;
            const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
            
            // Process supplier payments from line items
            order.lineItems.forEach(li => {
                li.supplierPayments?.forEach(payment => {
                    if (payment.status && invalidStatuses.includes(payment.status)) return;
                    
                    const date = payment.date instanceof Date ? payment.date : new Date(payment.date);
                    const key = getMonthKey(date);
                    if (!pnlMap[key]) return;
                    
                    // Calculate VAT from actual payment (cash flow basis)
                    const netAmount = payment.amount / (1 + currentVat / 100);
                    const vatAmount = payment.amount - netAmount;
                    
                    // Add net amount to debtPayments (cash flow - without VAT)
                    // VAT is handled separately in vatInput and vatCashFlowAdjustment
                    pnlMap[key].debtPayments += netAmount;
                    pnlMap[key].debtPaymentItems.push({
                        name: `תשלום לספק: ${order.orderNumber}`,
                        amount: netAmount,
                        date: payment.date,
                        subtext: `פריט: ${li.description}`,
                        orderId: order.id,
                        orderNumber: order.orderNumber
                    });
                    
                    if (vatAmount > 0.01) {
                        pnlMap[key].vatInput += vatAmount;
                        pnlMap[key].vatInputItems.push({
                            name: `מע"מ תשומות (תשלום לספק): ${order.orderNumber}`,
                            amount: vatAmount,
                            date: payment.date,
                            subtext: `חולץ מתשלום ₪${payment.amount.toLocaleString()}`,
                            orderId: order.id,
                            orderNumber: order.orderNumber
                        });
                    }
                });
            });
            
            // Process supplier payments from additional services
            order.additionalServices.forEach(as => {
                as.supplierPayments?.forEach(payment => {
                    if (payment.status && invalidStatuses.includes(payment.status)) return;
                    
                    const date = payment.date instanceof Date ? payment.date : new Date(payment.date);
                    const key = getMonthKey(date);
                    if (!pnlMap[key]) return;
                    
                    // Calculate VAT from actual payment (cash flow basis)
                    const netAmount = payment.amount / (1 + currentVat / 100);
                    const vatAmount = payment.amount - netAmount;
                    
                    // Add net amount to debtPayments (cash flow - without VAT)
                    // VAT is handled separately in vatInput and vatCashFlowAdjustment
                    pnlMap[key].debtPayments += netAmount;
                    pnlMap[key].debtPaymentItems.push({
                        name: `תשלום לספק: ${order.orderNumber}`,
                        amount: netAmount,
                        date: payment.date,
                        subtext: `שירות: ${as.description}`,
                        orderId: order.id,
                        orderNumber: order.orderNumber
                    });
                    
                    if (vatAmount > 0.01) {
                        pnlMap[key].vatInput += vatAmount;
                        pnlMap[key].vatInputItems.push({
                            name: `מע"מ תשומות (תשלום לספק): ${order.orderNumber}`,
                            amount: vatAmount,
                            date: payment.date,
                            subtext: `חולץ מתשלום ₪${payment.amount.toLocaleString()}`,
                            orderId: order.id,
                            orderNumber: order.orderNumber
                        });
                    }
                });
            });
            (order.lineItems || []).filter(li => li.serviceType === 'DELIVERY' || li.serviceType === 'INSTALLATION').forEach(li => {
                li.supplierPayments?.forEach(payment => {
                    if (payment.status && invalidStatuses.includes(payment.status)) return;
                    const date = payment.date instanceof Date ? payment.date : new Date(payment.date);
                    const key = getMonthKey(date);
                    if (!pnlMap[key]) return;
                    const netAmount = payment.amount / (1 + currentVat / 100);
                    const vatAmount = payment.amount - netAmount;
                    pnlMap[key].debtPayments += netAmount;
                    pnlMap[key].debtPaymentItems.push({
                        name: `תשלום לספק: ${order.orderNumber}`,
                        amount: netAmount,
                        date: payment.date,
                        subtext: `שירות: ${li.description}`,
                        orderId: order.id,
                        orderNumber: order.orderNumber
                    });
                    if (vatAmount > 0.01) {
                        pnlMap[key].vatInput += vatAmount;
                        pnlMap[key].vatInputItems.push({
                            name: `מע"מ תשומות (תשלום לספק): ${order.orderNumber}`,
                            amount: vatAmount,
                            date: payment.date,
                            subtext: `חולץ מתשלום ₪${payment.amount.toLocaleString()}`,
                            orderId: order.id,
                            orderNumber: order.orderNumber
                        });
                    }
                });
            });
        });

        // 2. Process Fixed Expenses
        fixedExpenses.forEach(fe => {
            if (!fe.isActive) return;
            const feStart = fe.startDate instanceof Date ? fe.startDate : new Date(fe.startDate);
            const feEnd = fe.endDate ? (fe.endDate instanceof Date ? fe.endDate : new Date(fe.endDate)) : new Date(2099, 11, 31);

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

        // 3. Process Variable Expenses (cash basis for installments: spread by repaymentDate)
        variableExpenses.forEach(ve => {
            const hasInstallments = ve.checks && ve.checks.length > 0;
            if (hasInstallments) {
                const totalChecks = ve.checks!.length;
                ve.checks!.forEach((check, idx) => {
                    if (!check.repaymentDate) return;
                    const rd = new Date(check.repaymentDate);
                    const key = getMonthKey(rd);
                    if (!pnlMap[key]) return;
                    const amount = check.amount;
                    const net = ve.isVatExempt ? amount : (ve.includesVat ? amount / (1 + vatRate / 100) : amount);
                    const vat = ve.isVatExempt ? 0 : (ve.includesVat ? amount - net : net * (vatRate / 100));
                    const instLabel = `תשלום ${idx + 1}/${totalChecks}`;
                    const subtextBase = ve.category ? `${ve.category} (פריסה)` : 'פריסה';
                    pnlMap[key].variableExpenses += net;
                    pnlMap[key].variableItems.push({ name: ve.name, amount: net, date: rd, subtext: `${instLabel} • ${subtextBase}` });
                    if (vat > 0) {
                        pnlMap[key].vatInput += vat;
                        pnlMap[key].vatInputItems.push({ name: `מע"מ תשומות (משתנות): ${ve.name}`, amount: vat, date: rd, subtext: `${instLabel} • ${subtextBase}` });
                    }
                });
            } else {
                const date = ve.date instanceof Date ? ve.date : new Date(ve.date);
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
            }
        });

        // 4. Process Payroll (respects manual payroll overrides from Attendance page)
        Object.keys(pnlMap).forEach(monthKey => {
            const [year, month] = monthKey.split('-').map(Number);
            employees.forEach(emp => {
                const empStartDate = emp.startDate instanceof Date ? emp.startDate : new Date(emp.startDate);
                // Check if employee was inactive before the current month
                // new Date(year, month, 1) is the first day of the current month
                if (emp.status === 'INACTIVE' && empStartDate > new Date(year, month - 1, 1)) return;

                const empRecords = attendanceRecords.filter(r => {
                    const d = r.date instanceof Date ? r.date : new Date(r.date);
                    return r.employeeId === emp.id && d.getMonth() + 1 === month && d.getFullYear() === year;
                });

                let monthlyGross = 0;
                if (emp.salaryType === 'GLOBAL') {
                    monthlyGross = getEmployeeSalaryAtDate(emp, new Date(year, month, 0)).amount;
                } else {
                    empRecords.forEach(r => {
                        if (r.status === 'PRESENT' || r.status === 'WFH') {
                            const rDate = r.date instanceof Date ? r.date : new Date(r.date);
                            const hourlyRate = getEmployeeSalaryAtDate(emp, rDate).amount;
                            monthlyGross += (r.totalHours * hourlyRate);
                        }
                    });
                }

                // Social/employer part: in PnL we use employerCostPercentage as % on top of gross
                let employerCostPart = monthlyGross * ((emp.employerCostPercentage || 0) / 100);
                let totalPayroll = monthlyGross + employerCostPart;
                let manualOverride = false;

                const override = (payrollOverrides ?? {})[`${emp.id}_${year}_${month}`];
                if (override) {
                    if (override.finalEmployerCost !== undefined) {
                        // "עלות מעביד סופית" = total cost to employer (gross + social)
                        totalPayroll = override.finalEmployerCost;
                        if (override.finalGross !== undefined) {
                            employerCostPart = override.finalEmployerCost - override.finalGross;
                            monthlyGross = override.finalGross;
                        }
                        manualOverride = true;
                    } else if (override.finalGross !== undefined) {
                        monthlyGross = override.finalGross;
                        employerCostPart = monthlyGross * ((emp.employerCostPercentage || 0) / 100);
                        totalPayroll = monthlyGross + employerCostPart;
                        manualOverride = true;
                    }
                }

                if (totalPayroll > 0) {
                    pnlMap[monthKey].payroll += totalPayroll;
                    const subtextBase = manualOverride && override?.finalEmployerCost !== undefined && override?.finalGross === undefined
                        ? `עלות מעביד מתוקנת: ${totalPayroll.toLocaleString()}`
                        : `שכר: ${monthlyGross.toLocaleString()}, סוציאליות: ${employerCostPart.toLocaleString()}${manualOverride ? ' • מתוקן ידנית' : ''}`;
                    const subtext = override?.note ? [override.note, subtextBase].filter(Boolean).join(' • ') : subtextBase;
                    pnlMap[monthKey].payrollItems.push({
                        name: emp.name,
                        amount: totalPayroll,
                        subtext,
                        manualOverride: manualOverride || undefined
                    });
                }
            });
        });

        // 5. Loan Financing vs Principal
        loans.forEach(loan => {
            let loanProcessed = false;
            
            // Handle loans with schedule — show ALL scheduled payments in their due month (matches Loans page)
            if (loan.schedule && loan.schedule.length > 0) {
                loan.schedule.forEach(entry => {
                    const parsed = parseScheduleDueDate(entry.dueDate as Date | string);
                    if (!parsed) return;
                    const dateClean = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
                    const key = getMonthKey(dateClean);
                    
                    if (!pnlMap[key]) return;
                    
                    loanProcessed = true;
                    
                    const interestAmount = entry.interestAmount || 0;
                    const feesAmount = entry.fees || 0;
                    const totalFinancingCost = interestAmount + feesAmount;
                    
                    pnlMap[key].financingExpenses += totalFinancingCost;
                    if (interestAmount > 0) {
                        pnlMap[key].financingItems.push({ name: `ריבית: ${loan.lenderName}`, amount: interestAmount, date: dateClean });
                    }
                    if (feesAmount > 0) {
                        pnlMap[key].financingItems.push({ name: `עמלה: ${loan.lenderName}`, amount: feesAmount, date: dateClean });
                    }
                    pnlMap[key].loanPrincipal += entry.principalAmount || 0;
                    pnlMap[key].loanPrincipalItems.push({ name: `קרן: ${loan.lenderName}`, amount: entry.principalAmount || 0, date: dateClean });
                });
            }
            
            // If loan wasn't processed from schedule, try fallback
            const hasStartDate = loan.startDate != null && loan.startDate !== undefined;
            const monthlyPmt = (loan.monthlyPayment != null && loan.monthlyPayment !== undefined) ? loan.monthlyPayment : 0;
            // Fallback 1: startDate available (include even when monthlyPayment is 0)
            if (!loanProcessed && hasStartDate) {
                const startDate = loan.startDate instanceof Date ? loan.startDate : new Date(loan.startDate);
                const monthlyRate = (loan.interestRate && loan.interestRate > 0) ? (loan.interestRate / 100 / 12) : 0;
                let remainingPrincipal = loan.principalAmount || 0;
                
                // Determine how many payments to calculate
                let numPayments = 0;
                if (loan.paymentsMade != null && loan.paymentsMade > 0) {
                    numPayments = loan.paymentsMade;
                } else if (loan.durationMonths != null && loan.durationMonths > 0) {
                    numPayments = loan.durationMonths;
                } else {
                    // Calculate from startDate to end of selected period
                    const periodEnd = new Date(endYear, endMonth - 1, 1);
                    const monthsDiff = (periodEnd.getFullYear() - startDate.getFullYear()) * 12 + (periodEnd.getMonth() - startDate.getMonth()) + 1;
                    numPayments = Math.max(0, monthsDiff);
                }
                
                let anyAdded = false;
                let firstKeyInRange: string | null = null;
                for (let i = 1; i <= numPayments; i++) {
                    const dueDate = new Date(startDate.getFullYear(), startDate.getMonth() + (i - 1), 1);
                    const key = getMonthKey(dueDate);
                    if (!pnlMap[key]) continue;
                    if (firstKeyInRange == null) firstKeyInRange = key;
                    
                    const interestAmount = monthlyRate > 0 ? (remainingPrincipal * monthlyRate) : 0;
                    const principalAmount = Math.max(0, monthlyPmt - interestAmount);
                    remainingPrincipal = Math.max(0, remainingPrincipal - principalAmount);
                    
                    const interestRounded = Math.round(interestAmount * 100) / 100;
                    const principalRounded = Math.round(principalAmount * 100) / 100;
                    if (interestRounded > 0) {
                        pnlMap[key].financingExpenses += interestRounded;
                        pnlMap[key].financingItems.push({ 
                            name: `ריבית: ${loan.lenderName}`, 
                            amount: interestRounded, 
                            date: dueDate 
                        });
                        anyAdded = true;
                    }
                    if (principalRounded > 0) {
                        pnlMap[key].loanPrincipal += principalRounded;
                        pnlMap[key].loanPrincipalItems.push({ 
                            name: `קרן: ${loan.lenderName}`, 
                            amount: principalRounded, 
                            date: dueDate 
                        });
                        anyAdded = true;
                    }
                }
                // So loan appears in report even when all amounts are 0 (e.g. 0% loan or no payments in period)
                if (!anyAdded && firstKeyInRange) {
                    const dueDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
                    pnlMap[firstKeyInRange].financingItems.push({ name: `ריבית: ${loan.lenderName}`, amount: 0, date: dueDate });
                    pnlMap[firstKeyInRange].loanPrincipalItems.push({ name: `קרן: ${loan.lenderName}`, amount: 0, date: dueDate });
                }
            }
        });

        // 6. Debt Payments
        debts.forEach(debt => {
            debt.payments?.forEach(p => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return;
                
                const date = p.date instanceof Date ? p.date : new Date(p.date);
                const key = getMonthKey(date);
                if (!pnlMap[key]) return;

                // Calculate net amount (without VAT) for cash flow
                // VAT is already handled separately in vatInput and vatCashFlowAdjustment
                let netAmount = p.amount;
                if (!debt.isVatExempt) {
                    netAmount = p.amount / (1 + vatRate / 100);
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
                
                pnlMap[key].debtPayments += netAmount;
                pnlMap[key].debtPaymentItems.push({ name: `חוב: ${debt.name}`, amount: netAmount, date: p.date, subtext: p.method });
            });
        });

        // 7. Receivable Collections
        receivables.forEach(rec => {
            rec.payments?.forEach(p => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return;

                const date = p.date instanceof Date ? p.date : new Date(p.date);
                const key = getMonthKey(date);
                if (!pnlMap[key]) return;

                // Calculate net amount (without VAT) for cash flow
                // VAT is already handled separately in vatOutput and vatCashFlowAdjustment
                let netAmount = p.amount;
                if (!rec.isVatExempt) {
                    netAmount = p.amount / (1 + vatRate / 100);
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
                
                pnlMap[key].receivableCollections += netAmount;
                pnlMap[key].receivableCollectionItems.push({ name: `חייב: ${rec.name}`, amount: netAmount, date: p.date, subtext: p.method });
            });
        });

        // 8. Totals Calculation
        return Object.values(pnlMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey)).map(m => {
            m.grossProfit = m.income - m.cogs;
            m.operatingProfit = m.grossProfit - (m.payroll + m.fixedExpenses + m.variableExpenses);
            m.netProfit = m.operatingProfit - m.financingExpenses;
            m.vatBalance = m.vatOutput - m.vatInput;
            // VAT is handled separately in the VAT section at the end of the report
            // VAT should not be included in P&L calculations as it's not part of profit/loss
            // VAT Cash Flow Adjustment kept for reference but not used in netCashFlow
            m.vatCashFlowAdjustment = m.vatInput - m.vatOutput;
            
            // Net Cash Flow Logic: Excludes VAT (VAT is shown separately)
            // VAT is a tax collection/refund mechanism, not part of P&L
            m.netCashFlow = m.netProfit + m.receivableCollections - m.debtPayments - m.loanPrincipal;
            
            return m;
        });

    }, [canonicalOrders, fixedExpenses, variableExpenses, loans, employees, attendanceRecords, statusConfigs, vatRate, debts, receivables, startMonth, startYear, endMonth, endYear, payrollOverrides]);

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

        const result = monthlyData.reduce((acc, m) => {
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

        return result;
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
            {/* Monthly columns: Dec → Jan (so visually Jan is right, Dec left); then annual summary rightmost */}
            {[...monthlyData].reverse().map(m => {
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
            {/* Annual summary column (rightmost) */}
            <td 
                onClick={() => itemsField && (periodTotals[itemsField] as DrillDownItem[]).length > 0 && setDrillDown({ title: `${label} - סה"כ תקופה`, items: periodTotals[itemsField] as DrillDownItem[] })}
                className={`px-4 py-3 text-center border-l border-slate-200 font-black bg-indigo-50/20 ${itemsField && (periodTotals[itemsField] as DrillDownItem[]).length > 0 ? 'cursor-pointer hover:bg-indigo-100/50' : ''} ${customColor ? customColor : (isNegative ? 'text-rose-600' : 'text-slate-800')}`}
            >
                {isNegative && (periodTotals[field] as number) > 0 ? '(' : ''}{formatCurrency(periodTotals[field] as number)}{isNegative && (periodTotals[field] as number) > 0 ? ')' : ''}
            </td>
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
                                {drillDown.items
                                    .slice()
                                    .sort((a, b) => {
                                        const ts = (d: Date | string | undefined) =>
                                            d instanceof Date ? d.getTime() : (d ? new Date(d).getTime() : 0);
                                        return ts(b.date) - ts(a.date);
                                    })
                                    .map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                                                {item.orderId && item.orderNumber && onNavigateToOrder ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => { onNavigateToOrder(item.orderId!); setDrillDown(null); }}
                                                            className="text-primary hover:underline font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
                                                            title="פתח פרטי הזמנה"
                                                        >
                                                            {item.orderNumber}
                                                        </button>
                                                        {item.name.replace(item.orderNumber, '').replace(/^[\s\-:]+|[\s\-:]+$/g, '').trim() && (
                                                            <span> – {item.name.replace(item.orderNumber, '').replace(/^[\s\-:]+|[\s\-:]+$/g, '').trim()}</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    item.name
                                                )}
                                                {item.manualOverride && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800" title="תוקן ידנית בדוח ריכוז שכר ונוכחות">מתוקן ידנית</span>
                                                )}
                                            </div>
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

            {/* Balance Overview Widget */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-5 rounded-2xl border border-indigo-200 shadow-sm transition-all hover:shadow-md group">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">יתרת גבייה מלקוחות</h4>
                        <div className="p-2 bg-indigo-200/50 rounded-lg text-indigo-600 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-indigo-900">₪{Math.round(balanceOverview.customerDebtIncl).toLocaleString()}</span>
                            <span className="text-[10px] font-bold text-indigo-500">כולל מע"מ</span>
                        </div>
                        <div className="text-sm font-bold text-indigo-600 mt-1">
                            ₪{Math.round(balanceOverview.customerDebtExcl).toLocaleString()} <span className="text-[9px] opacity-70">ללא מע"מ</span>
                        </div>
                    </div>
                    <p className="text-[10px] text-indigo-400 mt-3 font-bold border-t border-indigo-200/50 pt-2">* מעסקאות פעילות בלבד</p>
                </div>

                <div className="bg-gradient-to-br from-rose-50 to-rose-100 p-5 rounded-2xl border border-rose-200 shadow-sm transition-all hover:shadow-md group">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="text-[11px] font-black text-rose-500 uppercase tracking-widest">חוב פתוח לספקים</h4>
                        <div className="p-2 bg-rose-200/50 rounded-lg text-rose-600 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-rose-900">₪{Math.round(balanceOverview.supplierDebtIncl).toLocaleString()}</span>
                            <span className="text-[10px] font-bold text-rose-500">כולל מע"מ</span>
                        </div>
                        <div className="text-sm font-bold text-rose-600 mt-1">
                            ₪{Math.round(balanceOverview.supplierDebtExcl).toLocaleString()} <span className="text-[9px] opacity-70">ללא מע"מ</span>
                        </div>
                    </div>
                    <p className="text-[10px] text-rose-400 mt-3 font-bold border-t border-rose-200/50 pt-2">* רכש ומתקינים בעסקאות פעילות</p>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-5 rounded-2xl border border-emerald-200 shadow-sm transition-all hover:shadow-md group">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">תזרים עתידי פוטנציאלי</h4>
                        <div className="p-2 bg-emerald-200/50 rounded-lg text-emerald-600 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-2">
                            <span className={`text-3xl font-black ${balanceOverview.customerDebtIncl - balanceOverview.supplierDebtIncl < 0 ? 'text-rose-700' : 'text-emerald-900'}`}>
                                ₪{Math.round(balanceOverview.customerDebtIncl - balanceOverview.supplierDebtIncl).toLocaleString()}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-500">כולל מע"מ</span>
                        </div>
                        <div className="text-sm font-bold text-emerald-600 mt-1">
                            ₪{Math.round(balanceOverview.customerDebtExcl - balanceOverview.supplierDebtExcl).toLocaleString()} <span className="text-[9px] opacity-70">ללא מע"מ</span>
                        </div>
                    </div>
                    <p className="text-[10px] text-emerald-500 mt-3 font-bold border-t border-emerald-200/50 pt-2">* יתרה חופשית לאחר תשלום לספקים</p>
                </div>
            </div>

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
                                {[...monthlyData].reverse().map(m => (
                                    <th key={m.monthKey} className="px-4 py-4 text-center font-black min-w-[140px] whitespace-nowrap">
                                        {m.label}
                                    </th>
                                ))}
                                <th className="px-4 py-4 text-center font-black min-w-[150px] bg-slate-700 border-l border-slate-600">סה"כ תקופה</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* PROFIT & LOSS SECTION */}
                            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50/50"><td className="px-4 py-1 sticky right-0 z-20 bg-slate-50/50" colSpan={monthlyData.length + 2}>פעילות עסקית שוטפת</td></tr>
                            <PnLRow label="הכנסות מעסקאות (ללא מע''מ)" field="income" itemsField="incomeItems" customColor="text-emerald-600" />
                            <PnLRow label="עלות המכר (ללא מע''מ)" field="cogs" itemsField="cogsItems" isNegative={true} />
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
                                {[...monthlyData].reverse().map(m => <td key={m.monthKey} className="px-4 py-3 text-center">{formatCurrency(m.netProfit)}</td>)}
                                <td className="px-4 py-3 text-center border-l border-indigo-500 bg-indigo-700 font-black">{formatCurrency(periodTotals.netProfit)}</td>
                            </tr>

                            {/* CASH FLOW ADJUSTMENTS SECTION */}
                            <tr><td colSpan={monthlyData.length + 2} className="h-8"></td></tr>
                            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50/50">
                                <td className="px-4 py-1 sticky right-0 z-20 bg-slate-50/50" colSpan={monthlyData.length + 2}>תנועות הון וחובות (תזרימי)</td>
                            </tr>
                            <PnLRow label="(+) החזרי חוב מחייבים" field="receivableCollections" itemsField="receivableCollectionItems" customColor="text-green-600" />
                            <PnLRow label="(-) תשלום חובות לספקים" field="debtPayments" itemsField="debtPaymentItems" isNegative={true} />
                            <PnLRow label="(-) פירעון קרן הלוואות" field="loanPrincipal" itemsField="loanPrincipalItems" isNegative={true} />
                            
                            <tr className="bg-amber-100 border-t-2 border-amber-300 font-black text-slate-900">
                                <td className="px-4 py-4 text-right flex items-center gap-2 sticky right-0 z-20 bg-amber-100">
                                    יתרה חופשית למשיכה/צבירה
                                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                                </td>
                                {[...monthlyData].reverse().map(m => (
                                    <td key={m.monthKey} className={`px-4 py-4 text-center text-lg ${m.netCashFlow < 0 ? 'text-red-700' : 'text-indigo-800'}`}>
                                        {formatCurrency(m.netCashFlow)}
                                    </td>
                                ))}
                                <td className={`px-4 py-4 text-center border-l border-amber-200 bg-amber-200 font-black text-lg ${periodTotals.netCashFlow < 0 ? 'text-red-700' : 'text-indigo-800'}`}>
                                    {formatCurrency(periodTotals.netCashFlow)}
                                </td>
                            </tr>

                            {/* VAT SECTION */}
                            <tr><td colSpan={monthlyData.length + 2} className="h-8"></td></tr>
                            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50/50"><td className="px-4 py-1 sticky right-0 z-20 bg-slate-50/50" colSpan={monthlyData.length + 2}>סיכום מע"מ תקופתי</td></tr>
                            <PnLRow label='מע"מ מתשלומים שהתקבלו מלקוחות על עסקאות' field="vatOutput" itemsField="vatOutputItems" isNegative={true} />
                            <PnLRow label={"מע\"מ על קניות/הוצאות (תשלומים לספקים, הוצאות קבועות/משתנות, חובות וכו')"} field="vatInput" itemsField="vatInputItems" customColor="text-emerald-600" />
                            <tr className="bg-slate-50">
                                <td className="px-4 py-3 font-bold text-slate-700 sticky right-0 z-20 bg-slate-50">לתשלום / החזר מע"מ</td>
                                {[...monthlyData].reverse().map(m => (
                                    <td key={m.monthKey} className={`px-4 py-3 text-center font-black ${m.vatBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {m.vatBalance > 0 ? `לתשלום: ${formatCurrency(m.vatBalance)}` : `החזר: ${formatCurrency(Math.abs(m.vatBalance))}`}
                                    </td>
                                ))}
                                <td className={`px-4 py-3 text-center border-l border-slate-200 font-black bg-slate-200/50 ${periodTotals.vatBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {periodTotals.vatBalance > 0 ? `לתשלום: ${formatCurrency(periodTotals.vatBalance)}` : `החזר: ${formatCurrency(Math.abs(periodTotals.vatBalance))}`}
                                </td>
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