import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Employee } from '../types';
import * as authService from '../services/authService';

interface AuthContextType {
    user: Omit<Employee, 'passwordHash'> | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<Omit<Employee, 'passwordHash'> | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Check if user is authenticated on mount (with timeout so we don't hang on white/loading)
    useEffect(() => {
        let cancelled = false;
        const AUTH_CHECK_TIMEOUT_MS = 8000;

        // Safety: force loading false after 10s no matter what (e.g. if Promise.race doesn't resolve)
        const forceDoneTimer = setTimeout(() => {
            if (!cancelled) setIsLoading(false);
        }, 10000);

        const checkAuth = async () => {
            try {
                if (authService.isAuthenticated()) {
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Auth check timeout')), AUTH_CHECK_TIMEOUT_MS)
                    );
                    const currentUser = await Promise.race([
                        authService.getCurrentUser(),
                        timeoutPromise,
                    ]);
                    if (!cancelled) setUser(currentUser);
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                localStorage.removeItem('authToken');
                localStorage.removeItem('rememberMe');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        checkAuth();
        return () => {
            cancelled = true;
            clearTimeout(forceDoneTimer);
        };
    }, []);

    const login = useCallback(async (username: string, password: string, rememberMe: boolean = false) => {
        try {
            const response = await authService.login(username, password, rememberMe);
            setUser(response.employee);
        } catch (error) {
            throw error;
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await authService.logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            if (authService.isAuthenticated()) {
                const currentUser = await authService.getCurrentUser();
                setUser(currentUser);
            }
        } catch (error) {
            console.error('Refresh user error:', error);
            // Token is invalid, logout
            await logout();
        }
    }, [logout]);

    const value: AuthContextType = {
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

