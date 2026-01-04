
import React, { useState, useCallback, useEffect } from 'react';
import { Customer, Order, Activity, Supplier, Employee, Page, OrderStatusConfiguration, FixedExpense, VariableExpense, Loan, EquityInvestment, Debt, AttendanceRecord, ManualEvent, PayrollOverrideMap, Receivable } from './types';
import {
    getCustomers, createCustomer, updateCustomer, deleteCustomer,
    getOrders, createOrder, updateOrder, deleteOrder,
    getSuppliers, createSupplier, updateSupplier, deleteSupplier,
    getEmployees, createEmployee, updateEmployee, deleteEmployee,
    getActivities, createActivity,
    getStatusConfigs, updateStatusConfigs,
    getFixedExpenses, createFixedExpense, updateFixedExpense, deleteFixedExpense,
    getVariableExpenses, createVariableExpense, updateVariableExpense, deleteVariableExpense,
    getLoans, createLoan, updateLoan, deleteLoan,
    getDebts, createDebt, updateDebt, deleteDebt,
    getReceivables, createReceivable, updateReceivable, deleteReceivable,
    getEquity, createEquity, updateEquity, deleteEquity,
    getAttendanceRecords, createAttendanceRecord, updateAttendanceRecord, deleteAttendanceRecord,
    getManualEvents, createManualEvent, deleteManualEvent,
    getSettings, updateSettings
} from './services/mongoService';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CustomersPage from './components/CustomersPage';
import OrdersPage from './components/OrdersPage';
import SuppliersPage from './components/SuppliersPage';
import EmployeesPage from './components/EmployeesPage';
import Header from './components/Header';
import ReportsPage from './components/ReportsPage';
import DealsPage from './components/DealsPage';
import TransactionsPage from './components/TransactionsPage';
import TimesheetPage from './components/TimesheetPage';
import QuotesPage from './components/QuotesPage';
import SettingsPage from './components/SettingsPage';
import FinancePage from './components/FinancePage';
import AttendancePage from './components/AttendancePage';

// A map for page titles
export const PAGE_TITLES: Record<Page, string> = {
    Dashboard: 'לוח בקרה',
    Orders: 'הזמנות',
    Customers: 'לקוחות',
    Suppliers: 'ספקים',
    Employees: 'עובדים',
    Deals: 'עסקאות',
    Transactions: 'תנועות כספיות',
    Timesheets: 'גיליונות שעות',
    Quotes: 'הצעות מחיר',
    Reports: 'תשלום לספקים',
    Settings: 'הגדרות מערכת',
    Finance: 'דוחות / תקציב',
    Attendance: 'נוכחות ושכר',
};

const App: React.FC = () => {
    const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [monthlyGoal, setMonthlyGoal] = useState<number>(60000);
    const [statusConfigs, setStatusConfigs] = useState<OrderStatusConfiguration[]>([]);
    const [vatRate, setVatRate] = useState<number>(18);
    const [systemMessage, setSystemMessage] = useState<string>('ברוכים הבאים למערכת הניהול! נא להקפיד על עדכון סטטוסים בסוף כל יום.');

    // Finance State
    const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
    const [variableExpenses, setVariableExpenses] = useState<VariableExpense[]>([]);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [receivables, setReceivables] = useState<Receivable[]>([]);
    const [equity, setEquity] = useState<EquityInvestment[]>([]);

    // Attendance State
    const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
    const [payrollOverrides, setPayrollOverrides] = useState<PayrollOverrideMap>({});

    // Calendar Manual Events
    const [manualEvents, setManualEvents] = useState<ManualEvent[]>([]);

    // Loading and Error States
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Load all data from MongoDB on mount
    useEffect(() => {
        const loadAllData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                // Load all data in parallel
                const [
                    customersData,
                    ordersData,
                    suppliersData,
                    employeesData,
                    activitiesData,
                    statusConfigsData,
                    fixedExpensesData,
                    variableExpensesData,
                    loansData,
                    debtsData,
                    receivablesData,
                    equityData,
                    attendanceRecordsData,
                    manualEventsData,
                    settingsData
                ] = await Promise.all([
                    getCustomers(),
                    getOrders(),
                    getSuppliers(),
                    getEmployees(),
                    getActivities(),
                    getStatusConfigs(),
                    getFixedExpenses(),
                    getVariableExpenses(),
                    getLoans(),
                    getDebts(),
                    getReceivables(),
                    getEquity(),
                    getAttendanceRecords(),
                    getManualEvents(),
                    getSettings()
                ]);

                setCustomers(customersData);
                setOrders(ordersData);
                setSuppliers(suppliersData);
                setEmployees(employeesData);
                setActivities(activitiesData);
                setStatusConfigs(statusConfigsData.length > 0 ? statusConfigsData : []);
                setFixedExpenses(fixedExpensesData);
                setVariableExpenses(variableExpensesData);
                setLoans(loansData);
                setDebts(debtsData);
                setReceivables(receivablesData);
                setEquity(equityData);
                setAttendanceRecords(attendanceRecordsData);
                setManualEvents(manualEventsData);
                
                // Update settings
                setVatRate(settingsData.vatRate);
                setMonthlyGoal(settingsData.monthlyGoal);
                setSystemMessage(settingsData.systemMessage);
                setPayrollOverrides(settingsData.payrollOverrides);
            } catch (err) {
                console.error('Error loading data:', err);
                setError('שגיאה בטעינת הנתונים. אנא רענן את הדף.');
            } finally {
                setIsLoading(false);
            }
        };

        loadAllData();
    }, []);

    const [openOrderId, setOpenOrderId] = useState<string | null>(null);
    
    // Mock data placeholders for new pages
    const [deals, setDeals] = useState<any[]>([]); 
    const [transactions, setTransactions] = useState<any[]>([]);
    const [timeEntries, setTimeEntries] = useState<any[]>([]);
    const [quotes, setQuotes] = useState<any[]>([]);

    const handleNavigateToOrder = useCallback((orderId: string) => {
        setCurrentPage('Orders');
        setOpenOrderId(orderId);
    }, []);
    
    const onOrderOpened = useCallback(() => {
        setOpenOrderId(null);
    }, []);

    const addActivity = useCallback(async (description: string) => {
        const newActivity: Activity = {
            id: `act_${Date.now()}`,
            description,
            timestamp: new Date(),
        };
        try {
            await createActivity(newActivity);
            setActivities(prev => [newActivity, ...prev].slice(0, 10));
        } catch (err) {
            console.error('Error creating activity:', err);
            // Still update UI even if DB save fails
            setActivities(prev => [newActivity, ...prev].slice(0, 10));
        }
    }, []);

    const addManualEvent = useCallback(async (event: ManualEvent) => {
        try {
            await createManualEvent(event);
            setManualEvents(prev => [...prev, event]);
            addActivity(`אירוע חדש ביומן: ${event.title}`);
        } catch (err) {
            console.error('Error creating manual event:', err);
            setError('שגיאה בשמירת האירוע');
        }
    }, [addActivity]);

    // Logic to generate sequential order numbers
    const getNextOrderNumber = useCallback(() => {
        if (!orders || !Array.isArray(orders)) return 'ORD-1001';

        const sequentialOrders = orders.filter(o => {
            if (!o || !o.orderNumber) return false;
            try {
                const orderNumStr = String(o.orderNumber);
                const numPart = parseInt(orderNumStr.replace(/\D/g, ''), 10);
                return !isNaN(numPart) && numPart < 1000000; 
            } catch (e) {
                return false;
            }
        });

        if (sequentialOrders.length === 0) {
            return 'ORD-1001';
        }
        
        const maxNumber = sequentialOrders.reduce((max, order) => {
            if (!order || !order.orderNumber) return max;
            try {
                const orderNumStr = String(order.orderNumber);
                const numPart = parseInt(orderNumStr.replace(/\D/g, ''), 10);
                return !isNaN(numPart) ? Math.max(max, numPart) : max;
            } catch (e) {
                return max;
            }
        }, 1000); 

        return `ORD-${maxNumber + 1}`;
    }, [orders]);
    
    const renderPage = () => {
        switch (currentPage) {
            case 'Dashboard':
                return <Dashboard 
                            customers={customers} 
                            orders={orders} 
                            activities={activities} 
                            monthlyGoal={monthlyGoal} 
                            setMonthlyGoal={setMonthlyGoalWithSync} 
                            employees={employees}
                            onNavigateToOrder={handleNavigateToOrder}
                            statusConfigs={statusConfigs}
                            vatRate={vatRate}
                            systemMessage={systemMessage}
                            manualEvents={manualEvents}
                            addManualEvent={addManualEvent}
                        />;
            case 'Customers':
                return <CustomersPage 
                            customers={customers} 
                            setCustomers={setCustomersWithSync} 
                            orders={orders} 
                            setOrders={setOrdersWithSync}
                            addActivity={addActivity} 
                            onNavigateToOrder={handleNavigateToOrder}
                            statusConfigs={statusConfigs}
                            vatRate={vatRate}
                        />;
            case 'Orders':
                return <OrdersPage 
                            orders={orders} 
                            setOrders={setOrdersWithSync} 
                            customers={customers} 
                            setCustomers={setCustomersWithSync} 
                            suppliers={suppliers} 
                            setSuppliers={setSuppliersWithSync} 
                            employees={employees} 
                            addActivity={addActivity} 
                            initialOpenOrderId={openOrderId} 
                            onOrderOpened={onOrderOpened}
                            statusConfigs={statusConfigs}
                            getNextOrderNumber={getNextOrderNumber}
                            vatRate={vatRate}
                        />;
            case 'Suppliers':
                return <SuppliersPage 
                    suppliers={suppliers} 
                    setSuppliers={setSuppliersWithSync} 
                    addActivity={addActivity} 
                    orders={orders} 
                    setOrders={setOrdersWithSync} 
                    transactions={transactions}
                    setTransactions={setTransactions}
                />;
            case 'Employees':
                return <EmployeesPage 
                    employees={employees} 
                    setEmployees={setEmployeesWithSync} 
                    addActivity={addActivity}
                    attendanceRecords={attendanceRecords}
                    setAttendanceRecords={setAttendanceRecordsWithSync} 
                />;
            case 'Deals':
                 return <DealsPage deals={deals} setDeals={setDeals} customers={customers} handleUpdateDealStage={() => {}} addActivity={addActivity} />;
            case 'Transactions':
                 return <TransactionsPage transactions={transactions} setTransactions={setTransactions} customers={customers} deals={deals} suppliers={suppliers} addActivity={addActivity} />;
            case 'Timesheets':
                 return <TimesheetPage timeEntries={timeEntries} setTimeEntries={setTimeEntries} employees={employees} addActivity={addActivity} />;
            case 'Quotes':
                 return <QuotesPage quotes={quotes} setQuotes={setQuotes} customers={customers} addActivity={addActivity} />;
            case 'Reports':
                return <ReportsPage 
                            orders={orders} 
                            suppliers={suppliers} 
                            onNavigateToOrder={handleNavigateToOrder} 
                            setOrders={setOrdersWithSync} 
                            statusConfigs={statusConfigs} 
                            vatRate={vatRate}
                        />;
            case 'Finance':
                return <FinancePage 
                            fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpensesWithSync}
                            variableExpenses={variableExpenses} setVariableExpenses={setVariableExpensesWithSync}
                            loans={loans} setLoans={setLoansWithSync}
                            debts={debts} setDebts={setDebtsWithSync}
                            receivables={receivables} setReceivables={setReceivablesWithSync}
                            equity={equity} setEquity={setEquityWithSync}
                            addActivity={addActivity}
                            vatRate={vatRate}
                            orders={orders}
                            setOrders={setOrdersWithSync}
                            employees={employees}
                            attendanceRecords={attendanceRecords}
                            statusConfigs={statusConfigs}
                        />;
            case 'Attendance':
                return <AttendancePage 
                    employees={employees} 
                    records={attendanceRecords} 
                    setRecords={setAttendanceRecordsWithSync} 
                    orders={orders}
                    statusConfigs={statusConfigs}
                    payrollOverrides={payrollOverrides}
                    setPayrollOverrides={setPayrollOverridesWithSync}
                />;
            case 'Settings':
                return <SettingsPage 
                            statusConfigs={statusConfigs} 
                            setStatusConfigs={setStatusConfigsWithSync} 
                            addActivity={addActivity} 
                            employees={employees}
                            setEmployees={setEmployeesWithSync}
                            vatRate={vatRate}
                            setVatRate={setVatRateWithSync}
                            systemMessage={systemMessage}
                            setSystemMessage={setSystemMessageWithSync}
                            attendanceRecords={attendanceRecords}
                            setAttendanceRecords={setAttendanceRecordsWithSync}
                        />;
            default:
                return <Dashboard customers={customers} orders={orders} activities={activities} monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoalWithSync} employees={employees} onNavigateToOrder={handleNavigateToOrder} statusConfigs={statusConfigs} vatRate={vatRate} systemMessage={systemMessage} manualEvents={manualEvents} addManualEvent={addManualEvent} />;
        }
    };

    // Wrapper functions that sync with MongoDB
    const setCustomersWithSync = useCallback(async (updater: Customer[] | ((prev: Customer[]) => Customer[])) => {
        const newCustomers = typeof updater === 'function' ? updater(customers) : updater;
        setCustomers(newCustomers);
        // Sync to MongoDB in background
        try {
            for (const customer of newCustomers) {
                const existing = customers.find(c => c.id === customer.id);
                if (existing) {
                    await updateCustomer(customer);
                } else {
                    await createCustomer(customer);
                }
            }
            // Delete removed customers
            const removedIds = customers.filter(c => !newCustomers.find(nc => nc.id === c.id)).map(c => c.id);
            for (const id of removedIds) {
                await deleteCustomer(id);
            }
        } catch (err) {
            console.error('Error syncing customers:', err);
        }
    }, [customers]);

    const setOrdersWithSync = useCallback(async (updater: Order[] | ((prev: Order[]) => Order[])) => {
        const newOrders = typeof updater === 'function' ? updater(orders) : updater;
        setOrders(newOrders);
        try {
            for (const order of newOrders) {
                const existing = orders.find(o => o.id === order.id);
                if (existing) {
                    await updateOrder(order);
                } else {
                    await createOrder(order);
                }
            }
            const removedIds = orders.filter(o => !newOrders.find(no => no.id === o.id)).map(o => o.id);
            for (const id of removedIds) {
                await deleteOrder(id);
            }
        } catch (err) {
            console.error('Error syncing orders:', err);
        }
    }, [orders]);

    const setSuppliersWithSync = useCallback(async (updater: Supplier[] | ((prev: Supplier[]) => Supplier[])) => {
        const newSuppliers = typeof updater === 'function' ? updater(suppliers) : updater;
        setSuppliers(newSuppliers);
        try {
            for (const supplier of newSuppliers) {
                const existing = suppliers.find(s => s.id === supplier.id);
                if (existing) {
                    await updateSupplier(supplier);
                } else {
                    await createSupplier(supplier);
                }
            }
            const removedIds = suppliers.filter(s => !newSuppliers.find(ns => ns.id === s.id)).map(s => s.id);
            for (const id of removedIds) {
                await deleteSupplier(id);
            }
        } catch (err) {
            console.error('Error syncing suppliers:', err);
        }
    }, [suppliers]);

    const setEmployeesWithSync = useCallback(async (updater: Employee[] | ((prev: Employee[]) => Employee[])) => {
        const newEmployees = typeof updater === 'function' ? updater(employees) : updater;
        setEmployees(newEmployees);
        try {
            for (const employee of newEmployees) {
                const existing = employees.find(e => e.id === employee.id);
                if (existing) {
                    await updateEmployee(employee);
                } else {
                    await createEmployee(employee);
                }
            }
            const removedIds = employees.filter(e => !newEmployees.find(ne => ne.id === e.id)).map(e => e.id);
            for (const id of removedIds) {
                await deleteEmployee(id);
            }
        } catch (err) {
            console.error('Error syncing employees:', err);
        }
    }, [employees]);

    const setStatusConfigsWithSync = useCallback(async (updater: OrderStatusConfiguration[] | ((prev: OrderStatusConfiguration[]) => OrderStatusConfiguration[])) => {
        const newConfigs = typeof updater === 'function' ? updater(statusConfigs) : updater;
        setStatusConfigs(newConfigs);
        try {
            await updateStatusConfigs(newConfigs);
        } catch (err) {
            console.error('Error syncing status configs:', err);
        }
    }, [statusConfigs]);

    const setFixedExpensesWithSync = useCallback(async (updater: FixedExpense[] | ((prev: FixedExpense[]) => FixedExpense[])) => {
        const newExpenses = typeof updater === 'function' ? updater(fixedExpenses) : updater;
        setFixedExpenses(newExpenses);
        try {
            for (const expense of newExpenses) {
                const existing = fixedExpenses.find(e => e.id === expense.id);
                if (existing) {
                    await updateFixedExpense(expense);
                } else {
                    await createFixedExpense(expense);
                }
            }
            const removedIds = fixedExpenses.filter(e => !newExpenses.find(ne => ne.id === e.id)).map(e => e.id);
            for (const id of removedIds) {
                await deleteFixedExpense(id);
            }
        } catch (err) {
            console.error('Error syncing fixed expenses:', err);
        }
    }, [fixedExpenses]);

    const setVariableExpensesWithSync = useCallback(async (updater: VariableExpense[] | ((prev: VariableExpense[]) => VariableExpense[])) => {
        const newExpenses = typeof updater === 'function' ? updater(variableExpenses) : updater;
        setVariableExpenses(newExpenses);
        try {
            for (const expense of newExpenses) {
                const existing = variableExpenses.find(e => e.id === expense.id);
                if (existing) {
                    await updateVariableExpense(expense);
                } else {
                    await createVariableExpense(expense);
                }
            }
            const removedIds = variableExpenses.filter(e => !newExpenses.find(ne => ne.id === e.id)).map(e => e.id);
            for (const id of removedIds) {
                await deleteVariableExpense(id);
            }
        } catch (err) {
            console.error('Error syncing variable expenses:', err);
        }
    }, [variableExpenses]);

    const setLoansWithSync = useCallback(async (updater: Loan[] | ((prev: Loan[]) => Loan[])) => {
        const newLoans = typeof updater === 'function' ? updater(loans) : updater;
        setLoans(newLoans);
        try {
            for (const loan of newLoans) {
                const existing = loans.find(l => l.id === loan.id);
                if (existing) {
                    await updateLoan(loan);
                } else {
                    await createLoan(loan);
                }
            }
            const removedIds = loans.filter(l => !newLoans.find(nl => nl.id === l.id)).map(l => l.id);
            for (const id of removedIds) {
                await deleteLoan(id);
            }
        } catch (err) {
            console.error('Error syncing loans:', err);
        }
    }, [loans]);

    const setDebtsWithSync = useCallback(async (updater: Debt[] | ((prev: Debt[]) => Debt[])) => {
        const newDebts = typeof updater === 'function' ? updater(debts) : updater;
        setDebts(newDebts);
        try {
            for (const debt of newDebts) {
                const existing = debts.find(d => d.id === debt.id);
                if (existing) {
                    await updateDebt(debt);
                } else {
                    await createDebt(debt);
                }
            }
            const removedIds = debts.filter(d => !newDebts.find(nd => nd.id === d.id)).map(d => d.id);
            for (const id of removedIds) {
                await deleteDebt(id);
            }
        } catch (err) {
            console.error('Error syncing debts:', err);
        }
    }, [debts]);

    const setReceivablesWithSync = useCallback(async (updater: Receivable[] | ((prev: Receivable[]) => Receivable[])) => {
        const newReceivables = typeof updater === 'function' ? updater(receivables) : updater;
        setReceivables(newReceivables);
        try {
            for (const receivable of newReceivables) {
                const existing = receivables.find(r => r.id === receivable.id);
                if (existing) {
                    await updateReceivable(receivable);
                } else {
                    await createReceivable(receivable);
                }
            }
            const removedIds = receivables.filter(r => !newReceivables.find(nr => nr.id === r.id)).map(r => r.id);
            for (const id of removedIds) {
                await deleteReceivable(id);
            }
        } catch (err) {
            console.error('Error syncing receivables:', err);
        }
    }, [receivables]);

    const setEquityWithSync = useCallback(async (updater: EquityInvestment[] | ((prev: EquityInvestment[]) => EquityInvestment[])) => {
        const newEquity = typeof updater === 'function' ? updater(equity) : updater;
        setEquity(newEquity);
        try {
            for (const eq of newEquity) {
                const existing = equity.find(e => e.id === eq.id);
                if (existing) {
                    await updateEquity(eq);
                } else {
                    await createEquity(eq);
                }
            }
            const removedIds = equity.filter(e => !newEquity.find(ne => ne.id === e.id)).map(e => e.id);
            for (const id of removedIds) {
                await deleteEquity(id);
            }
        } catch (err) {
            console.error('Error syncing equity:', err);
        }
    }, [equity]);

    const setAttendanceRecordsWithSync = useCallback(async (updater: AttendanceRecord[] | ((prev: AttendanceRecord[]) => AttendanceRecord[])) => {
        const newRecords = typeof updater === 'function' ? updater(attendanceRecords) : updater;
        setAttendanceRecords(newRecords);
        try {
            for (const record of newRecords) {
                const existing = attendanceRecords.find(r => r.id === record.id);
                if (existing) {
                    await updateAttendanceRecord(record);
                } else {
                    await createAttendanceRecord(record);
                }
            }
            const removedIds = attendanceRecords.filter(r => !newRecords.find(nr => nr.id === r.id)).map(r => r.id);
            for (const id of removedIds) {
                await deleteAttendanceRecord(id);
            }
        } catch (err) {
            console.error('Error syncing attendance records:', err);
        }
    }, [attendanceRecords]);

    const setMonthlyGoalWithSync = useCallback(async (goal: number) => {
        setMonthlyGoal(goal);
        try {
            const settings = await getSettings();
            await updateSettings({ ...settings, monthlyGoal: goal });
        } catch (err) {
            console.error('Error updating monthly goal:', err);
        }
    }, []);

    const setVatRateWithSync = useCallback(async (rate: number) => {
        setVatRate(rate);
        try {
            const settings = await getSettings();
            await updateSettings({ ...settings, vatRate: rate });
        } catch (err) {
            console.error('Error updating VAT rate:', err);
        }
    }, []);

    const setSystemMessageWithSync = useCallback(async (message: string) => {
        setSystemMessage(message);
        try {
            const settings = await getSettings();
            await updateSettings({ ...settings, systemMessage: message });
        } catch (err) {
            console.error('Error updating system message:', err);
        }
    }, []);

    const setPayrollOverridesWithSync = useCallback(async (overrides: PayrollOverrideMap) => {
        setPayrollOverrides(overrides);
        try {
            const settings = await getSettings();
            await updateSettings({ ...settings, payrollOverrides: overrides });
        } catch (err) {
            console.error('Error updating payroll overrides:', err);
        }
    }, []);

    if (isLoading) {
        return (
            <div className="flex h-screen bg-light-bg items-center justify-center" dir="rtl">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-slate-600">טוען נתונים...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen bg-light-bg items-center justify-center" dir="rtl">
                <div className="text-center bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
                    <p className="text-red-800 font-bold mb-2">שגיאה בטעינת הנתונים</p>
                    <p className="text-red-600 mb-4">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                        רענן דף
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-light-bg" dir="rtl">
            <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title={PAGE_TITLES[currentPage]} employees={employees} attendanceRecords={attendanceRecords} />
                <main className="flex-1 overflow-x-auto overflow-y-auto bg-light-bg p-4 sm:p-6 lg:p-8">
                    {renderPage()}
                </main>
            </div>
        </div>
    );
};

export default App;
