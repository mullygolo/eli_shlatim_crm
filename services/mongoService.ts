import {
    Customer, Order, Supplier, Employee, Activity, ActivityFilters, ActivitiesResult, OrderStatusConfiguration,
    FixedExpense, VariableExpense, Loan, Debt, Receivable, EquityInvestment,
    AttendanceRecord, ManualEvent, WallPost, CallLog, ImprovementSuggestion, ImprovementSuggestionStatus, ImprovementSuggestionType,
    PerformanceMetricsPayload, NotificationItem,
    Attachment,
    ViewEvent, ViewEventsAggregatedResult, ViewEventsRawFilters, ViewEventsRawResult,
    ViewEventsChartType, ViewEventsChartResult
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

export async function getCustomerById(customerId: string): Promise<Customer | null> {
    try {
        return await apiRequest<Customer>(`/customers/${encodeURIComponent(customerId)}`);
    } catch {
        return null;
    }
}

/** Single customer match for a phone (includes contact when match is via contact.phone). */
export type CustomerPhoneMatch = { customerId: string; customerName: string; contactId?: string; contactName?: string };

/** Match phone numbers to customers (for call center). Returns { [normalizedPhone]: CustomerPhoneMatch[] }. */
export async function matchPhones(phones: string[]): Promise<Record<string, CustomerPhoneMatch[]>> {
    if (!phones.length) return {};
    return apiRequest<Record<string, CustomerPhoneMatch[]>>('/customers/match-phones', {
        method: 'POST',
        body: JSON.stringify({ phones }),
    });
}

/** Single supplier match for a phone (includes contact when match is via contact.phone). */
export type SupplierPhoneMatch = { supplierId: string; supplierName: string; contactId?: string; contactName?: string };

/** Match phone numbers to suppliers (for call center). Returns { [normalizedPhone]: SupplierPhoneMatch[] }. */
export async function matchSupplierPhones(phones: string[]): Promise<Record<string, SupplierPhoneMatch[]>> {
    if (!phones.length) return {};
    return apiRequest<Record<string, SupplierPhoneMatch[]>>('/suppliers/match-phones', {
        method: 'POST',
        body: JSON.stringify({ phones }),
    });
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

/** Merge victim into veteran on server (orders reassigned, contacts/notes merged, victim deleted). */
export async function mergeCustomers(veteranId: string, victimId: string): Promise<Customer> {
    return apiRequest<Customer>('/customers/merge', {
        method: 'POST',
        body: JSON.stringify({ veteranId, victimId }),
    });
}

export async function getCustomersPaginated(
    filters: { searchTerm?: string },
    page: number = 1,
    limit: number = 50,
    options?: { signal?: AbortSignal }
): Promise<{ customers: Customer[]; totalCount: number; page: number; limit: number; totalPages: number }> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        filters: JSON.stringify(filters)
    });
    const response = await fetch(`${API_BASE_URL}/customers/paginated?${queryParams}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        },
        ...(options?.signal && { signal: options.signal })
    });
    if (!response.ok) throw new Error('Failed to fetch paginated customers');
    return response.json();
}

// ==================== ORDERS ====================
export async function getOrders(): Promise<Order[]> {
    return apiRequest<Order[]>('/orders');
}

export async function getOrdersPaginated(filters: any, page: number = 1, limit: number = 50, options?: { signal?: AbortSignal }): Promise<any> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        filters: JSON.stringify(filters)
    });
    const response = await fetch(`${API_BASE_URL}/orders/paginated?${queryParams}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        },
        ...(options?.signal && { signal: options.signal })
    });
    if (!response.ok) throw new Error('Failed to fetch paginated orders');
    return response.json();
}

export async function getOrderById(orderId: string): Promise<Order> {
    return apiRequest<Order>(`/orders/${orderId}`);
}

// Order lock (smart locking): get / acquire / release
export interface OrderLockStatus {
    lockedBy: { userId: string; userName: string; lockedAt?: string } | null;
}
export interface AcquireOrderLockResult {
    success: boolean;
    lockedBy?: { userId: string; userName: string };
}

export async function getOrderLock(orderId: string): Promise<OrderLockStatus> {
    return apiRequest<OrderLockStatus>(`/orders/${orderId}/lock`);
}

export async function acquireOrderLock(orderId: string, userName?: string): Promise<AcquireOrderLockResult> {
    return apiRequest<AcquireOrderLockResult>(`/orders/${orderId}/lock`, {
        method: 'POST',
        body: JSON.stringify(userName != null ? { userName } : {}),
    });
}

export async function releaseOrderLock(orderId: string): Promise<void> {
    return apiRequest<void>(`/orders/${orderId}/lock`, { method: 'DELETE' });
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
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    return apiRequest<{ created: number; updated: number; skipped: number; errors: string[] }>('/orders/import/execute', {
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

// ==================== VIEW EVENTS ====================
export async function postViewEvents(events: ViewEvent[]): Promise<void> {
    if (!events.length) return;
    await apiRequest<void>('/view-events', {
        method: 'POST',
        body: JSON.stringify({ events }),
    });
}

export async function getViewEventsAggregated(params: { from: string; to: string; userId?: string }): Promise<ViewEventsAggregatedResult> {
    const search = new URLSearchParams();
    search.set('from', params.from);
    search.set('to', params.to);
    if (params.userId) search.set('userId', params.userId);
    return apiRequest<ViewEventsAggregatedResult>(`/view-events/aggregated?${search.toString()}`);
}

export async function getViewEventsRaw(filters: ViewEventsRawFilters): Promise<ViewEventsRawResult> {
    const search = new URLSearchParams();
    if (filters.from) search.set('from', filters.from);
    if (filters.to) search.set('to', filters.to);
    if (filters.userId) search.set('userId', filters.userId);
    if (filters.entityType) search.set('entityType', filters.entityType);
    if (filters.page != null) search.set('page', String(filters.page));
    if (filters.limit != null) search.set('limit', String(filters.limit));
    return apiRequest<ViewEventsRawResult>(`/view-events/raw?${search.toString()}`);
}

export async function getViewEventsChartData(params: { from: string; to: string; userId?: string; type?: ViewEventsChartType }): Promise<ViewEventsChartResult> {
    const search = new URLSearchParams();
    search.set('from', params.from);
    search.set('to', params.to);
    if (params.userId) search.set('userId', params.userId);
    if (params.type) search.set('type', params.type);
    return apiRequest<ViewEventsChartResult>(`/view-events/chart-data?${search.toString()}`);
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

export async function getOrderCountByStatusId(statusId: string): Promise<number> {
    const res = await apiRequest<{ count: number }>(`/status-configs/${encodeURIComponent(statusId)}/order-count`);
    return res?.count ?? 0;
}

export async function transferOrdersToStatus(fromStatusId: string, toStatusId: string): Promise<{ updated: number }> {
    return apiRequest<{ updated: number }>('/status-configs/transfer', {
        method: 'POST',
        body: JSON.stringify({ fromStatusId, toStatusId }),
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

export async function getCheckAttachments(uniqueId: string): Promise<Attachment[]> {
    return apiRequest<Attachment[]>(`/finance/check-attachments/${encodeURIComponent(uniqueId)}`);
}

export async function setCheckAttachments(uniqueId: string, attachments: Attachment[]): Promise<Attachment[]> {
    return apiRequest<Attachment[]>(`/finance/check-attachments/${encodeURIComponent(uniqueId)}`, {
        method: 'PUT',
        body: JSON.stringify({ attachments }),
    });
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
    const result = await apiRequest<AttendanceRecord>('/attendance/clock-out', {
        method: 'POST',
        body: JSON.stringify({ recordId }),
    });
    return result;
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

// ==================== WALL POSTS ====================
export async function getWallPosts(): Promise<WallPost[]> {
    return apiRequest<WallPost[]>('/wall-posts');
}

export async function createWallPost(post: WallPost): Promise<WallPost> {
    return apiRequest<WallPost>('/wall-posts', {
        method: 'POST',
        body: JSON.stringify(post),
    });
}

// ==================== NOTIFICATIONS (BELL) ====================
export async function getNotifications(): Promise<NotificationItem[]> {
    const res = await apiRequest<{ notifications: NotificationItem[] }>('/notifications');
    return res.notifications;
}

export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
    await apiRequest<void>('/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ notificationIds }),
    });
}

// ==================== IMPROVEMENT SUGGESTIONS ====================
export async function getImprovementSuggestions(filters?: { type?: ImprovementSuggestionType; status?: ImprovementSuggestionStatus }): Promise<ImprovementSuggestion[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.status) params.set('status', filters.status);
    const q = params.toString();
    return apiRequest<ImprovementSuggestion[]>(`/improvement-suggestions${q ? `?${q}` : ''}`);
}

export async function createImprovementSuggestion(suggestion: ImprovementSuggestion): Promise<ImprovementSuggestion> {
    return apiRequest<ImprovementSuggestion>('/improvement-suggestions', {
        method: 'POST',
        body: JSON.stringify(suggestion),
    });
}

export async function updateImprovementSuggestion(id: string, updates: { status?: ImprovementSuggestionStatus; adminComment?: string }): Promise<ImprovementSuggestion | null> {
    return apiRequest<ImprovementSuggestion | null>(`/improvement-suggestions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
    });
}

export async function voteImprovementSuggestion(id: string, userId: string): Promise<ImprovementSuggestion | null> {
    return apiRequest<ImprovementSuggestion | null>(`/improvement-suggestions/${id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
    });
}

// ==================== CALL LOGS ====================
export async function getCallLogs(): Promise<CallLog[]> {
    return apiRequest<CallLog[]>('/call-logs');
}

export interface CallLogsPaginatedResult {
    logs: CallLog[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface CallLogsStatsResult {
    totalCalls: number;
    incomingCount: number;
    outgoingCount: number;
    unansweredCount: number;
    totalDurationSeconds: number;
    totalDurationIncoming: number;
    totalDurationOutgoing: number;
    totalDurationUnknown: number;
}

export async function getCallLogsStats(filters: { startDate?: string; endDate?: string; callee?: string } = {}): Promise<CallLogsStatsResult> {
    const params = new URLSearchParams();
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.callee) params.set('callee', filters.callee);
    return apiRequest<CallLogsStatsResult>(`/call-logs/stats?${params}`);
}

export interface CallLogsAgentItem {
    callee: string;
    calleeName?: string;
}

export async function getCallLogsAgents(filters: { startDate?: string; endDate?: string } = {}): Promise<CallLogsAgentItem[]> {
    const params = new URLSearchParams();
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    return apiRequest<CallLogsAgentItem[]>(`/call-logs/agents?${params}`);
}

export async function inferCallLogDirection(): Promise<{ updated: number }> {
    return apiRequest<{ updated: number }>('/call-logs/infer-direction', { method: 'POST' });
}

export async function getCallLogsPaginated(
    filters: { searchTerm?: string; startDate?: string; endDate?: string; callee?: string } = {},
    page: number = 1,
    limit: number = 50
): Promise<CallLogsPaginatedResult> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.searchTerm) params.set('searchTerm', filters.searchTerm);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.callee) params.set('callee', filters.callee);
    return apiRequest<CallLogsPaginatedResult>(`/call-logs/paginated?${params}`);
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

/** Fetch recent call logs for a customer (caller/callee matches customer contact phones). */
export async function getCallLogsForCustomer(customerId: string, limit: number = 20): Promise<CallLog[]> {
    return apiRequest<CallLog[]>(`/call-logs/for-customer/${encodeURIComponent(customerId)}?limit=${limit}`);
}

export type RelevantOrderSummary = { id: string; orderNumber: string; orderStatus: string };
export async function getRelevantOrdersForCustomers(customerIds: string[]): Promise<Record<string, RelevantOrderSummary[]>> {
    if (!customerIds.length) return {};
    const params = new URLSearchParams();
    customerIds.forEach(id => params.append('customerIds', id));
    return apiRequest<Record<string, RelevantOrderSummary[]>>(`/orders/relevant-for-customers?${params}`);
}

/** Fetch stored call recording as Blob (for playback). Requires auth. */
export async function getCallLogRecordingBlob(uniqueId: string): Promise<Blob> {
    const token = localStorage.getItem('authToken');
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}/call-logs/recording/${encodeURIComponent(uniqueId)}`, { headers });
    if (!response.ok) {
        const t = await response.text();
        let msg = `${response.status} ${response.statusText}`;
        try {
            const j = JSON.parse(t) as { error?: string };
            if (j.error) msg = j.error;
        } catch {
            if (t && t.length < 200) msg = t;
        }
        throw new Error(msg);
    }
    return response.blob();
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

// ==================== PERFORMANCE METRICS (ADMIN only) ====================
export async function getPerformanceMetrics(filters: {
    from?: string;
    to?: string;
    employeeId?: string;
}): Promise<PerformanceMetricsPayload> {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    const qs = params.toString();
    return apiRequest<PerformanceMetricsPayload>(`/performance-metrics${qs ? `?${qs}` : ''}`);
}
