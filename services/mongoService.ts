import {
    Customer, Order, Supplier, Employee, Activity, ActivityFilters, ActivitiesResult, OrderStatusConfiguration,
    FixedExpense, VariableExpense, Loan, Debt, Receivable, EquityInvestment,
    AttendanceRecord, ManualEvent, CallLog
} from '../types';

// API Base URL - use relative path in production
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Helper function to make API requests
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem('authToken');
    
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers,
        ...options,
    });

    if (!response.ok) {
        const text = await response.text();
        let detail = `${response.status} ${response.statusText}`;
        try {
            const j = JSON.parse(text) as { error?: string; message?: string; detail?: string };
            detail = j.detail || j.error || j.message || detail;
        } catch {
            if (text && text.length < 200) detail = text;
        }
        throw new Error(`API request failed (${endpoint}): ${detail}`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json();
}

// ==================== CUSTOMERS ====================
export async function getCustomers(): Promise<Customer[]> {
    return apiRequest<Customer[]>('/customers');
}

export async function createCustomer(customer: Customer): Promise<Customer> {
    return apiRequest<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify(customer),
    });
}

export async function updateCustomer(customer: Customer): Promise<Customer> {
    return apiRequest<Customer>(`/customers/${customer.id}`, {
        method: 'PUT',
        body: JSON.stringify(customer),
    });
}

export async function deleteCustomer(customerId: string): Promise<void> {
    return apiRequest<void>(`/customers/${customerId}`, {
        method: 'DELETE',
    });
}

export async function getCustomersPaginated(filters: { searchTerm?: string }, page: number = 1, limit: number = 50): Promise<any> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        filters: JSON.stringify(filters)
    });
    
    const response = await fetch(`${API_BASE_URL}/customers/paginated?${queryParams}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) throw new Error('Failed to fetch paginated customers');
    return response.json();
}

// ==================== ORDERS ====================
export async function getOrders(): Promise<Order[]> {
    return apiRequest<Order[]>('/orders');
}

export async function getOrdersPaginated(filters: any, page: number = 1, limit: number = 50): Promise<any> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        filters: JSON.stringify(filters)
    });
    
    const response = await fetch(`${API_BASE_URL}/orders/paginated?${queryParams}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) throw new Error('Failed to fetch paginated orders');
    return response.json();
}

export async function getOrderById(orderId: string): Promise<Order> {
    return apiRequest<Order>(`/orders/${orderId}`);
}

export async function getPreparationStatusSuggestions(): Promise<string[]> {
    const data = await apiRequest<{ suggestions: string[] }>('/orders/preparation-status-suggestions');
    return data?.suggestions ?? [];
}

export async function getOrdersByParentId(parentOrderId: string): Promise<Order[]> {
    return apiRequest<Order[]>(`/orders/parent/${parentOrderId}`);
}

// PayableItem interface for supplier payments report (matches server interface)
interface PayableItem {
    uniqueId: string;
    supplierId: string;
    supplierName: string;
    orderId: string;
    orderNumber: string;
    orderDescription: string;
    itemDescription: string;
    cost: number;
    costGross: number;
    paidAmount: number;
    remainingAmount: number;
    orderDate: Date | string;
    dueDate: Date | string;
    isCustomDueDate: boolean;
    status: 'שולם' | 'שולם חלקית' | 'איחור' | 'לתשלום החודש' | 'צפוי' | 'ממתין לסיום';
    timeStatus: 'איחור' | 'לתשלום החודש' | 'צפוי' | 'ממתין לסיום';
    payments: any[];
    itemType: 'lineItem' | 'additionalService';
    itemIndex: number;
}

export async function getPayableItems(
    filters: {
        supplierFilterId?: string;
        dateStart?: string;
        dateEnd?: string;
        showPaid?: boolean;
        viewMode?: 'forecast' | 'purchase_history' | 'payment_log';
    } = {},
    page: number = 1,
    limit: number = 1000
): Promise<{
    items: PayableItem[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    summaryStats: {
        totalDebt: number;
        overdueDebt: number;
        thisMonthDue: number;
        unassignedCount: number;
    };
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        filters: JSON.stringify(filters)
    });
    
    const response = await fetch(`${API_BASE_URL}/orders/payables?${queryParams}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) throw new Error('Failed to fetch payable items');
    return response.json();
}

export async function createOrder(order: Order): Promise<Order> {
    return apiRequest<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify(order),
    });
}

export async function updateOrder(order: Order): Promise<Order> {
    return apiRequest<Order>(`/orders/${order.id}`, {
        method: 'PUT',
        body: JSON.stringify(order),
    });
}

export async function deleteOrder(orderId: string): Promise<void> {
    return apiRequest<void>(`/orders/${orderId}`, {
        method: 'DELETE',
    });
}

// CSV import (טבלת שליטה)
export interface OrdersImportPreviewResult {
    orders: {
        orderNumber: string;
        customerName: string;
        customerId: string | null;
        missingCustomer: boolean;
        date: string | null;
        status: string;
        lineItemCount: number;
        representativeName: string;
        employeeId: string | null;
        repLoggedOnly: boolean;
        existingOrderNumber?: boolean;
    }[];
    newStatusLabels: string[];
    newSupplierNames: string[];
    missingCustomerNames: string[];
    contactsToAdd: { customerId: string; customerName: string; phone?: string; email?: string }[];
    existingOrderNumbers: string[];
}

export async function ordersImportPreview(rows: Record<string, string>[]): Promise<OrdersImportPreviewResult> {
    return apiRequest<OrdersImportPreviewResult>('/orders/import/preview', {
        method: 'POST',
        body: JSON.stringify({ rows }),
    });
}

export async function ordersImportExecute(
    rows: Record<string, string>[],
    options?: { skipExistingOrderNumbers?: boolean }
): Promise<{ created: number; skipped: number; errors: string[] }> {
    return apiRequest<{ created: number; skipped: number; errors: string[] }>('/orders/import/execute', {
        method: 'POST',
        body: JSON.stringify({ rows, skipExistingOrderNumbers: options?.skipExistingOrderNumbers !== false }),
    });
}

// ==================== SUPPLIERS ====================
export async function getSuppliers(): Promise<Supplier[]> {
    return apiRequest<Supplier[]>('/suppliers');
}

export async function getSuppliersPaginated(
    filters: {
        searchTerm?: string;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    suppliers: Supplier[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
    });
    
    if (filters.searchTerm) queryParams.append('searchTerm', filters.searchTerm);
    
    return apiRequest<any>(`/suppliers/paginated?${queryParams}`);
}

export async function createSupplier(supplier: Supplier): Promise<Supplier> {
    return apiRequest<Supplier>('/suppliers', {
        method: 'POST',
        body: JSON.stringify(supplier),
    });
}

export async function updateSupplier(supplier: Supplier): Promise<Supplier> {
    return apiRequest<Supplier>(`/suppliers/${supplier.id}`, {
        method: 'PUT',
        body: JSON.stringify(supplier),
    });
}

export async function deleteSupplier(supplierId: string): Promise<void> {
    return apiRequest<void>(`/suppliers/${supplierId}`, {
        method: 'DELETE',
    });
}

// ==================== EMPLOYEES ====================
export async function getEmployees(): Promise<Employee[]> {
    return apiRequest<Employee[]>('/employees');
}

export async function createEmployee(employee: Employee): Promise<Employee> {
    return apiRequest<Employee>('/employees', {
        method: 'POST',
        body: JSON.stringify(employee),
    });
}

export async function updateEmployee(employee: Employee): Promise<Employee> {
    return apiRequest<Employee>(`/employees/${employee.id}`, {
        method: 'PUT',
        body: JSON.stringify(employee),
    });
}

export async function deleteEmployee(employeeId: string): Promise<void> {
    return apiRequest<void>(`/employees/${employeeId}`, {
        method: 'DELETE',
    });
}

// ==================== ACTIVITIES ====================
export async function getActivities(): Promise<Activity[]> {
    return apiRequest<Activity[]>('/activities');
}

export async function getActivitiesFiltered(filters: ActivityFilters): Promise<ActivitiesResult> {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.entityType) params.set('entityType', filters.entityType);
    if (filters.action) params.set('action', filters.action);
    if (filters.search) params.set('search', filters.search);
    if (filters.page != null) params.set('page', String(filters.page));
    if (filters.limit != null) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiRequest<ActivitiesResult>(`/activities${qs ? `?${qs}` : ''}`);
}

export async function createActivity(activity: Activity): Promise<Activity> {
    return apiRequest<Activity>('/activities', {
        method: 'POST',
        body: JSON.stringify(activity),
    });
}

// ==================== STATUS CONFIGS ====================
export async function getStatusConfigs(): Promise<OrderStatusConfiguration[]> {
    return apiRequest<OrderStatusConfiguration[]>('/status-configs');
}

export async function updateStatusConfigs(configs: OrderStatusConfiguration[]): Promise<OrderStatusConfiguration[]> {
    return apiRequest<OrderStatusConfiguration[]>('/status-configs', {
        method: 'PUT',
        body: JSON.stringify(configs),
    });
}

// ==================== FIXED EXPENSES ====================
export async function getFixedExpenses(): Promise<FixedExpense[]> {
    return apiRequest<FixedExpense[]>('/finance/fixed-expenses');
}

export async function createFixedExpense(expense: FixedExpense): Promise<FixedExpense> {
    return apiRequest<FixedExpense>('/finance/fixed-expenses', {
        method: 'POST',
        body: JSON.stringify(expense),
    });
}

export async function updateFixedExpense(expense: FixedExpense): Promise<FixedExpense> {
    return apiRequest<FixedExpense>(`/finance/fixed-expenses/${expense.id}`, {
        method: 'PUT',
        body: JSON.stringify(expense),
    });
}

export async function deleteFixedExpense(expenseId: string): Promise<void> {
    return apiRequest<void>(`/finance/fixed-expenses/${expenseId}`, {
        method: 'DELETE',
    });
}

// Fixed expenses paginated
export async function getFixedExpensesPaginated(
    filters: {
        showHistorical?: boolean;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    expenses: FixedExpense[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
    });
    
    if (filters.showHistorical !== undefined) {
        queryParams.append('showHistorical', filters.showHistorical.toString());
    }
    
    return apiRequest<any>(`/finance/fixed-expenses/paginated?${queryParams}`);
}

// ==================== VARIABLE EXPENSES ====================
export async function getVariableExpenses(): Promise<VariableExpense[]> {
    return apiRequest<VariableExpense[]>('/finance/variable-expenses');
}

export async function createVariableExpense(expense: VariableExpense): Promise<VariableExpense> {
    return apiRequest<VariableExpense>('/finance/variable-expenses', {
        method: 'POST',
        body: JSON.stringify(expense),
    });
}

export async function updateVariableExpense(expense: VariableExpense): Promise<VariableExpense> {
    return apiRequest<VariableExpense>(`/finance/variable-expenses/${expense.id}`, {
        method: 'PUT',
        body: JSON.stringify(expense),
    });
}

export async function deleteVariableExpense(expenseId: string): Promise<void> {
    return apiRequest<void>(`/finance/variable-expenses/${expenseId}`, {
        method: 'DELETE',
    });
}

// Variable expenses paginated
export async function getVariableExpensesPaginated(
    filters: {
        year?: number | 'all';
        month?: number | 'all';
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    items: any[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
    });
    
    if (filters.year !== undefined) {
        queryParams.append('year', filters.year === 'all' ? 'all' : filters.year.toString());
    }
    if (filters.month !== undefined) {
        queryParams.append('month', filters.month === 'all' ? 'all' : filters.month.toString());
    }
    
    return apiRequest<any>(`/finance/variable-expenses/paginated?${queryParams}`);
}

// ==================== LOANS ====================
export async function getLoans(): Promise<Loan[]> {
    return apiRequest<Loan[]>('/finance/loans');
}

export async function createLoan(loan: Loan): Promise<Loan> {
    return apiRequest<Loan>('/finance/loans', {
        method: 'POST',
        body: JSON.stringify(loan),
    });
}

export async function updateLoan(loan: Loan): Promise<Loan> {
    return apiRequest<Loan>(`/finance/loans/${loan.id}`, {
        method: 'PUT',
        body: JSON.stringify(loan),
    });
}

export async function deleteLoan(loanId: string): Promise<void> {
    return apiRequest<void>(`/finance/loans/${loanId}`, {
        method: 'DELETE',
    });
}

// ==================== DEBTS ====================
export async function getDebts(): Promise<Debt[]> {
    return apiRequest<Debt[]>('/finance/debts');
}

export async function getDebtsPaginated(
    filters: {
        searchTerm?: string;
        statusFilter?: 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID';
    } = {},
    page: number = 1,
    limit: number = 50,
    vatRate: number = 0
): Promise<{
    debts: (Debt & { gross: number; paid: number; remaining: number; isFullyPaid: boolean; isOverdue: boolean })[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        vatRate: vatRate.toString(),
    });
    
    if (filters.searchTerm) queryParams.append('searchTerm', filters.searchTerm);
    if (filters.statusFilter) queryParams.append('statusFilter', filters.statusFilter);
    
    return apiRequest<any>(`/finance/debts/paginated?${queryParams}`);
}

export async function createDebt(debt: Debt): Promise<Debt> {
    return apiRequest<Debt>('/finance/debts', {
        method: 'POST',
        body: JSON.stringify(debt),
    });
}

export async function updateDebt(debt: Debt): Promise<Debt> {
    return apiRequest<Debt>(`/finance/debts/${debt.id}`, {
        method: 'PUT',
        body: JSON.stringify(debt),
    });
}

export async function deleteDebt(debtId: string): Promise<void> {
    return apiRequest<void>(`/finance/debts/${debtId}`, {
        method: 'DELETE',
    });
}

// ==================== RECEIVABLES ====================
export async function getReceivables(): Promise<Receivable[]> {
    return apiRequest<Receivable[]>('/finance/receivables');
}

export async function getReceivablesPaginated(
    filters: {
        searchTerm?: string;
        statusFilter?: 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID';
    } = {},
    page: number = 1,
    limit: number = 50,
    vatRate: number = 0
): Promise<{
    receivables: (Receivable & { gross: number; collected: number; remaining: number; isFullyPaid: boolean; isOverdue: boolean })[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        vatRate: vatRate.toString(),
    });
    
    if (filters.searchTerm) queryParams.append('searchTerm', filters.searchTerm);
    if (filters.statusFilter) queryParams.append('statusFilter', filters.statusFilter);
    
    return apiRequest<any>(`/finance/receivables/paginated?${queryParams}`);
}

export async function createReceivable(receivable: Receivable): Promise<Receivable> {
    return apiRequest<Receivable>('/finance/receivables', {
        method: 'POST',
        body: JSON.stringify(receivable),
    });
}

export async function updateReceivable(receivable: Receivable): Promise<Receivable> {
    return apiRequest<Receivable>(`/finance/receivables/${receivable.id}`, {
        method: 'PUT',
        body: JSON.stringify(receivable),
    });
}

export async function deleteReceivable(receivableId: string): Promise<void> {
    return apiRequest<void>(`/finance/receivables/${receivableId}`, {
        method: 'DELETE',
    });
}

// Checks paginated
export async function getChecksPaginated(
    filters: {
        tab?: 'INCOMING' | 'OUTGOING';
        smartFilter?: 'ACTIVE' | 'URGENT' | 'ARCHIVE' | 'ALL';
        searchQuery?: string;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    checks: any[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    stats: {
        pending: number;
        bounced: number;
        overdue: number;
        filteredTotal: number;
    };
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
    });
    
    if (filters.tab) queryParams.append('tab', filters.tab);
    if (filters.smartFilter) queryParams.append('smartFilter', filters.smartFilter);
    if (filters.searchQuery) queryParams.append('searchQuery', filters.searchQuery);
    
    return apiRequest<any>(`/finance/checks/paginated?${queryParams}`);
}

// ==================== EQUITY ====================
export async function getEquity(): Promise<EquityInvestment[]> {
    return apiRequest<EquityInvestment[]>('/finance/equity');
}

export async function createEquity(equity: EquityInvestment): Promise<EquityInvestment> {
    return apiRequest<EquityInvestment>('/finance/equity', {
        method: 'POST',
        body: JSON.stringify(equity),
    });
}

export async function updateEquity(equity: EquityInvestment): Promise<EquityInvestment> {
    return apiRequest<EquityInvestment>(`/finance/equity/${equity.id}`, {
        method: 'PUT',
        body: JSON.stringify(equity),
    });
}

export async function deleteEquity(equityId: string): Promise<void> {
    return apiRequest<void>(`/finance/equity/${equityId}`, {
        method: 'DELETE',
    });
}

// ==================== ATTENDANCE RECORDS ====================
export async function getAttendanceRecords(): Promise<AttendanceRecord[]> {
    return apiRequest<AttendanceRecord[]>('/attendance');
}

export async function getAttendanceRecordsPaginated(
    filters: {
        employeeId?: string;
        month?: number;
        year?: number;
        dateStart?: string;
        dateEnd?: string;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    records: AttendanceRecord[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
    });
    
    if (filters.employeeId) queryParams.append('employeeId', filters.employeeId);
    if (filters.month) queryParams.append('month', filters.month.toString());
    if (filters.year) queryParams.append('year', filters.year.toString());
    if (filters.dateStart) queryParams.append('dateStart', filters.dateStart);
    if (filters.dateEnd) queryParams.append('dateEnd', filters.dateEnd);
    
    return apiRequest<any>(`/attendance/paginated?${queryParams}`);
}

export async function createAttendanceRecord(record: AttendanceRecord): Promise<AttendanceRecord> {
    return apiRequest<AttendanceRecord>('/attendance', {
        method: 'POST',
        body: JSON.stringify(record),
    });
}

export async function updateAttendanceRecord(record: AttendanceRecord): Promise<AttendanceRecord> {
    return apiRequest<AttendanceRecord>(`/attendance/${record.id}`, {
        method: 'PUT',
        body: JSON.stringify(record),
    });
}

export async function clockIn(employeeId: string, isWFH: boolean = false): Promise<AttendanceRecord> {
    return apiRequest<AttendanceRecord>('/attendance/clock-in', {
        method: 'POST',
        body: JSON.stringify({ employeeId, isWFH }),
    });
}

export async function clockOut(recordId: string): Promise<AttendanceRecord> {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/mongoService.ts:clockOut',message:'Frontend clockOut called',data:{recordId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    try {
        const result = await apiRequest<AttendanceRecord>('/attendance/clock-out', {
            method: 'POST',
            body: JSON.stringify({ recordId }),
        });
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/mongoService.ts:clockOut',message:'Frontend clockOut success',data:{recordId,resultId:result?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return result;
    } catch (error: any) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/mongoService.ts:clockOut:catch',message:'Frontend clockOut error',data:{recordId,errorMessage:error?.message,errorString:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        throw error;
    }
}

export async function deleteAttendanceRecord(recordId: string): Promise<void> {
    return apiRequest<void>(`/attendance/${recordId}`, {
        method: 'DELETE',
    });
}

// ==================== MANUAL EVENTS ====================
export async function getManualEvents(): Promise<ManualEvent[]> {
    return apiRequest<ManualEvent[]>('/manual-events');
}

export async function createManualEvent(event: ManualEvent): Promise<ManualEvent> {
    return apiRequest<ManualEvent>('/manual-events', {
        method: 'POST',
        body: JSON.stringify(event),
    });
}

export async function deleteManualEvent(eventId: string): Promise<void> {
    return apiRequest<void>(`/manual-events/${eventId}`, {
        method: 'DELETE',
    });
}

// ==================== CALL LOGS ====================
export async function getCallLogs(): Promise<CallLog[]> {
    return apiRequest<CallLog[]>('/call-logs');
}

export interface SyncCallLogsResult {
    success: boolean;
    fetched: number;
    saved: number;
    skipped: number;
    message: string;
}

export async function syncCallLogs(startDate: string, endDate: string, number?: string): Promise<SyncCallLogsResult> {
    return apiRequest<SyncCallLogsResult>('/call-logs/sync', {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate, number }),
    });
}

// ==================== SETTINGS ====================
export interface Settings {
    vatRate: number;
    monthlyGoal: number;
    systemMessage: string;
    payrollOverrides: Record<string, { finalGross?: number; finalEmployerCost?: number }>;
}

export async function getSettings(): Promise<Settings> {
    return apiRequest<Settings>('/settings');
}

export async function updateSettings(settings: Settings, userId?: string, reason?: string): Promise<Settings> {
    return apiRequest<Settings>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings, userId, reason }),
    });
}
