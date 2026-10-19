import React, { useState, useMemo, useEffect } from 'react';
import { Order } from '../types';
import { useAuth } from '../contexts/AuthContext';
import Modal from './Modal';
import { ClockIcon, CashIcon } from './icons';
import { calculateOrderTotals } from '../utils/calculations';

interface VatRateHistoryEntry {
    id: string;
    oldValue: number;
    newValue: number;
    changedAt: Date;
    changedBy: string;
    reason?: string;
    affectedOrdersCount?: number;
}

interface VatSettingsSectionProps {
    vatRate: number;
    onVatRateChange: (newRate: number, reason?: string) => Promise<void>;
    orders: Order[];
    vatRateHistory?: VatRateHistoryEntry[];
}

const VatSettingsSection: React.FC<VatSettingsSectionProps> = ({
    vatRate,
    onVatRateChange,
    orders,
    vatRateHistory = []
}) => {
    const { user } = useAuth();
    const [tempVatRate, setTempVatRate] = useState(vatRate);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [changeReason, setChangeReason] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Update tempVatRate when vatRate prop changes (after save)
    React.useEffect(() => {
        setTempVatRate(vatRate);
    }, [vatRate]);

    // Debug: Log history changes
    React.useEffect(() => {
        console.log('VatSettingsSection - vatRateHistory updated:', vatRateHistory);
        console.log('VatSettingsSection - lastChange:', vatRateHistory.length > 0 ? vatRateHistory[0] : null);
    }, [vatRateHistory]);

    // Calculate how many orders currently use the system default VAT rate
    // Note: This is informational only - existing orders won't be changed
    const ordersUsingSystemDefault = useMemo(() => {
        // Count orders that don't have a specific VAT rate override (use system default)
        return orders.filter(order => 
            order.vatRate === undefined || 
            order.vatRate === null || 
            order.vatRate === vatRate
        ).length;
    }, [orders, vatRate]);

    // Get last change info
    const lastChange = vatRateHistory.length > 0 ? vatRateHistory[0] : null;

    // Note: We don't calculate impact preview for existing orders since they won't change
    // The new VAT rate will only apply to new orders created after the change

    const handleVatRateInputChange = (value: number) => {
        setTempVatRate(value);
    };

    const handleSaveClick = () => {
        if (tempVatRate === vatRate) return;
        setShowConfirmModal(true);
    };

    const handleConfirmChange = async () => {
        setIsSaving(true);
        try {
            console.log('VatSettingsSection - Saving VAT rate change:', {
                from: vatRate,
                to: tempVatRate,
                reason: changeReason,
                currentHistoryLength: vatRateHistory.length
            });
            await onVatRateChange(tempVatRate, changeReason || undefined);
            setShowConfirmModal(false);
            setChangeReason('');
            // Show history after save - wait a bit for state to update
            setTimeout(() => {
                setShowHistory(true);
                console.log('VatSettingsSection - History should be visible now, length:', vatRateHistory.length);
            }, 100);
        } catch (error) {
            console.error('Error updating VAT rate:', error);
            alert('שגיאה בעדכון אחוז מע״מ. נסה שוב.');
            // Reset on error
            setTempVatRate(vatRate);
        } finally {
            setIsSaving(false);
        }
    };

    const formatCurrency = (val: number) => 
        val.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800">הגדרות מע״מ</h3>
                <button
                    onClick={() => {
                        console.log('VatSettingsSection - Toggling history, current length:', vatRateHistory.length);
                        setShowHistory(!showHistory);
                    }}
                    className="text-xs text-slate-500 hover:text-primary font-medium flex items-center gap-1"
                >
                    <ClockIcon className="w-4 h-4" />
                    היסטוריית שינויים {vatRateHistory.length > 0 && `(${vatRateHistory.length})`}
                </button>
            </div>

            {/* Current VAT Rate Display */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                    אחוז מע״מ נוכחי (%)
                </label>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <input 
                            type="number" 
                            min="0" 
                            max="100"
                            step="0.1"
                            value={tempVatRate} 
                            onChange={(e) => handleVatRateInputChange(parseFloat(e.target.value) || 0)} 
                            className="block w-32 rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm font-bold text-lg px-4 py-2" 
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium pointer-events-none">%</span>
                    </div>
                    {tempVatRate !== vatRate && (
                        <button
                            onClick={handleSaveClick}
                            disabled={isSaving}
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'שומר...' : 'שמור שינוי'}
                        </button>
                    )}
                </div>
            </div>

            {/* Impact Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Orders Using System Default */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-2 mb-2">
                        <CashIcon className="w-5 h-5 text-blue-600" />
                        <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">הזמנות קיימות</span>
                    </div>
                    <div className="text-2xl font-black text-blue-700">{ordersUsingSystemDefault}</div>
                    <div className="text-xs text-blue-600 mt-1">הזמנות המשתמשות בערך הנוכחי ({vatRate}%)</div>
                    <div className="text-xs text-blue-500 mt-1 italic">הערה: הזמנות קיימות לא ישתנו</div>
                </div>

                {/* Last Change Info */}
                {lastChange ? (
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 mb-2">
                            <ClockIcon className="w-5 h-5 text-slate-600" />
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">שינוי אחרון</span>
                        </div>
                        <div className="text-sm font-bold text-slate-800">
                            {new Date(lastChange.changedAt).toLocaleDateString('he-IL', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">על ידי: {lastChange.changedBy}</div>
                        {lastChange.affectedOrdersCount !== undefined && (
                            <div className="text-xs text-slate-400 mt-1">
                                {lastChange.affectedOrdersCount} הזמנות הושפעו
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-center">
                        <span className="text-xs text-slate-400">אין היסטוריית שינויים</span>
                    </div>
                )}

                {/* New VAT Rate Preview */}
                {tempVatRate !== vatRate && (
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                        <div className="text-xs font-bold uppercase tracking-wider mb-2 text-indigo-700">
                            ערך חדש
                        </div>
                        <div className="text-2xl font-black text-indigo-700">
                            {tempVatRate}%
                        </div>
                        <div className="text-xs text-indigo-600 mt-1">
                            יחול על הזמנות חדשות בלבד
                        </div>
                    </div>
                )}
            </div>

            {/* Warning Message */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                        <p className="text-sm font-bold text-amber-800 mb-1">מידע חשוב</p>
                        <p className="text-xs text-amber-700 leading-relaxed">
                            שינוי אחוז מע״מ ישפיע רק על הזמנות חדשות שנוצרות מרגע השינוי:
                        </p>
                        <ul className="text-xs text-amber-700 mt-2 list-disc list-inside space-y-1">
                            <li>הזמנות חדשות שנוצרות יקבלו את אחוז המע״מ החדש ({tempVatRate}%)</li>
                            <li>הזמנות הקיימות לא ישתנו - הן נשמרות עם הערך שהיה בעת יצירתן</li>
                            <li>הזמנות עם ערך מע״מ ספציפי לא יושפעו מהשינוי</li>
                            <li>דוחות היסטוריים ימשיכו להציג את הערכים המקוריים</li>
                        </ul>
                        <p className="text-xs font-bold text-amber-800 mt-2">
                            ℹ️ השינוי יישמר בהיסטוריית השינויים לצורך תיעוד
                        </p>
                    </div>
                </div>
            </div>

            {/* History Section */}
            {showHistory && (
                <div className="mt-6 border-t border-slate-200 pt-6">
                    <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <ClockIcon className="w-4 h-4" />
                        היסטוריית שינויים ({vatRateHistory.length})
                    </h4>
                    {vatRateHistory.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <ClockIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">אין היסטוריית שינויים</p>
                            <p className="text-xs mt-1">השינויים יופיעו כאן לאחר שמירה</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                            {vatRateHistory.map((entry, idx) => (
                            <div 
                                key={entry.id} 
                                className={`p-3 rounded-lg border ${
                                    idx === 0 
                                        ? 'bg-indigo-50 border-indigo-200' 
                                        : 'bg-slate-50 border-slate-200'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-bold text-slate-800">
                                                {entry.oldValue}% → {entry.newValue}%
                                            </span>
                                            {idx === 0 && (
                                                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                                                    נוכחי
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-600">
                                            {new Date(entry.changedAt).toLocaleDateString('he-IL', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                        {entry.reason && (
                                            <div className="text-xs text-slate-500 mt-1 italic">
                                                סיבה: {entry.reason}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs font-medium text-slate-600">
                                            {entry.changedBy}
                                        </div>
                                        {entry.affectedOrdersCount !== undefined && (
                                            <div className="text-xs text-slate-400 mt-1">
                                                {entry.affectedOrdersCount} הזמנות
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        </div>
                    )}
                </div>
            )}

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <Modal 
                    title="אישור שינוי אחוז מע״מ" 
                    onClose={() => {
                        setShowConfirmModal(false);
                        setChangeReason('');
                        setTempVatRate(vatRate); // Reset to current value
                    }}
                    size="lg"
                >
                    <div className="space-y-4 text-start">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm font-bold text-blue-800 mb-2">
                                אתה עומד לשנות את אחוז המע״מ מ-{vatRate}% ל-{tempVatRate}%
                            </p>
                            <div className="text-xs text-blue-700 space-y-1">
                                <p>• השינוי יחול רק על הזמנות חדשות שנוצרות מרגע זה</p>
                                <p>• הזמנות הקיימות ({ordersUsingSystemDefault} הזמנות) לא ישתנו</p>
                                <p>• דוחות היסטוריים ימשיכו להציג את הערכים המקוריים</p>
                                <p>• השינוי יישמר בהיסטוריית השינויים לצורך תיעוד</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                סיבת השינוי (אופציונלי)
                            </label>
                            <textarea
                                value={changeReason}
                                onChange={(e) => setChangeReason(e.target.value)}
                                rows={3}
                                className="block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                                placeholder="לדוגמה: שינוי בחוק, עדכון מדיניות, תיקון שגיאה..."
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                הסיבה תישמר בהיסטוריית השינויים לצורך תיעוד
                            </p>
                        </div>

                        <div className="flex justify-end space-x-2 pt-4 space-x-reverse border-t">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    setChangeReason('');
                                    setTempVatRate(vatRate);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300"
                                disabled={isSaving}
                            >
                                ביטול
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmChange}
                                disabled={isSaving}
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? 'שומר...' : 'אשר שינוי'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default VatSettingsSection;
