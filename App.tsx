
import React, { useState, useCallback } from 'react';
import { Customer, Order, Activity, Supplier, Employee, Page, OrderStatusConfiguration, FixedExpense, VariableExpense, Loan, EquityInvestment, Debt, AttendanceRecord, ManualEvent, PayrollOverrideMap, Receivable } from './types';
import { INITIAL_CUSTOMERS, INITIAL_ORDERS, INITIAL_ACTIVITY, INITIAL_SUPPLIERS, INITIAL_EMPLOYEES, INITIAL_ORDER_STATUS_CONFIGS, INITIAL_FIXED_EXPENSES, INITIAL_VARIABLE_EXPENSES, INITIAL_LOANS, INITIAL_EQUITY, INITIAL_DEBTS, INITIAL_ATTENDANCE_RECORDS } from './constants';
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
    const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
    const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
    const [activities, setActivities] = useState<Activity[]>(INITIAL_ACTIVITY);
    const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
    const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
    const [monthlyGoal, setMonthlyGoal] = useState<number>(60000);
    const [statusConfigs, setStatusConfigs] = useState<OrderStatusConfiguration[]>(INITIAL_ORDER_STATUS_CONFIGS);
    const [vatRate, setVatRate] = useState<number>(18); // Default VAT set to 18%
    const [systemMessage, setSystemMessage] = useState<string>('ברוכים הבאים למערכת הניהול! נא להקפיד על עדכון סטטוסים בסוף כל יום.');

    // Finance State
    const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(INITIAL_FIXED_EXPENSES);
    const [variableExpenses, setVariableExpenses] = useState<VariableExpense[]>(INITIAL_VARIABLE_EXPENSES);
    const [loans, setLoans] = useState<Loan[]>(INITIAL_LOANS);
    const [debts, setDebts] = useState<Debt[]>(INITIAL_DEBTS);
    const [receivables, setReceivables] = useState<Receivable[]>([]);
    const [equity, setEquity] = useState<EquityInvestment[]>(INITIAL_EQUITY);

    // Attendance State
    const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE_RECORDS);
    const [payrollOverrides, setPayrollOverrides] = useState<PayrollOverrideMap>({});

    // Calendar Manual Events
    const [manualEvents, setManualEvents] = useState<ManualEvent[]>([]);

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

    const addActivity = useCallback((description: string) => {
        const newActivity: Activity = {
            id: `act_${Date.now()}`,
            description,
            timestamp: new Date(),
        };
        setActivities(prev => [newActivity, ...prev].slice(0, 10)); // Keep last 10 activities
    }, []);

    const addManualEvent = useCallback((event: ManualEvent) => {
        setManualEvents(prev => [...prev, event]);
        addActivity(`אירוע חדש ביומן: ${event.title}`);
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
                            setMonthlyGoal={setMonthlyGoal} 
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
                            setCustomers={setCustomers} 
                            orders={orders} 
                            setOrders={setOrders}
                            addActivity={addActivity} 
                            onNavigateToOrder={handleNavigateToOrder} 
                        />;
            case 'Orders':
                return <OrdersPage 
                            orders={orders} 
                            setOrders={setOrders} 
                            customers={customers} 
                            setCustomers={setCustomers} 
                            suppliers={suppliers} 
                            setSuppliers={setSuppliers} 
                            employees={employees} 
                            addActivity={addActivity} 
                            initialOpenOrderId={openOrderId} 
                            onOrderOpened={onOrderOpened}
                            statusConfigs={statusConfigs}
                            getNextOrderNumber={getNextOrderNumber}
                            vatRate={vatRate}
                        />;
            case 'Suppliers':
                return <SuppliersPage suppliers={suppliers} setSuppliers={setSuppliers} addActivity={addActivity} orders={orders} />;
            case 'Employees':
                return <EmployeesPage 
                    employees={employees} 
                    setEmployees={setEmployees} 
                    addActivity={addActivity}
                    attendanceRecords={attendanceRecords}
                    setAttendanceRecords={setAttendanceRecords} 
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
                            setOrders={setOrders} 
                            statusConfigs={statusConfigs} 
                            vatRate={vatRate}
                        />;
            case 'Finance':
                return <FinancePage 
                            fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses}
                            variableExpenses={variableExpenses} setVariableExpenses={setVariableExpenses}
                            loans={loans} setLoans={setLoans}
                            debts={debts} setDebts={setDebts}
                            receivables={receivables} setReceivables={setReceivables}
                            equity={equity} setEquity={setEquity}
                            addActivity={addActivity}
                            vatRate={vatRate}
                            orders={orders}
                            setOrders={setOrders}
                            employees={employees}
                            attendanceRecords={attendanceRecords}
                            statusConfigs={statusConfigs}
                        />;
            case 'Attendance':
                return <AttendancePage 
                    employees={employees} 
                    records={attendanceRecords} 
                    setRecords={setAttendanceRecords} 
                    orders={orders}
                    statusConfigs={statusConfigs}
                    payrollOverrides={payrollOverrides}
                    setPayrollOverrides={setPayrollOverrides}
                />;
            case 'Settings':
                return <SettingsPage 
                            statusConfigs={statusConfigs} 
                            setStatusConfigs={setStatusConfigs} 
                            addActivity={addActivity} 
                            employees={employees}
                            setEmployees={setEmployees}
                            vatRate={vatRate}
                            setVatRate={setVatRate}
                            systemMessage={systemMessage}
                            setSystemMessage={setSystemMessage}
                            attendanceRecords={attendanceRecords}
                            setAttendanceRecords={setAttendanceRecords}
                        />;
            default:
                return <Dashboard customers={customers} orders={orders} activities={activities} monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} employees={employees} onNavigateToOrder={handleNavigateToOrder} statusConfigs={statusConfigs} vatRate={vatRate} systemMessage={systemMessage} manualEvents={manualEvents} addManualEvent={addManualEvent} />;
        }
    };

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
