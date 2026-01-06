import React, { useState } from 'react';
import Modal from './Modal';
import * as authService from '../services/authService';

interface ResetPasswordModalProps {
    onClose: () => void;
    onSuccess?: () => void;
    employeeId?: string; // For admin reset mode
    employeeName?: string; // For admin reset mode
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ onClose, onSuccess, employeeId, employeeName }) => {
    const [step, setStep] = useState<'request' | 'confirm'>(employeeId ? 'confirm' : 'request');
    const [username, setUsername] = useState('');
    const [token, setToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [resetToken, setResetToken] = useState<string | null>(null);

    // Check if in admin mode
    const isAdminMode = !!employeeId;

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const response = await authService.requestPasswordReset(username);
            // In development, token is returned for testing
            if (response.token) {
                setResetToken(response.token);
            }
            setStep('confirm');
        } catch (err: any) {
            setError(err.message || 'שגיאה בבקשת איפוס סיסמה');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmPassword) {
            setError('הסיסמאות לא תואמות');
            return;
        }

        if (newPassword.length < 6) {
            setError('סיסמה חייבת להכיל לפחות 6 תווים');
            return;
        }

        setIsLoading(true);

        try {
            if (employeeId) {
                // Admin reset mode - reset password directly
                await authService.adminResetPassword(employeeId, newPassword);
                alert(`סיסמה עודכנה בהצלחה עבור ${employeeName || 'העובד'}!`);
                onSuccess?.();
                onClose();
            } else {
                // User reset mode - use token
                const tokenToUse = resetToken || token;
                if (!tokenToUse) {
                    setError('טוקן איפוס נדרש');
                    return;
                }

                await authService.resetPassword(tokenToUse, newPassword);
                alert('סיסמה עודכנה בהצלחה! ניתן להתחבר עם הסיסמה החדשה.');
                onSuccess?.();
                onClose();
            }
        } catch (err: any) {
            setError(err.message || 'שגיאה באיפוס סיסמה');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal title={isAdminMode ? `איפוס סיסמה - ${employeeName || 'עובד'}` : (step === 'request' ? 'איפוס סיסמה' : 'הגדר סיסמה חדשה')} onClose={onClose} size="lg">
            {step === 'request' && !isAdminMode ? (
                <form onSubmit={handleRequestReset} className="space-y-4 text-start">
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
                        <p className="text-sm text-blue-800">
                            הזן את שם המשתמש שלך. נשלח לך קישור לאיפוס הסיסמה.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                            <p className="text-sm text-red-800 font-bold">{error}</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            שם משתמש
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="הזן שם משתמש"
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-bold"
                            disabled={isLoading}
                        >
                            ביטול
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold disabled:opacity-50"
                            disabled={isLoading}
                        >
                            {isLoading ? 'שולח...' : 'שלח קישור איפוס'}
                        </button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleConfirmReset} className="space-y-4 text-start">
                    {!isAdminMode && (
                        <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-4">
                            <p className="text-sm text-green-800">
                                {resetToken 
                                    ? 'קיבלת טוקן איפוס. הזן סיסמה חדשה.'
                                    : 'הזן את טוקן האיפוס שקיבלת ואת הסיסמה החדשה.'}
                            </p>
                        </div>
                    )}
                    {isAdminMode && (
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
                            <p className="text-sm text-blue-800">
                                הגדר סיסמה חדשה עבור {employeeName || 'העובד'}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                            <p className="text-sm text-red-800 font-bold">{error}</p>
                        </div>
                    )}

                    {!resetToken && !isAdminMode && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                טוקן איפוס
                            </label>
                            <input
                                type="text"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="הזן טוקן איפוס"
                                required={!resetToken}
                                disabled={isLoading || !!resetToken}
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            סיסמה חדשה
                        </label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="הזן סיסמה חדשה (מינימום 6 תווים)"
                            required
                            minLength={6}
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            אישור סיסמה
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="הזן שוב את הסיסמה"
                            required
                            minLength={6}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => {
                                setStep('request');
                                setError(null);
                                setToken('');
                                setNewPassword('');
                                setConfirmPassword('');
                            }}
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-bold"
                            disabled={isLoading}
                        >
                            חזור
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold disabled:opacity-50"
                            disabled={isLoading}
                        >
                            {isLoading ? 'מעדכן...' : 'עדכן סיסמה'}
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default ResetPasswordModal;

