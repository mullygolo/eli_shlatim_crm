import { PriceListProduct, SalesHistoryEntry, AdHocProduct } from '../types';

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
        let errorMessage = response.statusText;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch (e) {
            // If JSON parse fails, use statusText
        }
        throw new Error(errorMessage);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json();
}

// Products
export async function getProducts(): Promise<PriceListProduct[]> {
    return apiRequest<PriceListProduct[]>('/price-list/products');
}

export async function getProductsPaginated(
    filters: {
        searchQuery?: string;
        categoryFilter?: string;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    products: PriceListProduct[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    categories: string[];
}> {
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
    });
    
    if (filters.searchQuery) queryParams.append('searchQuery', filters.searchQuery);
    if (filters.categoryFilter) queryParams.append('categoryFilter', filters.categoryFilter);
    
    return apiRequest<any>(`/price-list/products/paginated?${queryParams}`);
}

export async function getProduct(id: string): Promise<PriceListProduct> {
    return apiRequest<PriceListProduct>(`/price-list/products/${id}`);
}

export async function createProduct(product: PriceListProduct): Promise<PriceListProduct> {
    return apiRequest<PriceListProduct>('/price-list/products', {
        method: 'POST',
        body: JSON.stringify(product),
    });
}

export async function updateProduct(product: PriceListProduct): Promise<PriceListProduct> {
    return apiRequest<PriceListProduct>(`/price-list/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify(product),
    });
}

export async function deleteProduct(id: string): Promise<void> {
    return apiRequest<void>(`/price-list/products/${id}`, {
        method: 'DELETE',
    });
}

// CSV Import
export async function importFromCSV(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('authToken');
    const headers: HeadersInit = {};
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/price-list/import-csv`, {
        method: 'POST',
        headers,
        body: formData,
    });

    if (!response.ok) {
        let errorMessage = response.statusText;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch (e) {
            // If JSON parse fails, use statusText
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

// Sales History
export async function getSalesHistory(filters?: {
    productId?: string;
    supplierId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}): Promise<SalesHistoryEntry[]> {
    const params = new URLSearchParams();
    if (filters?.productId) params.append('productId', filters.productId);
    if (filters?.supplierId) params.append('supplierId', filters.supplierId);
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom.toISOString());
    if (filters?.dateTo) params.append('dateTo', filters.dateTo.toISOString());
    
    return apiRequest<SalesHistoryEntry[]>(`/price-list/sales-history?${params.toString()}`);
}

export async function addSalesHistoryEntry(entry: SalesHistoryEntry): Promise<SalesHistoryEntry> {
    return apiRequest<SalesHistoryEntry>('/price-list/sales-history', {
        method: 'POST',
        body: JSON.stringify(entry),
    });
}

// Ad-hoc Products
export async function getAdHocProducts(filters?: {
    orderId?: string;
    supplierId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}): Promise<AdHocProduct[]> {
    const params = new URLSearchParams();
    if (filters?.orderId) params.append('orderId', filters.orderId);
    if (filters?.supplierId) params.append('supplierId', filters.supplierId);
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom.toISOString());
    if (filters?.dateTo) params.append('dateTo', filters.dateTo.toISOString());
    
    return apiRequest<AdHocProduct[]>(`/price-list/ad-hoc-products?${params.toString()}`);
}

export async function createAdHocProduct(product: AdHocProduct): Promise<AdHocProduct> {
    return apiRequest<AdHocProduct>('/price-list/ad-hoc-products', {
        method: 'POST',
        body: JSON.stringify(product),
    });
}

// Send Email
export async function sendPriceListEmail(
    orderId: string,
    supplierIds: string[],
    emailType: 'quote' | 'order'
): Promise<any> {
    return apiRequest<any>('/price-list/send-email', {
        method: 'POST',
        body: JSON.stringify({ orderId, supplierIds, emailType }),
    });
}

// Send Quote Requests
export async function sendQuoteRequests(
    order: any,
    requests: { lineItemId: string; supplierIds: string[]; methods: { supplierId: string; method: 'EMAIL' | 'WHATSAPP' }[] }[]
): Promise<any> {
    return apiRequest<any>('/price-list/send-quote-requests', {
        method: 'POST',
        body: JSON.stringify({ order, requests }),
    });
}
