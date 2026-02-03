
import React, { useState, useRef, useEffect } from 'react';
import { OrderStatusConfiguration, Employee, AttendanceRecord, Order } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, LockIcon, SettingsIcon } from './icons';
import Modal from './Modal';
import EmployeesPage from './EmployeesPage';
import VatSettingsSection from './VatSettingsSection';
import TipTapEditor from './TipTapEditor';
import LogsAndAuditTab from './LogsAndAuditTab';

interface SettingsPageProps {
    statusConfigs: OrderStatusConfiguration[];
    setStatusConfigs: React.Dispatch<React.SetStateAction<OrderStatusConfiguration[]>>;
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
    employees: Employee[];
    setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
    vatRate: number;
    setVatRate: (rate: number, reason?: string) => Promise<void>;
    systemMessage: string;
    setSystemMessage: (message: string) => Promise<void>;
    attendanceRecords: AttendanceRecord[];
    setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
    orders: Order[];
    vatRateHistory?: any[];
    onNavigateToOrder?: (orderId: string) => void;
}

const StatusForm: React.FC<{
    config: OrderStatusConfiguration | null;
    statusConfigs: OrderStatusConfiguration[];
    onSave: (config: OrderStatusConfiguration) => void;
    onCancel: () => void;
}> = ({ config, statusConfigs, onSave, onCancel }) => {
    const [formData, setFormData] = useState<Omit<OrderStatusConfiguration, 'id' | 'orderIndex'>>({
        label: config?.label || '',
        color: config?.color || 'bg-slate-100 text-slate-800',
        isActiveDeal: config?.isActiveDeal ?? false,
        isLead: config?.isLead ?? false,
        isQuote: config?.isQuote ?? false,
        isCompleted: config?.isCompleted ?? false,
        isLost: config?.isLost ?? false,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        
        let newFormData = { ...formData, [name]: val };

        // Logic: If 'isCompleted' is set to true, 'isActiveDeal' must also be true.
        if (name === 'isCompleted' && val === true) {
            newFormData.isActiveDeal = true;
        }
        
        // Logic: If 'isLost' is set to true, 'isActiveDeal' must be false.
        if (name === 'isLost' && val === true) {
            newFormData.isActiveDeal = false;
            newFormData.isCompleted = false;
            newFormData.isQuote = false;
            newFormData.isLead = false;
        }

        setFormData(newFormData);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: config?.id || `st_${Date.now()}`,
            orderIndex: config?.orderIndex || 999,
            isSystem: config?.isSystem, 
            ...formData,
        });
    };

    // Validation: Cannot remove 'isLead' if it's the only one
    const isOnlyLead = config?.isLead && statusConfigs.filter(c => c.isLead).length <= 1;

    return (
        <form onSubmit={handleSubmit} className="space-y-6 text-start">
            <div>
                <label className="block text-sm font-medium text-slate-700">שם הסטטוס</label>
                <input
                    type="text"
                    name="label"
                    value={formData.label}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                    required
                />
                <p className="text-xs text-slate-400 mt-1">שם הסטטוס כפי שיופיע במערכת. שינוי השם לא יפגע בלוגיקה.</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700">צבע תצוגה</label>
                <select
                    name="color"
                    value={formData.color}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                >
                    <option value="bg-slate-100 text-slate-800">אפור (רגיל)</option>
                    <option value="bg-blue-100 text-blue-800">כחול (ליד)</option>
                    <option value="bg-purple-100 text-purple-800">סגול (הצעה)</option>
                    <option value="bg-yellow-100 text-yellow-800">צהוב (בתהליך)</option>
                    <option value="bg-orange-100 text-orange-800">כתום (ביצוע)</option>
                    <option value="bg-cyan-100 text-cyan-800">טורקיז (מוכן)</option>
                    <option value="bg-green-100 text-green-800">ירוק (סופק)</option>
                    <option value="bg-emerald-100 text-emerald-800">ירוק כהה (גבייה)</option>
                    <option value="bg-red-100 text-red-800">אדום (שגיאה/ביטול)</option>
                </select>
                <div className={`mt-2 px-3 py-1 rounded inline-block text-sm font-medium ${formData.color}`}>
                    תצוגה מקדימה
                </div>
            </div>

            <div className="space-y-6 pt-4 border-t border-slate-100">
                {/* Lead Flag - Unique */}
                <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                    <div className="flex items-center">
                        <input
                            id="isLead"
                            name="isLead"
                            type="checkbox"
                            checked={formData.isLead}
                            onChange={handleChange}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2 disabled:opacity-50"
                            disabled={isOnlyLead && formData.isLead} 
                        />
                        <label htmlFor="isLead" className="block text-sm font-bold text-blue-800">
                            נחשב כליד חדש? (נקודת התחלה)
                        </label>
                    </div>
                    <p className="text-xs text-blue-600 mt-1 ms-6">
                        חייב להיות סטטוס אחד בדיוק המסומן כליד. הזמנות חדשות יקבלו סטטוס זה אוטומטית. סימון סטטוס זה יבטל את הסימון מהסטטוס הקודם.
                    </p>
                </div>

                {/* Active Deal Flag */}
                <div>
                    <div className="flex items-center">
                        <input
                            id="isActiveDeal"
                            name="isActiveDeal"
                            type="checkbox"
                            checked={formData.isActiveDeal}
                            onChange={handleChange}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={formData.isCompleted || formData.isLost} 
                        />
                        <label htmlFor="isActiveDeal" className={`block text-sm font-medium ${formData.isCompleted || formData.isLost ? 'text-slate-400' : 'text-slate-700'}`}>
                            נחשב כעסקה פעילה?
                            {formData.isCompleted && <span className="text-xs ms-2 text-green-600 font-bold">(חובה)</span>}
                        </label>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ms-6">
                        האם הזמנות בסטטוס זה נחשבות חלק מהמחזור העסקי (WIP/הכנסות)? הזמנות שאינן פעילות לא ייכללו בסיכומי כספים ודוחות.
                    </p>
                </div>
                
                {/* Completed Deal Flag */}
                <div>
                    <div className="flex items-center">
                        <input
                            id="isCompleted"
                            name="isCompleted"
                            type="checkbox"
                            checked={formData.isCompleted}
                            onChange={handleChange}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={formData.isLost}
                        />
                        <label htmlFor="isCompleted" className={`block text-sm font-medium ${formData.isLost ? 'text-slate-400' : 'text-slate-700'}`}>
                            עסקה שהסתיימה בהצלחה?
                        </label>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ms-6">
                        האם סטטוס זה מסמן סיום מוצלח של התהליך (ארכיון). הזמנות אלו יוסתרו כברירת מחדל ממסך ההזמנות.
                    </p>
                </div>

                {/* Quote Flag - Unique */}
                <div>
                    <div className="flex items-center">
                        <input
                            id="isQuote"
                            name="isQuote"
                            type="checkbox"
                            checked={formData.isQuote}
                            onChange={handleChange}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={formData.isLost}
                        />
                        <label htmlFor="isQuote" className="block text-sm font-medium text-slate-700">
                            נחשב כהצעת מחיר?
                        </label>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ms-6">
                        האם סטטוס זה מייצג שלב של המתנה לאישור הלקוח? משפיע על ספירת "הצעות מחיר" בלוח הבקרה.
                    </p>
                </div>

                {/* Lost Flag */}
                <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="flex items-center">
                        <input
                            id="isLost"
                            name="isLost"
                            type="checkbox"
                            checked={formData.isLost}
                            onChange={handleChange}
                            className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500 me-2"
                        />
                        <label htmlFor="isLost" className="block text-sm font-bold text-red-800">
                            נחשב כהפסד? (Lost)
                        </label>
                    </div>
                    <p className="text-xs text-red-600 mt-1 ms-6">
                        סימון סטטוס זה כ"הפסד" יסיר את העסקה מחישובי ההכנסות הרגילים, אך יציג אותה תחת מדד "עסקאות אבודות".
                    </p>
                </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמירה</button>
            </div>
        </form>
    );
};

const SettingsPage: React.FC<SettingsPageProps> = ({ 
    statusConfigs, 
    setStatusConfigs, 
    addActivity, 
    employees, 
    setEmployees, 
    vatRate, 
    setVatRate, 
    systemMessage, 
    setSystemMessage,
    attendanceRecords,
    setAttendanceRecords,
    orders,
    vatRateHistory,
    onNavigateToOrder
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<OrderStatusConfiguration | null>(null);
    const [activeTab, setActiveTab] = useState<'statuses' | 'employees' | 'general' | 'logs'>('statuses');
    const [localSystemMessage, setLocalSystemMessage] = useState(systemMessage);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // Update local state when prop changes
    useEffect(() => {
        setLocalSystemMessage(systemMessage);
    }, [systemMessage]);

    const handleAdd = () => {
        setEditingConfig(null);
        setIsModalOpen(true);
    };

    const handleEdit = (config: OrderStatusConfiguration) => {
        setEditingConfig(config);
        setIsModalOpen(true);
    };

    const handleDelete = (id: string) => {
        const config = statusConfigs.find(c => c.id === id);
        if (config?.isLead) {
            alert("לא ניתן למחוק סטטוס שמוגדר כ'ליד'. הגדר סטטוס אחר כליד לפני המחיקה.");
            return;
        }
        if (window.confirm(`האם אתה בטוח שברצונך למחוק את הסטטוס "${config?.label}"?`)) {
            setStatusConfigs(prev => prev.filter(c => c.id !== id));
            addActivity(`סטטוס נמחק: ${config?.label}`, { entityType: 'settings', action: 'delete', metadata: { label: config?.label, configId: id } });
        }
    };

    const handleSave = (config: OrderStatusConfiguration) => {
        setStatusConfigs(prev => {
            let nextConfigs = [...prev];
            
            // Uniqueness Logic for Lead
            if (config.isLead) {
                nextConfigs = nextConfigs.map(c => c.id !== config.id ? { ...c, isLead: false } : c);
            }
            
            // Uniqueness Logic for Quote
            if (config.isQuote) {
                nextConfigs = nextConfigs.map(c => c.id !== config.id ? { ...c, isQuote: false } : c);
            }

            if (editingConfig) {
                nextConfigs = nextConfigs.map(c => c.id === config.id ? config : c);
                addActivity(`הגדרות סטטוס עודכנו: ${config.label}`, { entityType: 'settings', action: 'update', metadata: { label: config.label, configId: config.id } });
            } else {
                const maxIndex = Math.max(...nextConfigs.map(c => c.orderIndex), 0);
                config.orderIndex = maxIndex + 1;
                nextConfigs.push(config);
                addActivity(`סטטוס חדש נוסף: ${config.label}`, { entityType: 'settings', action: 'create', metadata: { label: config.label, configId: config.id } });
            }
            
            return nextConfigs;
        });
        setIsModalOpen(false);
    };

    const moveStatus = (index: number, direction: 'up' | 'down') => {
        const newConfigs = [...statusConfigs];
        if (direction === 'up' && index > 0) {
            [newConfigs[index], newConfigs[index - 1]] = [newConfigs[index - 1], newConfigs[index]];
        } else if (direction === 'down' && index < newConfigs.length - 1) {
            [newConfigs[index], newConfigs[index + 1]] = [newConfigs[index + 1], newConfigs[index]];
        }
        
        // Re-assign indexes
        newConfigs.forEach((c, i) => c.orderIndex = i + 1);
        setStatusConfigs(newConfigs);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-800">הגדרות מערכת</h2>
            
            <div className="bg-white p-1 rounded-lg shadow-sm border border-slate-200 inline-flex mb-4">
                 <button
                    onClick={() => setActiveTab('statuses')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'statuses' ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    ניהול סטטוסים
                </button>
                <button
                    onClick={() => setActiveTab('employees')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'employees' ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    ניהול עובדים
                </button>
                <button
                    onClick={() => setActiveTab('general')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'general' ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    כללי
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'logs' ? 'bg-primary text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    לוגים ותיעוד
                </button>
            </div>

            {activeTab === 'statuses' && (
                <>
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">ניהול סטטוסים</h3>
                            <p className="text-slate-500 text-sm">ניהול סטטוסים ותהליכי עבודה (מבוסס דגלים)</p>
                        </div>
                        <button onClick={handleAdd} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                            <PlusIcon className="h-5 w-5 me-2" />
                            הוסף סטטוס
                        </button>
                    </div>

                    <div className="bg-white shadow-md rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200 text-start">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סדר</th>
                                    <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">שם הסטטוס</th>
                                    <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סוג</th>
                                    <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תצוגה</th>
                                    <th className="relative px-6 py-3"><span className="sr-only">פעולות</span></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {statusConfigs.map((config, index) => (
                                    <tr key={config.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                            <div className="flex flex-col gap-1">
                                                <button onClick={() => moveStatus(index, 'up')} disabled={index === 0} className="text-slate-400 hover:text-primary disabled:opacity-30">▲</button>
                                                <button onClick={() => moveStatus(index, 'down')} disabled={index === statusConfigs.length - 1} className="text-slate-400 hover:text-primary disabled:opacity-30">▼</button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                                            {config.label}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm space-y-1">
                                            {config.isLost ? (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                    הפסד (Lost)
                                                </span>
                                            ) : config.isActiveDeal ? (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                    עסקה פעילה
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                                    לא עסקה / הצעה
                                                </span>
                                            )}
                                            {config.isCompleted && (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-50 text-green-700 border border-green-200 block w-fit">
                                                    הסתיים בהצלחה
                                                </span>
                                            )}
                                            {config.isLead && (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-600 text-white block w-fit shadow-sm">
                                                    סטטוס פתיחה (ליד)
                                                </span>
                                            )}
                                            {config.isQuote && (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800 block w-fit">
                                                    נחשב הצעה
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${config.color}`}>
                                                {config.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium space-x-2 space-x-reverse">
                                            <button onClick={() => handleEdit(config)} className="text-primary hover:text-indigo-900 p-1"><EditIcon className="h-5 w-5"/></button>
                                            <button onClick={() => handleDelete(config.id)} className="text-red-600 hover:text-red-900 p-1"><DeleteIcon className="h-5 w-5"/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'employees' && (
                <>
                     <div className="mb-4">
                        <h3 className="text-lg font-bold text-slate-800">ניהול עובדים</h3>
                        <p className="text-slate-500 text-sm">הוספה ועריכה של משתמשי מערכת ואנשי צוות</p>
                     </div>
                     <EmployeesPage 
                        employees={employees} 
                        setEmployees={setEmployees} 
                        addActivity={addActivity}
                        attendanceRecords={attendanceRecords}
                        setAttendanceRecords={setAttendanceRecords}
                     />
                </>
            )}

            {activeTab === 'logs' && (
                <>
                    <div className="mb-4">
                        <h3 className="text-lg font-bold text-slate-800">לוגים ותיעוד פעולות</h3>
                        <p className="text-slate-500 text-sm">תיעוד כל הפעולות והשינויים במערכת עם סינון וייצוא</p>
                    </div>
                    <LogsAndAuditTab employees={employees} onNavigateToOrder={onNavigateToOrder} />
                </>
            )}

            {activeTab === 'general' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <VatSettingsSection
                        vatRate={vatRate}
                        onVatRateChange={setVatRate}
                        orders={orders}
                        vatRateHistory={vatRateHistory}
                    />

                    <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">הודעות מערכת</h3>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">טקסט הודעה ללוח הבקרה</label>
                            <TipTapEditor
                                value={localSystemMessage}
                                onChange={(newValue) => {
                                    setLocalSystemMessage(newValue);
                                    if (saveTimeoutRef.current) {
                                        clearTimeout(saveTimeoutRef.current);
                                    }
                                    saveTimeoutRef.current = setTimeout(async () => {
                                        try {
                                            await setSystemMessage(newValue);
                                            console.log('System message saved successfully');
                                        } catch (err) {
                                            console.error('Error saving system message:', err);
                                            alert('שגיאה בשמירת הודעת המערכת. נסה שוב.');
                                        }
                                    }, 1000);
                                }}
                                onBlur={async () => {
                                    if (saveTimeoutRef.current) {
                                        clearTimeout(saveTimeoutRef.current);
                                    }
                                    if (localSystemMessage !== systemMessage) {
                                        try {
                                            await setSystemMessage(localSystemMessage);
                                            console.log('System message saved on blur');
                                        } catch (err) {
                                            console.error('Error saving system message:', err);
                                            alert('שגיאה בשמירת הודעת המערכת. נסה שוב.');
                                        }
                                    }
                                }}
                                placeholder="הזן כאן הודעה שתופיע לכל המשתמשים בראש לוח הבקרה..."
                                dir="rtl"
                                className="mb-1"
                            />
                            <p className="text-xs text-slate-500 mt-1">ההודעה תישמר אוטומטית. ניתן להשתמש במודגש, נטוי, רשימות, כותרות וקישורים.</p>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <Modal title={editingConfig ? "עריכת סטטוס" : "הוספת סטטוס"} onClose={() => setIsModalOpen(false)}>
                    <StatusForm config={editingConfig} statusConfigs={statusConfigs} onSave={handleSave} onCancel={() => setIsModalOpen(false)} />
                </Modal>
            )}
        </div>
    );
};

export default SettingsPage;
