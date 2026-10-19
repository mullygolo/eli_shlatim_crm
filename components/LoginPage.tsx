import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ResetPasswordModal from './ResetPasswordModal';

const LoginPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const submittingRef = useRef(false);
    const { login, isAuthenticated } = useAuth();

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            window.location.href = '/';
        }
    }, [isAuthenticated]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submittingRef.current) return;
        submittingRef.current = true;
        setError(null);
        setIsLoading(true);

        try {
            await login(username, password, rememberMe);
            window.location.href = '/';
        } catch (err: any) {
            setError(err.message || 'שגיאה בהתחברות');
        } finally {
            setIsLoading(false);
            submittingRef.current = false;
        }
    };

    return (
        <>
            {showForgotPassword && (
                <ResetPasswordModal 
                    onClose={() => setShowForgotPassword(false)}
                    onSuccess={() => {
                        setShowForgotPassword(false);
                        alert('אם המשתמש קיים, נשלח קישור לאיפוס סיסמה');
                    }}
                />
            )}
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-indigo-50">
            <div className="max-w-md w-full mx-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-black text-slate-900 mb-2">ברוכים הבאים</h1>
                        <p className="text-slate-600">התחברו למערכת הניהול</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-800 font-bold">{error}</p>
                        </div>
                    )}

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="username" className="block text-sm font-bold text-slate-700 mb-2">
                                שם משתמש
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                placeholder="הזן שם משתמש"
                                required
                                autoComplete="username"
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-2">
                                סיסמה
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                placeholder="הזן סיסמה"
                                required
                                autoComplete="current-password"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="flex items-center">
                            <input
                                id="rememberMe"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                                disabled={isLoading}
                            />
                            <label htmlFor="rememberMe" className="mr-2 block text-sm text-slate-600">
                                זכור אותי
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-bold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'מתחבר...' : 'התחבר'}
                        </button>
                    </form>

                    {/* Forgot Password Link */}
                    <div className="mt-4 text-center">
                        <button
                            type="button"
                            onClick={() => setShowForgotPassword(true)}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                            disabled={isLoading}
                        >
                            שכחתי סיסמה
                        </button>
                    </div>

                    {/* Footer */}
                    <div className="mt-6 text-center">
                        <p className="text-xs text-slate-500">
                            בעיות בהתחברות? פנה למנהל המערכת
                        </p>
                    </div>
                </div>
            </div>
        </div>
        </>
    );
};

export default LoginPage;

