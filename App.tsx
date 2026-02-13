
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Customer, Order, Activity, AddActivityOptions, Supplier, Employee, Page, OrderStatusConfiguration, FixedExpense, VariableExpense, Loan, EquityInvestment, Debt, AttendanceRecord, ManualEvent, PayrollOverrideMap, Receivable } from './types';
import { useAuth } from './contexts/AuthContext';
import { useViewTracker } from './contexts/ViewTrackerContext';
import ProtectedRoute from './components/ProtectedRoute';
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
import PriceListPage from './components/PriceListPage';
import CallCenterPage from './components/CallCenterPage';
import ImprovementSuggestionsPage from './components/ImprovementSuggestionsPage';
import PerformanceDashboardPage from './components/PerformanceDashboardPage';

// A map for page titles
export const PAGE_TITLES: Record<Page, string> = {
    Dashboard: 'לוח בקרה',
    Orders: 'לוח הזמנות',
    Customers: 'לקוחות',
    Suppliers: 'ספקים',
    Employees: 'עובדים',
    Deals: 'עסקאות',
    Transactions: 'תנועות כספיות',
    Timesheets: 'גיליונות שעות',
    Quotes: 'הצעות מחיר',
    Reports: 'תשלום לספקים',
    Performance: 'דוח ביצועים',
    Settings: 'הגדרות מערכת',
    Finance: 'דוחות / תקציב',
    Attendance: 'נוכחות ושכר',
    PriceList: 'מחירון',
    CallCenter: 'מרכזייה',
    ImprovementSuggestions: 'הצעות ייעול',
};

const App: React.FC = () => {
    const { user } = useAuth();
    const { trackViewStart, trackViewEnd } = useViewTracker();
    const prevPageRef = useRef<Page | null>(null);
    const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [monthlyGoal, setMonthlyGoal] = useState<number>(60000);
    const [statusConfigs, setStatusConfigs] = useState<OrderStatusConfiguration[]>([]);
    const [vatRate, setVatRate] = useState<number>(18);
    const [systemMessage, setSystemMessage] = useState<string>('ברוכים הבאים למערכת הניהול! נא להקפיד על עדכון סטטוסים בסוף כל יום.');
    const [vatRateHistory, setVatRateHistory] = useState<any[]>([]);

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
    const payrollOverridesRef = useRef<PayrollOverrideMap>(payrollOverrides);
    payrollOverridesRef.current = payrollOverrides;
    const attendanceMutationInProgressRef = useRef(false);

    // Calendar Manual Events
    const [manualEvents, setManualEvents] = useState<ManualEvent[]>([]);

    // Loading and Error States
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [backgroundLoadError, setBackgroundLoadError] = useState<string | null>(null);
    
    // Auth context
    const { logout, isAuthenticated } = useAuth();
    
    // Redirect EMPLOYEE away from restricted pages (Finance allows "ניהול צ'קים נכנסים" only)
    useEffect(() => {
        if (user?.roleType === 'EMPLOYEE') {
            if (currentPage === 'Settings') {
                setCurrentPage('Dashboard');
            }
        }
    }, [currentPage, user]);
    
    // Auto-logout after inactivity (30 minutes)
    useEffect(() => {
        if (!isAuthenticated) return;
        
        const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        let inactivityTimer: NodeJS.Timeout;
        
        const resetTimer = () => {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                alert('התנתקת אוטומטית עקב חוסר פעילות');
                logout();
            }, INACTIVITY_TIMEOUT);
        };
        
        // Reset timer on user activity
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(event => {
            document.addEventListener(event, resetTimer, true);
        });
        
        resetTimer();
        
        return () => {
            clearTimeout(inactivityTimer);
            events.forEach(event => {
                document.removeEventListener(event, resetTimer, true);
            });
        };
    }, [isAuthenticated, logout]);

    // Track page/route views for usage analytics
    useEffect(() => {
        const key = `route_${currentPage}`;
        const label = PAGE_TITLES[currentPage];
        if (prevPageRef.current !== null) {
            trackViewEnd(`route_${prevPageRef.current}`);
        }
        trackViewStart(key, 'route', undefined, label);
        prevPageRef.current = currentPage;
    }, [currentPage, trackViewStart, trackViewEnd]);

    // Load data in two phases: critical first (show app fast), then rest in background
    const CRITICAL_TIMEOUT_MS = 10000;
    const BACKGROUND_TIMEOUT_MS = 60000; // 60s – טעינת לקוחות, הזמנות, ספקים וכו' יכולה לקחת זמן ברשת איטית או DB כבד

    // Extracted so it can be called from effect (with cancelledRef) and from retry button (no ref). Guards prevent state updates after unmount.
    const loadBackgroundData = useCallback(async (cancelledRef?: { current: boolean }) => {
        const isCancelled = () => cancelledRef?.current === true;
        const entries: { label: string; fn: () => Promise<any> }[] = [
            { label: 'לקוחות', fn: getCustomers },
            { label: 'הזמנות', fn: getOrders },
            { label: 'ספקים', fn: getSuppliers },
            { label: 'פעילויות', fn: getActivities },
            { label: 'הוצאות קבועות', fn: getFixedExpenses },
            { label: 'הוצאות משתנות', fn: getVariableExpenses },
            { label: 'הלוואות', fn: getLoans },
            { label: 'חובות', fn: getDebts },
            { label: 'לקוחות לפתיחה', fn: getReceivables },
            { label: 'הון', fn: getEquity },
            { label: 'נוכחות', fn: getAttendanceRecords },
            { label: 'אירועים', fn: getManualEvents },
        ];
        const loadPromise = Promise.allSettled(entries.map((e) => e.fn()));
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('BACKGROUND_TIMEOUT')), BACKGROUND_TIMEOUT_MS)
        );
        let results: PromiseSettledResult<any>[];
        try {
            results = await Promise.race([loadPromise, timeoutPromise]);
        } catch (err) {
            if (!isCancelled()) {
                console.error('Background data load timeout or error:', err);
                setBackgroundLoadError('טעינת הנתונים נכשלה (timeout). וודא שהשרת רץ ורענן את הדף.');
            }
            return;
        }
        if (isCancelled()) return;
        const failed = results
            .map((r, i) => (r.status === 'rejected' ? { label: entries[i].label, err: (r as PromiseRejectedResult).reason } : null))
            .filter((x): x is { label: string; err: unknown } => x !== null);
        const getValue = (r: PromiseSettledResult<any>, fallback: any) => (r.status === 'fulfilled' ? r.value : fallback);
        if (failed.length > 0) {
            if (!isCancelled()) {
                console.error('Error loading background data (partial):', failed);
                const msg = failed.length >= entries.length
                    ? 'הנתונים לא נטענו. ייתכן שהשרת לא זמין או שיש בעיית התחברות. נסה לרענן את הדף.'
                    : `חלק מהנתונים לא נטענו (${failed.map(f => f.label).join(', ')}). נסה שוב או רענן את הדף.`;
                setBackgroundLoadError(msg);
            }
        } else {
            if (!isCancelled()) setBackgroundLoadError(null);
        }
        if (isCancelled()) return;
        try {
            setCustomers(getValue(results[0], []));
            setOrders(getValue(results[1], []));
            setSuppliers(getValue(results[2], []));
            setActivities(getValue(results[3], []));
            setFixedExpenses(getValue(results[4], []));
            setVariableExpenses(getValue(results[5], []));
            setLoans(getValue(results[6], []));
            setDebts(getValue(results[7], []));
            setReceivables(getValue(results[8], []));
            setEquity(getValue(results[9], []));
            setAttendanceRecords(getValue(results[10], []));
            setManualEvents(getValue(results[11], []));
        } catch (err) {
            if (!isCancelled()) console.error('Error applying background data:', err);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const cancelledRef = { current: false };

        const applySettings = (settingsData: any) => {
            setVatRate(settingsData.vatRate);
            setMonthlyGoal(settingsData.monthlyGoal);
            setSystemMessage(settingsData.systemMessage);
            setPayrollOverrides(settingsData.payrollOverrides ?? {});
            if (settingsData.vatRateHistory && Array.isArray(settingsData.vatRateHistory) && settingsData.vatRateHistory.length > 0) {
                const historyWithDates = settingsData.vatRateHistory.map((entry: any) => ({
                    ...entry,
                    changedAt: entry.changedAt ? (entry.changedAt instanceof Date ? entry.changedAt : new Date(entry.changedAt)) : new Date()
                }));
                setVatRateHistory(historyWithDates);
            } else {
                setVatRateHistory([]);
            }
        };

        const loadCritical = async () => {
            setIsLoading(true);
            setError(null);
            setBackgroundLoadError(null);
            const entries: { label: string; fn: () => Promise<any> }[] = [
                { label: 'סטטוסים', fn: getStatusConfigs },
                { label: 'הגדרות', fn: getSettings },
                { label: 'עובדים', fn: getEmployees },
            ];
            const loadPromise = Promise.allSettled(entries.map((e) => e.fn()));
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('DATA_LOAD_TIMEOUT')), CRITICAL_TIMEOUT_MS)
            );
            let results: PromiseSettledResult<any>[];
            try {
                results = await Promise.race([loadPromise, timeoutPromise]);
            } catch (err) {
                if (!cancelled && (err instanceof Error && err.message === 'DATA_LOAD_TIMEOUT')) {
                    setError('השרת לא מגיב. וודא שהשרת רץ (למשל באמצעות start.bat) על פורט 3002, ואז רענן את הדף.');
                } else if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err));
                }
                setIsLoading(false);
                return;
            }
            if (cancelled) return;
            const failed = results
                .map((r, i) => (r.status === 'rejected' ? { label: entries[i].label, err: (r as PromiseRejectedResult).reason } : null))
                .filter((x): x is { label: string; err: unknown } => x !== null);
            if (failed.length > 0) {
                const msg = failed.map((f) => f.label).join(', ');
                const detail = failed[0].err instanceof Error ? failed[0].err.message : String(failed[0].err);
                console.error('Error loading critical data:', failed);
                const isDbUnavailable = /500|503|mongo|connection|מסד הנתונים לא זמין/i.test(detail);
                const hint = isDbUnavailable
                    ? '\n\nוודא שהשרת רץ (למשל start.bat או npm run dev:all) וש־MongoDB מחובר (MONGO_URI ב־server/.env או Atlas נגיש).'
                    : '';
                setError(`שגיאה בטעינת הנתונים. אנא רענן את הדף.\n\nנכשל: ${msg}\n\nפרטים: ${detail}${hint}`);
                setIsLoading(false);
                return;
            }
            const [statusConfigsData, settingsData, employeesData] = (results as PromiseFulfilledResult<any>[]).map((r) => r.value);
            setStatusConfigs(statusConfigsData.length > 0 ? statusConfigsData : []);
            setEmployees(employeesData);
            applySettings(settingsData);
            if (!cancelled) setIsLoading(false);
        };

        loadCritical().then(() => {
            if (!cancelled) loadBackgroundData(cancelledRef);
        });

        // Set up automatic refresh for attendance records every 30 seconds (skip while clock-in/out in progress to avoid overwriting optimistic state)
        const attendanceRefreshInterval = setInterval(async () => {
            if (attendanceMutationInProgressRef.current) return;
            try {
                const updatedRecords = await getAttendanceRecords();
                setAttendanceRecords(updatedRecords);
            } catch (err) {
                console.error('Error refreshing attendance records:', err);
            }
        }, 30000); // Refresh every 30 seconds

        return () => {
            cancelled = true;
            cancelledRef.current = true;
            clearInterval(attendanceRefreshInterval);
        };
    }, [loadBackgroundData]);

    const [openOrderId, setOpenOrderId] = useState<string | null>(null);
    const [openNewOrderRequest, setOpenNewOrderRequest] = useState(false);
    const [newOrderWithCustomerId, setNewOrderWithCustomerId] = useState<string | null>(null);
    const [newOrderWithPhone, setNewOrderWithPhone] = useState<string | null>(null);
    const [newCustomerWithPhone, setNewCustomerWithPhone] = useState<string | null>(null);

    // Mock data placeholders for new pages
    const [deals, setDeals] = useState<any[]>([]); 
    const [transactions, setTransactions] = useState<any[]>([]);
    const [timeEntries, setTimeEntries] = useState<any[]>([]);
    const [quotes, setQuotes] = useState<any[]>([]);

    const handleNavigateToOrder = useCallback((orderId: string) => {
        setCurrentPage('Orders');
        setOpenOrderId(orderId);
    }, []);

    // When opening Dashboard, Reports, or Orders, refresh orders so data is up-to-date (including changes by other users)
    useEffect(() => {
        if (currentPage === 'Dashboard' || currentPage === 'Reports' || currentPage === 'Orders') {
            getOrders().then(setOrders).catch((err) => console.error('Error refreshing orders:', err));
        }
    }, [currentPage]);

    // Performance page is ADMIN only; redirect others to Dashboard
    useEffect(() => {
        if (currentPage === 'Performance' && user?.roleType !== 'ADMIN') {
            setCurrentPage('Dashboard');
        }
    }, [currentPage, user?.roleType]);
    
    const onOrderOpened = useCallback(() => {
        setOpenOrderId(null);
    }, []);

    const handleAddOrderFromHeader = useCallback(() => {
        setCurrentPage('Orders');
        setOpenNewOrderRequest(true);
    }, []);

    const handleNewOrderWithCustomer = useCallback((customerId: string) => {
        setCurrentPage('Orders');
        setOpenNewOrderRequest(true);
        setNewOrderWithCustomerId(customerId);
    }, []);
    const handleNewOrderWithPhone = useCallback((phone: string) => {
        setCurrentPage('Orders');
        setOpenNewOrderRequest(true);
        setNewOrderWithPhone(phone);
    }, []);
    const handleNewCustomerWithPhone = useCallback((phone: string) => {
        setCurrentPage('Customers');
        setNewCustomerWithPhone(phone);
    }, []);

    const addActivity = useCallback(async (description: string, options?: AddActivityOptions) => {
        const newActivity: Activity = {
            id: `act_${Date.now()}`,
            description,
            timestamp: new Date(),
            ...(options && {
                entityType: options.entityType,
                entityId: options.entityId,
                action: options.action,
                metadata: options.metadata,
            }),
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
                            setCustomersLocal={setCustomersLocal} 
                            orders={orders} 
                            setOrders={setOrdersWithSync} 
                            addActivity={addActivity} 
                            onNavigateToOrder={handleNavigateToOrder}
                            statusConfigs={statusConfigs}
                            vatRate={vatRate}
                            selectedCustomerId={selectedCustomerId}
                            setSelectedCustomerId={setSelectedCustomerId}
                            newCustomerWithPhone={newCustomerWithPhone}
                            onClearedNewCustomerWithPhone={() => setNewCustomerWithPhone(null)}
                        />;
            case 'Orders':
                return <OrdersPage 
                            orders={orders} 
                            setOrders={setOrdersWithSync} 
                            setOrdersLocal={setOrdersLocal}
                            customers={customers} 
                            setCustomers={setCustomersWithSync} 
                            suppliers={suppliers} 
                            setSuppliers={setSuppliersWithSync} 
                            employees={employees} 
                            addActivity={addActivity} 
                            initialOpenOrderId={openOrderId} 
                            onOrderOpened={onOrderOpened}
                            openNewOrderRequest={openNewOrderRequest}
                            onClearedOpenNewOrderRequest={() => setOpenNewOrderRequest(false)}
                            openNewOrderWithCustomerId={newOrderWithCustomerId}
                            openNewOrderWithPhone={newOrderWithPhone}
                            onClearedNewOrderPrefill={() => { setNewOrderWithCustomerId(null); setNewOrderWithPhone(null); }}
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
            case 'Performance':
                if (user?.roleType !== 'ADMIN') return <Dashboard customers={customers} orders={orders} activities={activities} monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoalWithSync} employees={employees} onNavigateToOrder={handleNavigateToOrder} statusConfigs={statusConfigs} vatRate={vatRate} systemMessage={systemMessage} manualEvents={manualEvents} addManualEvent={addManualEvent} />;
                return <PerformanceDashboardPage employees={employees} onNavigateToOrder={handleNavigateToOrder} />;
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
                            payrollOverrides={payrollOverrides}
                            onNavigateToOrder={handleNavigateToOrder}
                        />;
            case 'Attendance':
                return <AttendancePage 
                    employees={employees} 
                    records={attendanceRecords} 
                    setRecords={setAttendanceRecords}
                    orders={orders}
                    statusConfigs={statusConfigs}
                    payrollOverrides={payrollOverrides}
                    setPayrollOverrides={setPayrollOverridesWithSync}
                    onAttendanceMutationBusy={(busy) => { attendanceMutationInProgressRef.current = busy; }}
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
                            orders={orders}
                            vatRateHistory={vatRateHistory}
                            onNavigateToOrder={handleNavigateToOrder}
                        />;
            case 'PriceList':
                return <PriceListPage suppliers={suppliers} />;
            case 'CallCenter':
                return <CallCenterPage 
                            onNavigateToPage={setCurrentPage} 
                            setSelectedCustomerId={setSelectedCustomerId}
                            onNewOrderWithCustomer={handleNewOrderWithCustomer}
                            onNewOrderWithPhone={handleNewOrderWithPhone}
                            onNewCustomerWithPhone={handleNewCustomerWithPhone}
                            onNavigateToOrder={handleNavigateToOrder}
                        />;
            case 'ImprovementSuggestions':
                return <ImprovementSuggestionsPage currentPage={currentPage} />;
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
                    if (existing !== customer) await updateCustomer(customer);
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

    const setCustomersLocal = useCallback((updater: (prev: Customer[]) => Customer[]) => {
        setCustomers(updater);
    }, []);

    const setOrdersLocal = useCallback((updater: (prev: Order[]) => Order[]) => {
        setOrders(updater);
    }, []);

    const setOrdersWithSync = useCallback(async (updater: Order[] | ((prev: Order[]) => Order[])) => {
        const newOrders = typeof updater === 'function' ? updater(orders) : updater;
        setOrders(newOrders);
        try {
            const savedById = new Map<string, Order>();
            for (const order of newOrders) {
                const existing = orders.find(o => o.id === order.id);
                if (existing) {
                    if (existing !== order) {
                        const saved = await updateOrder(order);
                        savedById.set(saved.id, saved);
                    }
                } else {
                    const created = await createOrder(order);
                    savedById.set(created.id, created);
                }
            }
            if (savedById.size > 0) {
                setOrders(prev => prev.map(o => savedById.get(o.id) ?? o));
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
                    if (existing !== supplier) await updateSupplier(supplier);
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
                    if (existing !== employee) await updateEmployee(employee);
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
                    if (existing !== expense) await updateFixedExpense(expense);
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
                    if (existing !== expense) await updateVariableExpense(expense);
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
                    if (existing !== loan) await updateLoan(loan);
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
                    if (existing !== debt) await updateDebt(debt);
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
                    if (existing !== receivable) await updateReceivable(receivable);
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
                    if (existing !== eq) await updateEquity(eq);
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
                    if (existing !== record) await updateAttendanceRecord(record);
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

    const setVatRateWithSync = useCallback(async (rate: number, reason?: string) => {
        setVatRate(rate);
        try {
            const settings = await getSettings();
            const updatedSettings = await updateSettings(
                { ...settings, vatRate: rate }, 
                user?.name || user?.id || 'מערכת',
                reason
            );
            
            console.log('setVatRateWithSync - updatedSettings:', {
                vatRate: updatedSettings.vatRate,
                hasHistory: !!updatedSettings.vatRateHistory,
                historyLength: updatedSettings.vatRateHistory?.length || 0,
                history: updatedSettings.vatRateHistory
            });
            
            // Reload settings from DB to ensure we have the latest history
            const freshSettings = await getSettings();
            console.log('setVatRateWithSync - freshSettings:', {
                vatRate: freshSettings.vatRate,
                hasHistory: !!freshSettings.vatRateHistory,
                historyLength: freshSettings.vatRateHistory?.length || 0,
                history: freshSettings.vatRateHistory
            });
            
            // Ensure dates are properly deserialized
            if (freshSettings.vatRateHistory && Array.isArray(freshSettings.vatRateHistory) && freshSettings.vatRateHistory.length > 0) {
                const historyWithDates = freshSettings.vatRateHistory.map((entry: any) => ({
                    ...entry,
                    changedAt: entry.changedAt ? (entry.changedAt instanceof Date ? entry.changedAt : new Date(entry.changedAt)) : new Date()
                }));
                setVatRateHistory(historyWithDates);
                console.log('Updated VAT rate history from fresh settings:', historyWithDates.length, 'entries', historyWithDates[0]);
            } else {
                setVatRateHistory([]);
                console.log('No VAT rate history in fresh settings');
            }
        } catch (err) {
            console.error('Error updating VAT rate:', err);
        }
    }, [user]);

    const setSystemMessageWithSync = useCallback(async (message: string) => {
        setSystemMessage(message);
        try {
            const settings = await getSettings();
            await updateSettings({ ...settings, systemMessage: message });
        } catch (err) {
            console.error('Error updating system message:', err);
        }
    }, []);

    const setPayrollOverridesWithSync = useCallback(async (overridesOrUpdater: React.SetStateAction<PayrollOverrideMap>) => {
        const nextOverrides = typeof overridesOrUpdater === 'function'
            ? overridesOrUpdater(payrollOverridesRef.current)
            : overridesOrUpdater;
        setPayrollOverrides(nextOverrides);
        try {
            const settings = await getSettings();
            await updateSettings({ ...settings, payrollOverrides: nextOverrides });
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
                <div className="text-center bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg max-h-[80vh] overflow-auto">
                    <p className="text-red-800 font-bold mb-2">שגיאה בטעינת הנתונים</p>
                    <p className="text-red-600 mb-4 whitespace-pre-line text-start">{error}</p>
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
        <ProtectedRoute>
            <div className="flex h-screen bg-light-bg min-h-[100dvh]" dir="rtl" style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' } as React.CSSProperties}>
                {/* Desktop sidebar: visible from md up */}
                <div className="hidden md:flex md:w-64 md:flex-shrink-0 md:flex-col">
                    <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
                </div>
                {/* Mobile drawer overlay and panel */}
                {sidebarOpen && (
                    <>
                        <div
                            className="fixed inset-0 bg-black/50 z-40 md:hidden"
                            onClick={() => setSidebarOpen(false)}
                            onKeyDown={(e) => e.key === 'Escape' && setSidebarOpen(false)}
                            aria-hidden
                        />
                        <div className="fixed top-0 right-0 bottom-0 w-72 max-w-[85vw] bg-dark-bg text-white z-50 flex flex-col md:hidden shadow-xl" dir="rtl">
                            <div className="flex items-center justify-between h-20 px-4 border-b border-dark-border flex-shrink-0">
                                <span className="text-xl font-bold text-white">אלי שלטים</span>
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen(false)}
                                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-dark-card min-h-[44px] min-w-[44px] flex items-center justify-center"
                                    aria-label="סגור תפריט"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden flex flex-col">
                                <Sidebar
                                    currentPage={currentPage}
                                    setCurrentPage={setCurrentPage}
                                    onClose={() => setSidebarOpen(false)}
                                    hideBranding
                                />
                            </div>
                        </div>
                    </>
                )}
                <div className="flex-1 flex flex-col min-w-0">
                    <Header
                        title={PAGE_TITLES[currentPage]}
                        employees={employees}
                        attendanceRecords={attendanceRecords}
                        showAddOrderWidget={['Dashboard', 'Orders', 'Customers', 'Suppliers', 'PriceList', 'Attendance', 'CallCenter'].includes(currentPage)}
                        onAddOrder={handleAddOrderFromHeader}
                        onOpenSidebar={() => setSidebarOpen(true)}
                    />
                    {backgroundLoadError && (
                        <div className="mx-4 mt-2 sm:mx-6 lg:mx-8 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800" role="alert">
                            <span className="text-sm font-medium flex-1 min-w-0">{backgroundLoadError}</span>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => { setBackgroundLoadError(null); loadBackgroundData(); }}
                                    className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                                >
                                    נסה שוב
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
                                >
                                    רענן דף
                                </button>
                            </div>
                        </div>
                    )}
                    <main className="flex-1 overflow-x-auto overflow-y-auto bg-light-bg p-4 sm:p-6 lg:p-8">
                        {renderPage()}
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
};

export default App;
