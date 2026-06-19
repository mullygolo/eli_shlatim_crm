import { Employee } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface LoginResponse {
    token: string;
    employee: Omit<Employee, 'passwordHash'>;
}

export interface AuthError {
    error: string;
}

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
        if (response.status === 401 && !endpoint.startsWith('/auth/login')) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('rememberMe');
        }
        const error: AuthError = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `API request failed: ${response.statusText}`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json();
}

/**
 * Login with username and password
 */
export async function login(username: string, password: string, rememberMe: boolean = false): Promise<LoginResponse> {
    const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, rememberMe }),
    });
    
    // Store token in localStorage
    if (response.token) {
        localStorage.setItem('authToken', response.token);
        if (rememberMe) {
            localStorage.setItem('rememberMe', 'true');
        } else {
            localStorage.removeItem('rememberMe');
        }
    }
    
    return response;
}

/**
 * Logout - clear token first so UI and any in-flight logic see "logged out",
 * then optionally notify server for audit (using the token we saved before clearing).
 */
export async function logout(): Promise<void> {
    const token = localStorage.getItem('authToken');
    // Clear storage immediately so nothing can "see" us as logged in
    try {
        localStorage.removeItem('authToken');
        localStorage.removeItem('rememberMe');
    } catch (e) {
        console.warn('localStorage clear on logout:', e);
    }
    // Optionally notify server for audit (with saved token); ignore errors
    try {
        if (token) {
            const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
            await fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });
        }
    } catch (error) {
        console.error('Logout API error (ignored):', error);
    }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<Omit<Employee, 'passwordHash'>> {
    const response = await apiRequest<{ employee: Omit<Employee, 'passwordHash'> }>('/auth/me');
    return response.employee;
}

/**
 * Check if user is authenticated (has valid token)
 */
export function isAuthenticated(): boolean {
    const token = localStorage.getItem('authToken');
    if (!token) return false;
    
    // Basic check - token exists
    // Full validation happens on server
    return true;
}

/**
 * Get stored auth token
 */
export function getAuthToken(): string | null {
    return localStorage.getItem('authToken');
}

/**
 * Request password reset
 */
export async function requestPasswordReset(username: string): Promise<{ message: string; token?: string }> {
    return apiRequest<{ message: string; token?: string }>('/auth/reset-request', {
        method: 'POST',
        body: JSON.stringify({ username }),
    });
}

/**
 * Reset password with token
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>('/auth/reset-confirm', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
    });
}


/**
 * Admin resets password for an employee
 */
export async function adminResetPassword(employeeId: string, newPassword: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>('/auth/admin-reset-password', {
        method: 'POST',
        body: JSON.stringify({ employeeId, newPassword }),
    });
}

