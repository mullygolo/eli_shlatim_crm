import dotenv from 'dotenv';
import {
    GreenInvoiceClient,
    GreenInvoiceInvoice,
    GreenInvoiceInvoiceResponse,
    CreateInvoiceRequest,
    CreateClientRequest,
    RecordPaymentRequest,
    GreenInvoiceError,
    GreenInvoiceDocumentType
} from '../types/greenInvoice.js';

dotenv.config();

const GREENINVOICE_API_KEY = process.env.GREENINVOICE_API_KEY || '';
const GREENINVOICE_API_SECRET = process.env.GREENINVOICE_API_SECRET || '';
// API URL - PHP SDK uses https://api.greeninvoice.co.il/api/v1 as base, then /documents endpoint
const GREENINVOICE_API_URL = process.env.GREENINVOICE_API_URL || 'https://api.greeninvoice.co.il/api';
const GREENINVOICE_API_V1 = 'https://api.greeninvoice.co.il/api/v1'; // Full v1 base URL (like PHP SDK)
const GREENINVOICE_API_BASE = 'https://api.greeninvoice.co.il'; // Base URL without /api
const GREENINVOICE_APP_URL = process.env.GREENINVOICE_APP_URL || 'https://app.greeninvoice.co.il';

// Cache for authentication token
let authToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Authenticate with GreenInvoice API and get access token
 */
async function authenticate(): Promise<string> {
    // Check if we have a valid cached token
    if (authToken && Date.now() < tokenExpiry * 1000) {
        return authToken;
    }

    if (!GREENINVOICE_API_KEY || !GREENINVOICE_API_SECRET) {
        throw new Error('GREENINVOICE_API_KEY and GREENINVOICE_API_SECRET must be configured');
    }

    try {
        // Try multiple authentication endpoints
        // Python SDK uses /v1/account/token with base URL https://api.greeninvoice.co.il/api
        const authEndpoints = [
            '/v1/account/token',  // Python SDK format (correct)
            '/account/token'      // Fallback
        ];
        
        let lastError: any = null;
        let response: Response | null = null;
        
        for (const endpoint of authEndpoints) {
            try {
                console.log(`Trying authentication endpoint: ${endpoint}`);
                response = await fetch(`${GREENINVOICE_API_URL}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        id: GREENINVOICE_API_KEY,
                        secret: GREENINVOICE_API_SECRET
                    })
                });

                if (response.ok) {
                    console.log(`Authentication successful with endpoint: ${endpoint}`);
                    break; // Success, exit loop
                } else {
                    const errRes = response;
                    const errorText = await errRes.text().catch(() => errRes.statusText);
                    lastError = new Error(`Authentication failed (${endpoint}): ${errorText || errRes.statusText}`);
                    console.log(`Authentication endpoint ${endpoint} failed:`, lastError.message);
                    response = null;
                }
            } catch (error: any) {
                lastError = error;
                console.log(`Authentication endpoint ${endpoint} threw error:`, error.message);
                response = null;
            }
        }
        
        if (!response || !response.ok) {
            throw lastError || new Error('Authentication failed: All endpoints failed');
        }

        const text = await response.text();
        let token: string | null =
            response.headers.get('X-Authorization-Bearer') ||
            response.headers.get('x-authorization-bearer');

        if (!token && text) {
            try {
                const data = JSON.parse(text) as { token?: string };
                token = data.token || null;
            } catch {
                /* ignore */
            }
        }

        if (!token) {
            console.error('GreenInvoice auth: no token in header or body. Body preview:', text.slice(0, 200));
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:100',message:'Authentication failed - no token',data:{responseText:text?.slice(0,200),headers:Object.fromEntries(response.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            throw new Error('Token not found in response (header X-Authorization-Bearer or body.token)');
        }

        let expiry = Math.floor(Date.now() / 1000) + 3600;
        if (text) {
            try {
                const data = JSON.parse(text) as { expiry?: number };
                if (typeof data.expiry === 'number') expiry = data.expiry;
            } catch {
                /* ignore */
            }
        }

        authToken = token;
        tokenExpiry = expiry;
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:116',message:'Authentication successful',data:{tokenLength:token?.length,tokenPreview:token?.substring(0,20),expiry},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return authToken;
    } catch (error) {
        console.error('GreenInvoice authentication error:', error);
        throw error;
    }
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const token = await authenticate();

    const fullUrl = `${GREENINVOICE_API_URL}${endpoint}`;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:132',message:'API request - before fetch',data:{fullUrl,method:options.method||'GET',endpoint,baseUrl:GREENINVOICE_API_URL,tokenLength:token?.length,hasBody:!!options.body,bodyPreview:options.body?(typeof options.body==='string'?options.body.substring(0,200):JSON.stringify(options.body).substring(0,200)):'none'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const response = await fetch(fullUrl, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:141',message:'API request - response received',data:{fullUrl,status:response.status,statusText:response.statusText,ok:response.ok,headers:Object.fromEntries(response.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!response.ok) {
        const rawText = await response.text();
        const fullUrl = `${GREENINVOICE_API_URL}${endpoint}`;
        let error: GreenInvoiceError;
        try {
            error = JSON.parse(rawText) as GreenInvoiceError;
        } catch {
            error = { status: 'error', message: rawText || response.statusText };
        }
        console.error(`[API REQUEST] GreenInvoice API error [${fullUrl}]:`, response.status, error);
        console.error('[API REQUEST] Method:', options.method || 'GET');
        console.error('[API REQUEST] Request body sent:', options.body ? (typeof options.body === 'string' ? options.body.substring(0, 500) : JSON.stringify(options.body).substring(0, 500)) : 'none');
        console.error('[API REQUEST] Full error response:', rawText);
        console.error('[API REQUEST] Response headers:', Object.fromEntries(response.headers.entries()));
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:155',message:'API request - error response',data:{fullUrl,status:response.status,statusText:response.statusText,errorMessage:error.message,rawText:rawText?.substring(0,500),errorCode:(error as any).errorCode,errorMessageFull:(error as any).errorMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        throw new Error(error.message || (error as any).error || (error as any).errorMessage || `API request failed (${response.status}): ${response.statusText}`);
    }

    return response.json() as Promise<T>;
}

/**
 * Create a new client in GreenInvoice
 */
export async function createClient(clientData: CreateClientRequest): Promise<GreenInvoiceClient> {
    try {
        console.log('Creating GreenInvoice client with data:', clientData);
        
        // Try multiple endpoint variations and request formats
        // Based on Python SDK: /v1/clients is used for creating clients
        // Since API_URL already includes /api/v1, we use /clients
        
        // Based on Python SDK: IClientDraft uses 'name' (not 'names')
        // Try both formats to be safe
        let requestBody: any = {
            name: clientData.names,  // Python SDK format
            names: clientData.names  // Old format (for backward compatibility)
        };
        
        // Add optional fields only if they have values
        if (clientData.email && clientData.email.trim()) {
            requestBody.email = clientData.email.trim();
            // Python SDK uses 'emails' as array
            requestBody.emails = [clientData.email.trim()];
        }
        if (clientData.phone && clientData.phone.trim()) {
            requestBody.phone = clientData.phone.trim();
        }
        if (clientData.address && clientData.address.trim()) {
            requestBody.address = clientData.address.trim();
        }
        
        console.log('Sending request body to /clients:', requestBody);
        
        // Try multiple endpoint variations
        // Based on Python SDK: /v1/clients is used for creating clients
        // API_URL is base URL (https://api.greeninvoice.co.il/api), so we add /v1/clients
        const endpointsToTry = [
            '/v1/clients',  // Based on Python SDK: /v1/clients
            '/clients',
            '/v1/client/add',
            '/client/add',
            '/v1/client',
            '/client',
            '/v1/clients/add',
            '/clients/add'
        ];
        
        let lastError: any = null;
        
        for (const endpoint of endpointsToTry) {
            try {
                console.log(`Trying endpoint: ${endpoint}`);
                const response = await apiRequest<{ status: string; data: GreenInvoiceClient[] }>(
                    endpoint,
                    {
                        method: 'POST',
                        body: JSON.stringify(requestBody)
                    }
                );

                if (response.status !== 'success' || !response.data || response.data.length === 0) {
                    throw new Error('Failed to create client - no data returned');
                }

                console.log(`Successfully created client using endpoint: ${endpoint}`);
                return response.data[0];
            } catch (error: any) {
                console.log(`Endpoint ${endpoint} failed:`, error.message);
                lastError = error;
                // Continue to next endpoint
            }
        }
        
        // If all endpoints failed, throw the last error with a helpful message
        throw new Error(`לא ניתן ליצור לקוח בחשבונית ירוקה דרך API. אנא צור את הלקוח "${clientData.names}" ידנית בחשבונית ירוקה, או בדוק את הגדרות ה-API. שגיאה: ${lastError?.message || 'Unknown error'}`);
    } catch (error) {
        console.error('Error creating GreenInvoice client:', error);
        throw error;
    }
}

/**
 * Get a client by ID
 */
export async function getClient(clientId: string): Promise<GreenInvoiceClient> {
    try {
        const response = await apiRequest<{ status: string; data: GreenInvoiceClient[] }>(
            `/v1/clients/${clientId}`
        );

        if (response.status !== 'success' || !response.data || response.data.length === 0) {
            throw new Error('Client not found');
        }

        return response.data[0];
    } catch (error) {
        console.error('Error getting GreenInvoice client:', error);
        throw error;
    }
}

/** Response shape from POST /clients/search */
interface ClientsSearchResponse {
    page?: number;
    pageSize?: number;
    total?: number;
    from?: number;
    to?: number;
    pages?: number;
    items?: GreenInvoiceClient[];
    data?: GreenInvoiceClient[];
}

/**
 * List all clients from GreenInvoice API.
 * Uses only POST /clients/search (confirmed working). Paginates to fetch all.
 */
export async function listClients(): Promise<GreenInvoiceClient[]> {
    const pageSize = 250;
    const all: GreenInvoiceClient[] = [];
    let page = 1;
    let total = 0;
    let pages = 1;

    try {
        do {
            const res = await apiRequest<ClientsSearchResponse>('/v1/clients/search', {
                method: 'POST',
                body: JSON.stringify({ page, pageSize })
            });
            const arr = res?.items ?? res?.data;
            if (!Array.isArray(arr)) {
                console.error('GreenInvoice listClients: unexpected response shape', { keys: res ? Object.keys(res) : [] });
                throw new Error('GreenInvoice /clients/search returned no items array');
            }
            all.push(...arr);
            total = res.total ?? all.length;
            pages = res.pages ?? (Math.ceil(total / pageSize) || 1);
            page += 1;
            if (arr.length < pageSize) break;
        } while (page <= pages && all.length < total);

        console.log(`GreenInvoice listClients: ${all.length} clients via /clients/search`);
        return all;
    } catch (error) {
        console.error('Error listing GreenInvoice clients:', error);
        throw error;
    }
}

/**
 * Update a client
 */
export async function updateClient(clientId: string, clientData: CreateClientRequest): Promise<GreenInvoiceClient> {
    try {
        const response = await apiRequest<{ status: string; data: GreenInvoiceClient[] }>(
            `/client/${clientId}`,
            {
                method: 'PUT',
                body: JSON.stringify(clientData)
            }
        );

        if (response.status !== 'success' || !response.data || response.data.length === 0) {
            throw new Error('Failed to update client');
        }

        return response.data[0];
    } catch (error) {
        console.error('Error updating GreenInvoice client:', error);
        throw error;
    }
}

/**
 * Search for a client by name or business ID
 */
export async function findClientByNameOrBusinessId(name: string, businessId?: string): Promise<GreenInvoiceClient | null> {
    try {
        const clients = await listClients();
        
        const _name = (c: GreenInvoiceClient) => (c.names || c.name || '').toLowerCase();
        if (businessId) {
            const byBusinessId = clients.find(c =>
                _name(c).includes(businessId.toLowerCase()) ||
                (c as any).business_id === businessId
            );
            if (byBusinessId) return byBusinessId;
        }

        const ln = name.toLowerCase();
        const byName = clients.find(c =>
            _name(c) === ln || _name(c).includes(ln)
        );
        
        return byName || null;
    } catch (error) {
        console.error('Error finding GreenInvoice client:', error);
        return null;
    }
}

/**
 * Create or get existing client
 */
export async function createOrGetClient(clientData: CreateClientRequest, businessId?: string): Promise<GreenInvoiceClient> {
    // First, try to find existing client
    const existing = await findClientByNameOrBusinessId(clientData.names, businessId);
    if (existing) {
        return existing;
    }

    // If not found, create new client
    return createClient(clientData);
}

/**
 * Create an invoice in GreenInvoice
 * Supports both old format (CreateInvoiceRequest) and new format (document structure from Python SDK)
 */
export async function createInvoice(invoiceData: CreateInvoiceRequest | any, documentType?: string): Promise<GreenInvoiceInvoice> {
    try {
        console.log('Creating GreenInvoice invoice with data:', invoiceData);
        
        // Verify authentication first
        let token: string;
        try {
            token = await authenticate();
            console.log('[CREATE DOCUMENT] Authentication successful, token length:', token?.length || 0);
            console.log('[CREATE DOCUMENT] Token preview:', token?.substring(0, 20) + '...');
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:388',message:'createInvoice - authentication successful',data:{tokenLength:token?.length,tokenPreview:token?.substring(0,20)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        } catch (authError: any) {
            console.error('[CREATE DOCUMENT] Authentication failed before creating invoice:', authError.message);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:393',message:'createInvoice - authentication failed',data:{error:authError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            throw new Error(`Authentication failed: ${authError.message}`);
        }
        
        // Test API connectivity by trying to list clients (this should work if API is accessible)
        try {
            const testResponse = await fetch(`${GREENINVOICE_API_URL}/v1/clients/search`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ page: 1, pageSize: 1 })
            });
            console.log(`[CREATE DOCUMENT] API connectivity test (clients): ${testResponse.status} ${testResponse.statusText}`);
            if (!testResponse.ok) {
                const testError = await testResponse.text();
                console.warn(`[CREATE DOCUMENT] API connectivity test failed: ${testError}`);
            } else {
                console.log(`[CREATE DOCUMENT] ✓ API is accessible and authentication works`);
            }
        } catch (testError: any) {
            console.warn(`[CREATE DOCUMENT] API connectivity test error:`, testError.message);
        }
        
        // Test if documents endpoint exists (try GET to see if it's accessible)
        try {
            const testDocResponse = await fetch(`${GREENINVOICE_API_URL}/v1/documents`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });
            console.log(`[CREATE DOCUMENT] Documents endpoint test (GET): ${testDocResponse.status} ${testDocResponse.statusText}`);
            if (testDocResponse.status === 405) {
                console.log(`[CREATE DOCUMENT] ✓ Documents endpoint exists but GET is not allowed (expected - need POST)`);
            } else if (testDocResponse.status === 404) {
                console.warn(`[CREATE DOCUMENT] ✗ Documents endpoint does not exist (404)`);
            } else {
                console.log(`[CREATE DOCUMENT] Documents endpoint response:`, await testDocResponse.text().catch(() => ''));
            }
        } catch (testDocError: any) {
            console.warn(`[CREATE DOCUMENT] Documents endpoint test error:`, testDocError.message);
        }
        
        // Check if this is the new document format (has 'type' and 'income' fields)
        const isNewFormat = invoiceData.type !== undefined && invoiceData.income !== undefined;
        console.log('[CREATE DOCUMENT] Document format:', isNewFormat ? 'new (type + income)' : 'old');
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:440',message:'createInvoice - document format check',data:{isNewFormat,hasType:invoiceData.type!==undefined,hasIncome:invoiceData.income!==undefined,hasClient:invoiceData.client!==undefined,hasPayment:invoiceData.payment!==undefined,dataKeys:Object.keys(invoiceData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // Try multiple endpoint variations
        // Check if this is an estimate - estimates use type 10 (PRICE_QUOTE) with /documents endpoint
        const isEstimate = documentType === 'estimate' || invoiceData.type === 10;
        
        // Based on Python SDK: /v1/documents is used for creating documents (including estimates with type 300)
        // API_URL is base URL (https://api.greeninvoice.co.il/api), so we add /v1/documents
        // Estimates use the same /documents endpoint but with type 300
        // Try endpoints in order of likelihood
        // Based on Python SDK and API docs, /v1/documents should be the correct endpoint
        // But we'll try multiple variations to be safe
        // Also try with different base URLs
        const endpointsToTry = isNewFormat 
            ? [
                '/v1/documents',           // Python SDK format: base is /api, endpoint is /v1/documents (CORRECT!)
                '/documents',              // PHP SDK format: base is /api/v1, endpoint is /documents
                '/api/v1/documents',      // Full path (if base is root)
                '/documents/create',       // With /create suffix
                '/v1/documents/create',    // With /v1 and /create
                '/v1/invoice/add',         // Alternative
                '/invoice/add',            // Without /v1
                '/v1/invoices',            // Plural
                '/invoices',               // Without /v1
                '/v1/invoice',             // Singular
                '/invoice',                 // Without /v1
                '/v1/invoices/add',        // Plural with add
                '/invoices/add'            // Without /v1
            ]
            : [
                '/v1/invoice/add',
                '/invoice/add',
                '/v1/invoices',
                '/invoices',
                '/v1/invoice',
                '/invoice',
                '/v1/invoices/add',
                '/invoices/add',
                '/v1/documents',
                '/documents'
            ];
        
        // Also try with different base URLs
        // Python SDK uses https://api.greeninvoice.co.il/api as base, then /v1/documents
        // PHP SDK uses https://api.greeninvoice.co.il/api/v1 as base, then /documents
        const baseUrlsToTry = [
            GREENINVOICE_API_V1,           // https://api.greeninvoice.co.il/api/v1 (PHP SDK format - try FIRST!)
            GREENINVOICE_API_URL,          // https://api.greeninvoice.co.il/api (Python SDK format)
            GREENINVOICE_API_BASE          // https://api.greeninvoice.co.il
        ];
        
        // For PHP SDK format (base is /api/v1), we need /documents (not /v1/documents)
        // For Python SDK format (base is /api), we need /v1/documents
        // Estimates use the same /documents endpoint with type 300
        // Adjust endpoints based on base URL
        // For draft documents (signed=false), prioritize draft-specific endpoints
        const adjustedEndpoints: { [key: string]: string[] } = {
                [GREENINVOICE_API_V1]: invoiceData.signed === false 
                    ? ['/documents/draft', '/documents']  // Try draft endpoint first for PHP SDK
                    : ['/documents'],  // PHP SDK: base is /api/v1, endpoint is /documents
                [GREENINVOICE_API_URL]: invoiceData.signed === false
                    ? ['/v1/documents/draft', '/v1/documents', '/documents']  // Try draft endpoint first for Python SDK
                    : ['/v1/documents', '/documents'],  // Python SDK: base is /api, endpoint is /v1/documents
                [GREENINVOICE_API_BASE]: invoiceData.signed === false
                    ? ['/api/v1/documents/draft', '/api/v1/documents', '/api/documents']
                    : ['/api/v1/documents', '/api/documents']
            };
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:494',message:'createInvoice - endpoints configuration',data:{baseUrlsToTry,adjustedEndpoints,endpointsToTry:endpointsToTry.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        let lastError: any = null;
        
        // Try each endpoint with each base URL
        for (const baseUrl of baseUrlsToTry) {
            // Get endpoints for this base URL (or use default list)
            const endpointsForBase = adjustedEndpoints[baseUrl] || endpointsToTry;
            
            for (const endpoint of endpointsForBase) {
                try {
                    // Skip if endpoint already includes /api and we're using base URL without /api
                    // Also skip if baseUrl already includes /v1 and endpoint starts with /v1
                    if (baseUrl === GREENINVOICE_API_BASE && endpoint.startsWith('/api/')) {
                        // This is correct - baseUrl is https://api.greeninvoice.co.il, endpoint is /api/v1/documents
                        const fullUrl = `${baseUrl}${endpoint}`;
                        console.log(`[CREATE DOCUMENT] Trying endpoint: ${endpoint} with base URL: ${baseUrl}`);
                        console.log(`[CREATE DOCUMENT] Full URL: ${fullUrl}`);
                        console.log(`[CREATE DOCUMENT] Request body preview:`, JSON.stringify(invoiceData, null, 2).substring(0, 500));
                    } else if (baseUrl.includes('/v1') && endpoint.startsWith('/v1/')) {
                        // Skip - would create /v1/v1/...
                        console.log(`[CREATE DOCUMENT] Skipping ${endpoint} with ${baseUrl} (would create /v1/v1/...)`);
                        continue;
                    } else if (baseUrl.includes('/v1') && !endpoint.startsWith('/v1/') && !endpoint.startsWith('/api/')) {
                        // baseUrl is /api/v1, endpoint is /documents - combine correctly (PHP SDK format)
                        const fullUrl = `${baseUrl}${endpoint}`;
                        console.log(`[CREATE DOCUMENT] Trying endpoint: ${endpoint} with base URL: ${baseUrl}`);
                        console.log(`[CREATE DOCUMENT] Full URL: ${fullUrl}`);
                        console.log(`[CREATE DOCUMENT] Request body preview:`, JSON.stringify(invoiceData, null, 2).substring(0, 500));
                        
                        // Log signed field specifically
                        console.log(`[CREATE DOCUMENT] SIGNED FIELD CHECK: signed=${invoiceData.signed}, type=${typeof invoiceData.signed}`);
                        if (invoiceData.signed === undefined) {
                            console.error(`[CREATE DOCUMENT] ERROR: signed field is undefined!`);
                        } else if (invoiceData.signed !== false && invoiceData.signed !== true) {
                            console.error(`[CREATE DOCUMENT] ERROR: signed field has unexpected value: ${invoiceData.signed}`);
                        }
                        
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:551',message:'createInvoice - before request (PHP SDK format)',data:{baseUrl,endpoint,fullUrl,signed:invoiceData.signed,signedType:typeof invoiceData.signed,requestBodyPreview:JSON.stringify(invoiceData).substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                        
                        // Make direct request with this base URL
                        const token = await authenticate();
                        const response = await fetch(fullUrl, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(invoiceData)
                        });
                        
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:535',message:'createInvoice - endpoint response (PHP SDK format)',data:{fullUrl,status:response.status,statusText:response.statusText,ok:response.ok,headers:Object.fromEntries(response.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                        
                        if (!response.ok) {
                            const rawText = await response.text();
                            // #region agent log
                            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:537',message:'createInvoice - endpoint error (PHP SDK format)',data:{fullUrl,status:response.status,statusText:response.statusText,rawText:rawText?.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                            // #endregion
                            throw new Error(`API request failed (${response.status}): ${rawText || response.statusText}`);
                        }
                        
                        const result = (await response.json()) as Record<string, any>;
                        
                        // Log the response to check if document was created as signed or draft
                        console.log(`[CREATE DOCUMENT] API Response - signed field: ${result.signed}, type: ${typeof result.signed}`);
                        console.log(`[CREATE DOCUMENT] API Response preview:`, JSON.stringify(result, null, 2).substring(0, 500));
                        if (result.signed !== undefined) {
                            if (invoiceData.signed === false && result.signed === true) {
                                console.error(`[CREATE DOCUMENT] ERROR: Document was created as signed=true even though we sent signed=false!`);
                                console.error(`[CREATE DOCUMENT] Request signed: ${invoiceData.signed}, Response signed: ${result.signed}`);
                            } else if (invoiceData.signed === false && result.signed === false) {
                                console.log(`[CREATE DOCUMENT] SUCCESS: Document created as draft (signed=false)`);
                            }
                        }
                        
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:582',message:'createInvoice - API response (PHP SDK format)',data:{fullUrl,status:response.status,resultSigned:result.signed,requestSigned:invoiceData.signed,resultId:result.id,resultPreview:JSON.stringify(result).substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                        
                        // Handle response (same as below)
                        let invoice: GreenInvoiceInvoice;
                        if (isEstimate) {
                            // Estimates have different response format
                            if (result.id) {
                                invoice = {
                                    id: result.id,
                                    short_code: result.short_code || result.number?.toString() || '',
                                    invoice_no: result.estimate_no || result.reference_no || result.number?.toString() || '',
                                    customer_id: typeof invoiceData.client === 'string' ? invoiceData.client : invoiceData.client?.id || '',
                                    customer_name: invoiceData.client?.name || '',
                                    payment_status: 'Not Paid', // Estimates are never paid
                                    currency: invoiceData.currency || 'ILS',
                                    sub_total: invoiceData.items?.reduce((sum: number, item: any) => sum + (parseFloat(item.rate || 0) * (item.quantity || 0)), 0) || 0,
                                    total: result.total || invoiceData.items?.reduce((sum: number, item: any) => sum + (parseFloat(item.rate || 0) * (item.quantity || 0)), 0) || 0,
                                    amount_paid: 0,
                                    outstanding_balance: 0,
                                    issue_date: invoiceData.issue_date || new Date().toISOString().split('T')[0]
                                };
                            } else if (result.status === 'success' && result.estimate) {
                                // Alternative response format
                                const est = Array.isArray(result.estimate) ? result.estimate[0] : result.estimate;
                                invoice = {
                                    id: est.id,
                                    short_code: est.short_code || '',
                                    invoice_no: est.estimate_no || est.reference_no || '',
                                    customer_id: est.customer_id || '',
                                    customer_name: est.customer_name || '',
                                    payment_status: 'Not Paid',
                                    currency: est.currency || 'ILS',
                                    sub_total: est.sub_total || 0,
                                    total: est.total || 0,
                                    amount_paid: 0,
                                    outstanding_balance: 0,
                                    issue_date: est.issue_date || new Date().toISOString().split('T')[0]
                                };
                            } else {
                                throw new Error('Failed to create estimate - no ID in response');
                            }
                        } else if (isNewFormat) {
                            if (result.id) {
                                invoice = {
                                    id: result.id,
                                    short_code: result.number?.toString() || '',
                                    invoice_no: result.number?.toString() || '',
                                    customer_id: invoiceData.client?.id || '',
                                    customer_name: invoiceData.client?.name || '',
                                    payment_status: invoiceData.payment?.length > 0 ? 'Paid' : 'Not Paid',
                                    currency: invoiceData.currency || 'ILS',
                                    sub_total: invoiceData.income?.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0) || 0,
                                    total: invoiceData.income?.reduce((sum: number, item: any) => sum + (item.price * item.quantity * (1 + (item.vatRate ?? 0))), 0) || 0,
                                    amount_paid: invoiceData.payment?.reduce((sum: number, p: any) => sum + p.price, 0) || 0,
                                    outstanding_balance: 0,
                                    issue_date: invoiceData.date || new Date().toISOString().split('T')[0]
                                };
                            } else {
                                throw new Error('Failed to create invoice - no ID in response');
                            }
                        } else {
                            if (result.status !== 'success' || !result.invoice || result.invoice.length === 0) {
                                throw new Error('Failed to create invoice - no data returned');
                            }
                            invoice = result.invoice[0];
                        }
                        
                        console.log(`Successfully created invoice using endpoint: ${endpoint} with base URL: ${baseUrl}`);
                        return invoice;
                    } else if (baseUrl === GREENINVOICE_API_URL) {
                        // Use normal apiRequest with GREENINVOICE_API_URL
                        const fullUrl = `${baseUrl}${endpoint}`;
                        console.log(`[CREATE DOCUMENT] Trying endpoint: ${endpoint} with base URL: ${baseUrl}`);
                        console.log(`[CREATE DOCUMENT] Full URL: ${fullUrl}`);
                        console.log(`[CREATE DOCUMENT] Request body preview:`, JSON.stringify(invoiceData, null, 2).substring(0, 500));
                        
                        // Log signed field specifically
                        console.log(`[CREATE DOCUMENT] SIGNED FIELD CHECK: signed=${invoiceData.signed}, type=${typeof invoiceData.signed}`);
                        if (invoiceData.signed === undefined) {
                            console.error(`[CREATE DOCUMENT] ERROR: signed field is undefined!`);
                        } else if (invoiceData.signed !== false && invoiceData.signed !== true) {
                            console.error(`[CREATE DOCUMENT] ERROR: signed field has unexpected value: ${invoiceData.signed}`);
                        }
                        
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:625',message:'createInvoice - before request (Python SDK format)',data:{baseUrl,endpoint,fullUrl,signed:invoiceData.signed,signedType:typeof invoiceData.signed,requestBodyPreview:JSON.stringify(invoiceData).substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                        
                        // Verify token before request
                        const token = await authenticate();
                        console.log(`[CREATE DOCUMENT] Token obtained, length: ${token?.length || 0}`);
                        
                        const response = await apiRequest<any>(
                            endpoint,
                            {
                                method: 'POST',
                                body: JSON.stringify(invoiceData)
                            }
                        );
                        
                        // Log the response to check if document was created as signed or draft
                        console.log(`[CREATE DOCUMENT] API Response - signed field: ${response.signed}, type: ${typeof response.signed}`);
                        console.log(`[CREATE DOCUMENT] API Response preview:`, JSON.stringify(response, null, 2).substring(0, 500));
                        if (response.signed !== undefined) {
                            if (invoiceData.signed === false && response.signed === true) {
                                console.error(`[CREATE DOCUMENT] ERROR: Document was created as signed=true even though we sent signed=false!`);
                                console.error(`[CREATE DOCUMENT] Request signed: ${invoiceData.signed}, Response signed: ${response.signed}`);
                            } else if (invoiceData.signed === false && response.signed === false) {
                                console.log(`[CREATE DOCUMENT] SUCCESS: Document created as draft (signed=false)`);
                            }
                        }
                        
                        // #region agent log
                        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:649',message:'createInvoice - API response (Python SDK format)',data:{endpoint,resultSigned:response.signed,requestSigned:invoiceData.signed,hasId:!!response.id,hasInvoice:!!response.invoice,responseKeys:Object.keys(response),resultPreview:JSON.stringify(response).substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion

                        // Handle different response formats
                        let invoice: GreenInvoiceInvoice;
                        if (isEstimate) {
                            // Estimates have different response format
                            if (response.id) {
                                invoice = {
                                    id: response.id,
                                    short_code: response.short_code || response.number?.toString() || '',
                                    invoice_no: response.estimate_no || response.reference_no || response.number?.toString() || '',
                                    customer_id: typeof invoiceData.client === 'string' ? invoiceData.client : invoiceData.client?.id || '',
                                    customer_name: invoiceData.client?.name || '',
                                    payment_status: 'Not Paid', // Estimates are never paid
                                    currency: invoiceData.currency || 'ILS',
                                    sub_total: invoiceData.items?.reduce((sum: number, item: any) => sum + (parseFloat(item.rate || 0) * (item.quantity || 0)), 0) || 0,
                                    total: response.total || invoiceData.items?.reduce((sum: number, item: any) => sum + (parseFloat(item.rate || 0) * (item.quantity || 0)), 0) || 0,
                                    amount_paid: 0,
                                    outstanding_balance: 0,
                                    issue_date: invoiceData.issue_date || new Date().toISOString().split('T')[0]
                                };
                            } else if (response.status === 'success' && response.estimate) {
                                // Alternative response format
                                const est = Array.isArray(response.estimate) ? response.estimate[0] : response.estimate;
                                invoice = {
                                    id: est.id,
                                    short_code: est.short_code || '',
                                    invoice_no: est.estimate_no || est.reference_no || '',
                                    customer_id: est.customer_id || '',
                                    customer_name: est.customer_name || '',
                                    payment_status: 'Not Paid',
                                    currency: est.currency || 'ILS',
                                    sub_total: est.sub_total || 0,
                                    total: est.total || 0,
                                    amount_paid: 0,
                                    outstanding_balance: 0,
                                    issue_date: est.issue_date || new Date().toISOString().split('T')[0]
                                };
                            } else {
                                throw new Error('Failed to create estimate - no ID in response');
                            }
                        } else if (isNewFormat) {
                            if (response.id) {
                                invoice = {
                                    id: response.id,
                                    short_code: response.number?.toString() || '',
                                    invoice_no: response.number?.toString() || '',
                                    customer_id: invoiceData.client?.id || '',
                                    customer_name: invoiceData.client?.name || '',
                                    payment_status: invoiceData.payment?.length > 0 ? 'Paid' : 'Not Paid',
                                    currency: invoiceData.currency || 'ILS',
                                    sub_total: invoiceData.income?.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0) || 0,
                                    total: invoiceData.income?.reduce((sum: number, item: any) => sum + (item.price * item.quantity * (1 + (item.vatRate ?? 0))), 0) || 0,
                                    amount_paid: invoiceData.payment?.reduce((sum: number, p: any) => sum + p.price, 0) || 0,
                                    outstanding_balance: 0,
                                    issue_date: invoiceData.date || new Date().toISOString().split('T')[0]
                                };
                            } else {
                                throw new Error('Failed to create invoice - no ID in response');
                            }
                        } else {
                            if (response.status !== 'success' || !response.invoice || response.invoice.length === 0) {
                                throw new Error('Failed to create invoice - no data returned');
                            }
                            invoice = response.invoice[0];
                        }

                        console.log(`Successfully created invoice using endpoint: ${endpoint}`);
                        return invoice;
                    }
                } catch (error: any) {
                    const statusMatch = error.message?.match(/\((\d+)\)/);
                    const status = statusMatch ? statusMatch[1] : 'unknown';
                    const errorCodeMatch = error.message?.match(/errorCode["\s:]+(\d+)/);
                    const errorCode = errorCodeMatch ? errorCodeMatch[1] : null;
                    console.log(`Invoice endpoint ${endpoint} with base ${baseUrl} failed (${status}):`, error.message);
                    // #region agent log
                    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'greenInvoiceService.ts:622',message:'createInvoice - endpoint failed',data:{baseUrl,endpoint,status,errorCode,errorMessage:error.message?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    // If endpoint returns 400 (not 404), it means the endpoint exists but there's a validation error
                    // This is better than 404 - we found the right endpoint!
                    if (status === '400' && errorCode === '2405') {
                        // Date validation error - endpoint is correct, but date is invalid
                        // Don't continue trying other endpoints, throw this specific error
                        console.error('[CREATE DOCUMENT] Endpoint found but date validation failed. Endpoint:', `${baseUrl}${endpoint}`);
                        throw new Error(`תאריך לא תקין: ${error.message}`);
                    }
                    if (!lastError || (status === '404' && !lastError.message?.includes('404'))) {
                        lastError = error;
                    }
                }
            }
        }
        
        // If all endpoints failed, provide detailed error message
        const errorMsg = lastError?.message || 'Unknown error';
        console.error('[CREATE DOCUMENT] All endpoints failed. Last error:', errorMsg);
        console.error('[CREATE DOCUMENT] Tried endpoints:', endpointsToTry);
        console.error('[CREATE DOCUMENT] Tried base URLs:', baseUrlsToTry);
        
        // Check if it's a 404 error - might mean API doesn't support document creation
        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
            throw new Error(`לא ניתן ליצור מסמך בחשבונית ירוקה דרך API. כל ה-endpoints מחזירים 404. ייתכן שה-API לא תומך ביצירת מסמכים, או שצריך הרשאות נוספות (תוכנית Best ומעלה). שגיאה: ${errorMsg}`);
        }
        
        throw new Error(`לא ניתן ליצור חשבונית בחשבונית ירוקה דרך API. שגיאה: ${errorMsg}`);
    } catch (error) {
        console.error('Error creating GreenInvoice invoice:', error);
        throw error;
    }
}

/**
 * Fetch raw document from API (for debugging / extracting view URL).
 */
export async function getDocumentRaw(documentId: string): Promise<any> {
    const raw = await apiRequest<any>(`/v1/documents/${documentId}`);
    return raw;
}

/**
 * Search for documents by order number (searches in document description)
 * The order number is embedded in the document description as [ORDER_NUMBER]
 */
export async function searchDocumentsByOrderNumber(orderNumber: string): Promise<any[]> {
    try {
        const token = await authenticate();
        
        // Try different endpoints for listing/searching documents
        const endpoints = [
            '/v1/documents',
            '/v1/incomes',
            '/documents',
            '/incomes'
        ];
        
        const searchPattern = `[${orderNumber}]`;
        const foundDocuments: any[] = [];
        
        for (const endpoint of endpoints) {
            try {
                // Try GET request first (list all documents)
                const response = await fetch(`${GREENINVOICE_API_URL}${endpoint}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = (await response.json()) as Record<string, any>;
                    let documents: any[] = [];
                    
                    // Handle different response formats
                    if (Array.isArray(data)) {
                        documents = data;
                    } else if (data.documents && Array.isArray(data.documents)) {
                        documents = data.documents;
                    } else if (data.incomes && Array.isArray(data.incomes)) {
                        documents = data.incomes;
                    } else if (data.items && Array.isArray(data.items)) {
                        documents = data.items;
                    } else if (data.data && Array.isArray(data.data)) {
                        documents = data.data;
                    }
                    
                    // Filter documents that contain the order number in description
                    const matchingDocs = documents.filter((doc: any) => {
                        const description = doc.description || doc.desc || '';
                        return description.includes(searchPattern);
                    });
                    
                    if (matchingDocs.length > 0) {
                        foundDocuments.push(...matchingDocs);
                        console.log(`[Search Documents] Found ${matchingDocs.length} documents for order ${orderNumber} via ${endpoint}`);
                        break; // Found documents, no need to try other endpoints
                    }
                }
            } catch (error: any) {
                console.log(`[Search Documents] Endpoint ${endpoint} failed:`, error.message);
                // Continue to next endpoint
            }
        }
        
        // If no documents found via listing, try POST search if available
        if (foundDocuments.length === 0) {
            const searchEndpoints = [
                '/v1/documents/search',
                '/v1/incomes/search',
                '/documents/search',
                '/incomes/search'
            ];
            
            for (const endpoint of searchEndpoints) {
                try {
                    const response = await fetch(`${GREENINVOICE_API_URL}${endpoint}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            description: searchPattern,
                            page: 1,
                            pageSize: 100
                        })
                    });
                    
                    if (response.ok) {
                        const data = (await response.json()) as Record<string, any>;
                        let documents: any[] = [];
                        
                        if (Array.isArray(data)) {
                            documents = data;
                        } else if (data.documents && Array.isArray(data.documents)) {
                            documents = data.documents;
                        } else if (data.incomes && Array.isArray(data.incomes)) {
                            documents = data.incomes;
                        } else if (data.items && Array.isArray(data.items)) {
                            documents = data.items;
                        } else if (data.data && Array.isArray(data.data)) {
                            documents = data.data;
                        }
                        
                        if (documents.length > 0) {
                            foundDocuments.push(...documents);
                            console.log(`[Search Documents] Found ${documents.length} documents for order ${orderNumber} via search ${endpoint}`);
                            break;
                        }
                    }
                } catch (error: any) {
                    console.log(`[Search Documents] Search endpoint ${endpoint} failed:`, error.message);
                }
            }
        }
        
        // Remove duplicates based on document ID
        const uniqueDocuments = foundDocuments.filter((doc, index, self) => 
            index === self.findIndex(d => d.id === doc.id)
        );
        
        console.log(`[Search Documents] Total unique documents found for order ${orderNumber}: ${uniqueDocuments.length}`);
        return uniqueDocuments;
    } catch (error) {
        console.error('Error searching documents by order number:', error);
        return [];
    }
}

/** DocumentType (API): 10=estimate, 200=delivery, 300=transaction, 305=invoice, 320=invoice_receipt, 330=refund, 400=receipt */
const TYPE_INVOICE = 305;
const TYPE_INVOICE_RECEIPT = 320;
const TYPE_REFUND = 330;
const TYPE_RECEIPT = 400;

export interface InvoiceSummaryIds {
    invoiceId?: string;
    receiptId?: string;
    creditId?: string;
}

/**
 * Invoice summary for an order: net invoiced amount (invoices − credits) from GreenInvoice docs.
 * Uses (1) search by order number and (2) stored IDs (greenInvoiceId, etc.) — מסמכים חשבונאיים מוצגים גם מזהים שמורים.
 */
export async function getInvoiceSummaryByOrderNumber(
    orderNumber: string,
    ids?: InvoiceSummaryIds
): Promise<{
    invoicedAmount: number;
    creditsAmount: number;
    netInvoiced: number;
    hasInvoices: boolean;
    hasReceipts: boolean;
}> {
    const seen = new Set<string>();
    const docs: any[] = [];

    const addDoc = (doc: any) => {
        if (!doc?.id || seen.has(doc.id)) return;
        seen.add(doc.id);
        docs.push(doc);
    };

    const search = await searchDocumentsByOrderNumber(orderNumber);
    search.forEach(addDoc);

    if (ids?.invoiceId) {
        try {
            const raw = await getDocumentRaw(ids.invoiceId);
            if (raw?.id) addDoc(raw);
        } catch {
            /* ignore */
        }
    }
    if (ids?.receiptId) {
        try {
            const raw = await getDocumentRaw(ids.receiptId);
            if (raw?.id) addDoc(raw);
        } catch {
            /* ignore */
        }
    }
    if (ids?.creditId) {
        try {
            const raw = await getDocumentRaw(ids.creditId);
            if (raw?.id) addDoc(raw);
        } catch {
            /* ignore */
        }
    }

    let invoicedAmount = 0;
    let creditsAmount = 0;
    let hasReceipts = false;
    for (const doc of docs) {
        const t = Number(doc.type);
        const amt = Number(doc.amount ?? doc.total ?? 0);
        if (t === TYPE_INVOICE || t === TYPE_INVOICE_RECEIPT) {
            invoicedAmount += amt;
        } else if (t === TYPE_REFUND) {
            creditsAmount += amt;
        } else if (t === TYPE_RECEIPT) {
            hasReceipts = true;
        }
    }
    return {
        invoicedAmount,
        creditsAmount,
        netInvoiced: Math.max(0, invoicedAmount - creditsAmount),
        hasInvoices: invoicedAmount > 0,
        hasReceipts
    };
}

/** PaymentType (API): 1 CASH, 2 CHECK, 3 CREDIT_CARD, 4 ELECTRONIC_FUND_TRANSFER, 10 PAYMENT_APP, 11 OTHER */
const PAYMENT_TYPE_TO_METHOD: Record<number, string> = {
    1: 'Cash',
    2: 'Cheque',
    3: 'Credit Card',
    4: 'Bank Transfer',
    10: 'Bit/PayBox',
    11: 'Others'
};

/**
 * Get per-payment details from a document (invoice/receipt/invoice_receipt) for sync to CRM.
 * Uses raw document `payment[]`; maps chequeNum (צ'ק), cardNum (אשראי) to reference for ניהול צ'קים.
 */
export async function getDocumentPayments(documentId: string): Promise<Array<{
    amount: number;
    date: string;
    method?: string;
    reference?: string;
}>> {
    const raw = await getDocumentRaw(documentId);
    const pay = raw?.payment;
    if (!Array.isArray(pay) || pay.length === 0) {
        return [];
    }
    const out: Array<{ amount: number; date: string; method?: string; reference?: string }> = [];
    for (const p of pay) {
        const type = Number(p.type);
        const method = PAYMENT_TYPE_TO_METHOD[type] ?? 'Others';
        let reference: string | undefined;
        if (type === 2 && p.chequeNum) {
            reference = String(p.chequeNum).trim();
        } else if (type === 3 && (p.cardNum || p.reference)) {
            reference = String(p.cardNum ?? p.reference ?? '').trim();
        } else if (p.reference) {
            reference = String(p.reference).trim();
        }
        const date = p.date ? String(p.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
        const amount = Number(p.price ?? p.amount ?? 0);
        if (amount <= 0) continue;
        out.push({ amount, date, method, reference });
    }
    return out;
}

/**
 * Get an invoice by ID
 */
export async function getInvoice(invoiceId: string): Promise<GreenInvoiceInvoice> {
    try {
        // Try multiple endpoints to get document/invoice
        const endpointsToTry = [
            `/v1/documents/${invoiceId}`,  // Python SDK format
            `/v1/invoice/${invoiceId}`,    // Alternative
            `/documents/${invoiceId}`,     // Without /v1 (if base includes /v1)
            `/invoice/${invoiceId}`         // Without /v1
        ];
        
        let lastError: any = null;
        for (const endpoint of endpointsToTry) {
            try {
                const response = await apiRequest<any>(endpoint);
                
                // If response is a document object directly (not wrapped), convert it
                if (response.id && !response.invoice) {
                    const doc = response;
                    return {
                        id: doc.id,
                        short_code: doc.number?.toString() || '',
                        invoice_no: doc.number?.toString() || '',
                        customer_id: doc.client?.id || '',
                        customer_name: doc.client?.name || '',
                        payment_status: doc.payment?.length > 0 ? 'Paid' : 'Not Paid',
                        currency: doc.currency || 'ILS',
                        sub_total: doc.amountExcludedVat || 0,
                        total: doc.amount || 0,
                        amount_paid: doc.payment?.reduce((sum: number, p: any) => sum + p.price, 0) || 0,
                        outstanding_balance: doc.amountOpened || 0,
                        issue_date: doc.documentDate || new Date().toISOString().split('T')[0]
                    };
                }
                
                // If response has invoice array
                if (response.status === 'success' && response.invoice && response.invoice.length > 0) {
                    return response.invoice[0];
                }
                
                // If response is the invoice directly
                if (response.id) {
                    return {
                        id: response.id,
                        short_code: response.number?.toString() || '',
                        invoice_no: response.number?.toString() || '',
                        customer_id: response.client?.id || '',
                        customer_name: response.client?.name || '',
                        payment_status: response.payment?.length > 0 ? 'Paid' : 'Not Paid',
                        currency: response.currency || 'ILS',
                        sub_total: response.amountExcludedVat || 0,
                        total: response.amount || 0,
                        amount_paid: response.payment?.reduce((sum: number, p: any) => sum + p.price, 0) || 0,
                        outstanding_balance: response.amountOpened || 0,
                        issue_date: response.documentDate || new Date().toISOString().split('T')[0]
                    };
                }
            } catch (error: any) {
                console.log(`getInvoice endpoint ${endpoint} failed:`, error.message);
                lastError = error;
            }
        }
        
        throw lastError || new Error('Invoice not found - all endpoints failed');
    } catch (error) {
        console.error('Error getting GreenInvoice invoice:', error);
        throw error;
    }
}

/**
 * Download PDF of a document (invoice, receipt, credit invoice).
 * GreenInvoice /download/links may return either:
 * - Raw PDF bytes (Content-Type: application/pdf), or
 * - JSON with URLs { he: "https://...", en: "https://..." } — we fetch the PDF from the URL.
 */
export async function downloadDocumentPDF(documentId: string, documentType: 'invoice' | 'receipt' | 'credit_invoice' = 'invoice'): Promise<Buffer> {
    try {
        const endpoint = `/v1/documents/${documentId}/download/links`;
        const token = await authenticate();

        const response = await fetch(`${GREENINVOICE_API_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json, application/pdf'
            }
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(`Failed to download PDF: ${errorText || response.statusText}`);
        }

        const contentType = (response.headers.get('Content-Type') || '').toLowerCase();

        if (contentType.includes('application/pdf')) {
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }

        if (contentType.includes('application/json')) {
            const json = (await response.json()) as Record<string, unknown> | null;
            const o = (typeof json === 'object' && json !== null) ? json : null;
            const pdfUrl = o ? (o.he || o.url || o.link || o.en) : null;
            const urlStr = typeof pdfUrl === 'string' ? pdfUrl.trim() : '';

            if (!urlStr || !urlStr.startsWith('http')) {
                console.error('[downloadDocumentPDF] JSON response has no PDF URL. Keys:', o ? Object.keys(o) : 'null');
                throw new Error('תגובת API לא הכילה קישור ל-PDF');
            }

            const pdfRes = await fetch(urlStr, { method: 'GET' });
            if (!pdfRes.ok) {
                throw new Error(`Failed to fetch PDF from link: ${pdfRes.status}`);
            }
            const arrayBuffer = await pdfRes.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }

        const text = await response.text();
        try {
            const json = JSON.parse(text);
            const u = json.he || json.url || json.link || json.en;
            if (typeof u === 'string' && u.trim().startsWith('http')) {
                const pdfRes = await fetch(u.trim(), { method: 'GET' });
                if (!pdfRes.ok) throw new Error(`PDF fetch failed: ${pdfRes.status}`);
                return Buffer.from(await pdfRes.arrayBuffer());
            }
        } catch (_) { /* not JSON or no URL */ }

        throw new Error('תגובת API לא זוהתה כ-PDF או כ-JSON עם קישור ל-PDF');
    } catch (error) {
        console.error('Error downloading document PDF:', error);
        throw error;
    }
}

/**
 * Record a payment for an invoice
 */
export async function recordPayment(paymentData: RecordPaymentRequest): Promise<void> {
    try {
        const response = await apiRequest<{ status: string; message?: string }>(
            '/v1/invoice/record-payment',
            {
                method: 'POST',
                body: JSON.stringify(paymentData)
            }
        );

        if (response.status !== 'success') {
            throw new Error('Failed to record payment');
        }
    } catch (error) {
        console.error('Error recording payment:', error);
        throw error;
    }
}

/**
 * Mark invoice as paid
 */
export async function markInvoiceAsPaid(invoiceId: string): Promise<void> {
    try {
        const response = await apiRequest<{ status: string; message?: string }>(
            `/v1/invoice/paid/${invoiceId}`
        );

        if (response.status !== 'success') {
            throw new Error('Failed to mark invoice as paid');
        }
    } catch (error) {
        console.error('Error marking invoice as paid:', error);
        throw error;
    }
}

/**
 * Get invoice payments from GreenInvoice
 * Note: GreenInvoice API may return payment information in the invoice object
 * or require a separate endpoint. This function extracts payment data from the invoice.
 */
export async function getInvoicePayments(invoiceId: string): Promise<Array<{
    amount: number;
    date: string;
    method?: string;
    reference?: string;
}>> {
    try {
        const invoice = await getInvoice(invoiceId);
        const payments: Array<{ amount: number; date: string; method?: string; reference?: string }> = [];
        
        // If invoice has amount_paid, create a payment record
        if (invoice.amount_paid && Number(invoice.amount_paid) > 0) {
            payments.push({
                amount: Number(invoice.amount_paid),
                date: invoice.issue_date || new Date().toISOString().split('T')[0],
                method: invoice.payment_status === 'Paid' ? 'Bank Transfer' : undefined,
                reference: invoice.invoice_no
            });
        }
        
        // Note: If GreenInvoice API provides detailed payment history,
        // we would need to parse it here. For now, we return the total paid amount.
        
        return payments;
    } catch (error) {
        console.error('Error getting invoice payments:', error);
        throw error;
    }
}

/**
 * Generate URL for opening GreenInvoice.
 * חשבונית ירוקה: אין deep link ל"הוסף חשבונית" — רק ללובי/הכנסות/ניהול שוטף.
 * תיעוד: https://app.greeninvoice.co.il/lobby | /incomes | /business
 * נפתחים "מסמכי הכנסות" (/incomes) — שם לוחצים על הפלוס הירוק ובוחרים סוג מסמך.
 */
export function generateGreenInvoiceUrl(
    documentType: GreenInvoiceDocumentType,
    data: {
        clientName?: string;
        clientId?: string;
        amount?: number;
        invoiceId?: string;
        orderNumber?: string;
        description?: string;
    }
): string {
    const baseUrl = GREENINVOICE_APP_URL;
    const params = new URLSearchParams();
    if (data.clientId) params.append('client_id', data.clientId);
    if (data.clientName) params.append('client_name', data.clientName);
    if (data.amount != null) params.append('amount', data.amount.toString());
    if (data.invoiceId) params.append('invoice_id', data.invoiceId);
    if (data.orderNumber) params.append('ref', data.orderNumber);
    if (data.description) params.append('description', data.description);
    const qs = params.toString();
    const suffix = qs ? `?${qs}` : '';
    // כולם מסמכי הכנסות — תמיד /incomes. אין /invoice/add וכו׳ בממשק.
    return `${baseUrl}/incomes${suffix}`;
}

/**
 * URL לעריכת מסמך קיים (טיוטה או שהופק) בחשבונית ירוקה.
 * /invoice/id ו-/#/invoice/id פתחו עמוד ראשי. /incomes עובד — מנסים /incomes/{id}.
 */
export function getDocumentEditUrl(
    documentType: 'invoice' | 'receipt' | 'invoice_receipt' | 'credit_invoice' | 'estimate' | 'work_order' | 'delivery_note' | 'transaction_account',
    documentId: string
): string {
    const base = GREENINVOICE_APP_URL;
    // For draft documents, try to open the document for editing
    // Based on GreenInvoice web app structure, documents can be edited at:
    // - /incomes/{id} - for income documents (invoices, receipts)
    // - /estimates/{id} - for estimates
    if (documentType === 'estimate') {
        return `${base}/estimates/${documentId}`;
    }
    return `${base}/incomes/${documentId}`;
}

/**
 * Test API connection and optionally fetch client count
 */
export async function testConnection(): Promise<boolean> {
    try {
        await authenticate();
        console.log('GreenInvoice API: authentication OK');
        return true;
    } catch (error) {
        console.error('GreenInvoice connection test failed:', error);
        return false;
    }
}

/**
 * Test connection and return client count (for debugging)
 */
export async function testConnectionWithClientCount(): Promise<{ connected: boolean; clientCount?: number; error?: string }> {
    try {
        await authenticate();
        const clients = await listClients();
        return { connected: true, clientCount: clients.length };
    } catch (error: any) {
        console.error('GreenInvoice test failed:', error);
        return { connected: false, error: error?.message || 'Unknown error' };
    }
}

/**
 * Debug: try each clients endpoint and return raw responses (for figuring out correct API path)
 */
export async function debugClientsEndpoints(): Promise<{
    authOk: boolean;
    baseUrl: string;
    tried: { endpoint: string; method: string; status: number; ok: boolean; bodyPreview: string }[];
}> {
    const baseUrl = GREENINVOICE_API_URL;
    const tried: { endpoint: string; method: string; status: number; ok: boolean; bodyPreview: string }[] = [];

    let token: string;
    try {
        token = await authenticate();
    } catch (e: any) {
        return { authOk: false, baseUrl, tried: [] };
    }

    const run = async (endpoint: string, method: 'GET' | 'POST', body?: object) => {
        const url = `${baseUrl}${endpoint}`;
        const res = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            ...(body && { body: JSON.stringify(body) })
        });
        const text = await res.text();
        let preview = text.slice(0, 200);
        if (text.length > 200) preview += '...';
        tried.push({
            endpoint,
            method,
            status: res.status,
            ok: res.ok,
            bodyPreview: preview.replace(/\n/g, ' ')
        });
    };

    await run('/clients/search', 'POST', { page: 1, pageSize: 100 });
    await run('/clients', 'GET');
    await run('/clients', 'POST', { names: 'Test Client', email: 'test@example.com' });
    await run('/client/all', 'GET');
    await run('/client/search', 'POST', { page: 1, pageSize: 100 });

    return { authOk: true, baseUrl, tried };
}
