
import React, { useState } from 'react';
import { OrderStatusConfiguration, Employee, AttendanceRecord } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, LockIcon, SettingsIcon } from './icons';
import Modal from './Modal';
import EmployeesPage from './EmployeesPage';

interface SettingsPageProps {
    statusConfigs: OrderStatusConfiguration[];
    setStatusConfigs: React.Dispatch<React.SetStateAction<OrderStatusConfiguration[]>>;
    addActivity: (description: string) => void;
    employees: Employee[];
    setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
    vatRate: number;
    setVatRate: React.Dispatch<React.SetStateAction<number>>;
    systemMessage: string;
    setSystemMessage: React.Dispatch<React.SetStateAction<string>>;
    attendanceRecords: AttendanceRecord[];
    setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
}

const StatusForm: React.FC<{
    config: OrderStatusConfiguration | null;
    onSave: (config: OrderStatusConfiguration) => void;
    onCancel: () => void;
}> = ({ config, onSave, onCancel }) => {
    const [formData, setFormData] = useState<Omit<OrderStatusConfiguration, 'id' | 'orderIndex'>>({
        label: config?.label || '',
        color: config?.color || 'bg-slate-100 text-slate-800',
        isActiveDeal: config?.isActiveDeal ?? false,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: val }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: config?.id || `st_${Date.now()}`,
            orderIndex: config?.orderIndex || 999,
            isSystem: config?.isSystem, // Preserve isSystem flag
            ...formData,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 text-start">
            <div>
                <label className="block text-sm font-medium text-slate-700">שם הסטטוס</label>
                <div className="relative">
                    <input
                        type="text"
                        name="label"
                        value={formData.label}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm disabled:bg-slate-100 disabled:text-slate-500"
                        required
                        disabled={config?.isSystem}
                    />
                    {config?.isSystem && (
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <LockIcon className="h-4 w-4 text-slate-400" />
                        </div>
                    )}
                </div>
                {config?.isSystem && (
                     <p className="text-xs text-slate-400 mt-1">זהו סטטוס מערכת, לא ניתן לשנות את שמו.</p>
                )}
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

            <div className="flex items-center">
                <input
                    id="isActiveDeal"
                    name="isActiveDeal"
                    type="checkbox"
                    checked={formData.isActiveDeal}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={config?.isSystem}
                />
                <label htmlFor="isActiveDeal" className={`block text-sm font-medium ${config?.isSystem ? 'text-slate-400' : 'text-slate-700'}`}>
                    נחשב כעסקה פעילה? (לצורך דוחות כספיים)
                    {config?.isSystem && <span className="text-xs ms-2">(מוגדר מערכת)</span>}
                </label>
            </div>
            <p className="text-xs text-slate-500">
                הזמנות בסטטוס "עסקה פעילה" יופיעו בדוחות ספקים, הכנסות, וניהול גבייה.
                הזמנות בסטטוס "לא פעיל" (כגון טיוטות, הצעות מחיר, או ביטולים) לא יחושבו בדוחות אלו.
            </p>

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
    setAttendanceRecords
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<OrderStatusConfiguration | null>(null);
    const [activeTab, setActiveTab] = useState<'statuses' | 'employees' | 'general'>('statuses');

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
        if (window.confirm(`האם אתה בטוח שברצונך למחוק את הסטטוס "${config?.label}"?`)) {
            setStatusConfigs(prev => prev.filter(c => c.id !== id));
            addActivity(`סטטוס נמחק: ${config?.label}`);
        }
    };

    const handleSave = (config: OrderStatusConfiguration) => {
        if (editingConfig) {
            setStatusConfigs(prev => prev.map(c => c.id === config.id ? config : c));
            addActivity(`הגדרות סטטוס עודכנו: ${config.label}`);
        } else {
            // New items go to end
            const maxIndex = Math.max(...statusConfigs.map(c => c.orderIndex), 0);
            config.orderIndex = maxIndex + 1;
            setStatusConfigs(prev => [...prev, config]);
            addActivity(`סטטוס חדש נוסף: ${config.label}`);
        }
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
            </div>

            {activeTab === 'statuses' && (
                <>
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">ניהול סטטוסים</h3>
                            <p className="text-slate-500 text-sm">ניהול סטטוסים ותהליכי עבודה</p>
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
                                            <div className="flex items-center gap-2">
                                                {config.label}
                                                {config.isSystem && (
                                                    <span className="flex items-center text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200" title="סטטוס מערכת (קבוע)">
                                                        <LockIcon className="w-3 h-3 me-1" />
                                                        מערכת
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {config.isActiveDeal ? (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                    עסקה פעילה
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                                    לא עסקה / הצעה
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
                                            {!config.isSystem && (
                                                <button onClick={() => handleDelete(config.id)} className="text-red-600 hover:text-red-900 p-1"><DeleteIcon className="h-5 w-5"/></button>
                                            )}
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

            {activeTab === 'general' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">הגדרות מע"מ</h3>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">אחוז מע"מ (%)</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="100"
                                    step="0.1"
                                    value={vatRate} 
                                    onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)} 
                                    className="block w-24 rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" 
                                />
                                <span className="text-slate-500 font-medium">%</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 bg-blue-50 p-2 rounded text-blue-700 border border-blue-100">
                                <strong>שים לב:</strong> שינוי ערך זה ישפיע מיידית על כל החישובים במערכת המציגים סכומים כולל מע"מ (כגון ווידג'ט גבייה, הצעות מחיר ודוחות).
                            </p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">הודעות מערכת</h3>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">טקסט הודעה ללוח הבקרה</label>
                            <textarea
                                rows={4}
                                value={systemMessage}
                                onChange={(e) => setSystemMessage(e.target.value)}
                                className="block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                                placeholder="הזן כאן הודעה שתופיע לכל המשתמשים בראש לוח הבקרה..."
                            />
                            <p className="text-xs text-slate-500 mt-2">
                                הודעה זו תוצג באופן בולט בראש לוח הבקרה של כל העובדים. השתמש בזה לעדכונים חשובים, תזכורות או מסרים יומיים.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <Modal title={editingConfig ? "עריכת סטטוס" : "הוספת סטטוס"} onClose={() => setIsModalOpen(false)}>
                    <StatusForm config={editingConfig} onSave={handleSave} onCancel={() => setIsModalOpen(false)} />
                </Modal>
            )}
        </div>
    );
};

export default SettingsPage;
    