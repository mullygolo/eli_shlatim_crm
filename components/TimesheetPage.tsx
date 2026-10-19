import React, { useState, useMemo } from 'react';
import { TimeEntry, Employee } from '../types';
import { PlusIcon, EditIcon, DeleteIcon } from './icons';
import Modal from './Modal';

interface TimesheetPageProps {
    timeEntries: TimeEntry[];
    setTimeEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
    employees: Employee[];
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
}

const TimeEntryForm: React.FC<{
    entry: TimeEntry | null;
    employees: Employee[];
    onSave: (entry: TimeEntry) => void;
    onCancel: () => void;
}> = ({ entry, employees, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        employeeId: entry?.employeeId || (employees.length > 0 ? employees[0].id : ''),
        date: entry?.date ? entry.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        hours: entry?.hours || 0,
        description: entry?.description || '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'hours' ? parseFloat(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            ...formData,
            id: entry?.id || `time_${Date.now()}`,
            date: new Date(formData.date),
            hours: Number(formData.hours),
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-start">
            <div>
                <label className="block text-sm font-medium text-slate-700">עובד</label>
                <select name="employeeId" value={formData.employeeId} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">תאריך</label>
                    <input type="date" name="date" value={formData.date} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">שעות</label>
                    <input type="number" step="0.1" name="hours" value={formData.hours} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">תיאור</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
            </div>
            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמירה</button>
            </div>
        </form>
    );
};


const TimesheetPage: React.FC<TimesheetPageProps> = ({ timeEntries, setTimeEntries, employees, addActivity }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);

    const getEmployeeName = (employeeId: string) => employees.find(e => e.id === employeeId)?.name || 'לא ידוע';
    
    const handleAddEntry = () => {
        setEditingEntry(null);
        setIsModalOpen(true);
    };
    
    const handleEditEntry = (entry: TimeEntry) => {
        setEditingEntry(entry);
        setIsModalOpen(true);
    };

    const handleDeleteEntry = (entryId: string) => {
        const entryDesc = timeEntries.find(e => e.id === entryId)?.description;
        if (window.confirm(`האם אתה בטוח שברצונך למחוק את רישום "${entryDesc}"?`)) {
            setTimeEntries(prev => prev.filter(e => e.id !== entryId));
            addActivity(`רישום שעות נמחק: ${entryDesc}`);
        }
    };

    const handleSaveEntry = (entry: TimeEntry) => {
        const employeeName = getEmployeeName(entry.employeeId);
        if (editingEntry) {
            setTimeEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
            addActivity(`רישום שעות עודכן עבור ${employeeName}`);
        } else {
            setTimeEntries(prev => [...prev, entry]);
            addActivity(`רישום שעות חדש נוסף עבור ${employeeName}`);
        }
        setIsModalOpen(false);
        setEditingEntry(null);
    };
    
    const totalHoursThisMonth = useMemo(() => {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return timeEntries
            .filter(e => e.date.getTime() >= startOfMonth.getTime())
            .reduce((sum, e) => sum + e.hours, 0);
    }, [timeEntries]);

    return (
        <div>
             <div className="flex justify-between items-center mb-6">
                <div className="bg-white p-4 rounded-lg shadow-md">
                     <h3 className="text-sm font-medium text-slate-500">סה"כ שעות החודש</h3>
                     <p className="text-2xl font-bold text-slate-900 mt-1">{totalHoursThisMonth.toFixed(1)}</p>
                </div>
                <button onClick={handleAddEntry} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                    <PlusIcon className="h-5 w-5 me-2" />
                    הוסף רישום שעות
                </button>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-start">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">עובד</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תאריך</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">שעות</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תיאור</th>
                            <th className="relative px-6 py-3"><span className="sr-only">פעולות</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {timeEntries.sort((a,b) => b.date.getTime() - a.date.getTime()).map(entry => (
                            <tr key={entry.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{getEmployeeName(entry.employeeId)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{entry.date.toLocaleDateString('he-IL')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">{entry.hours.toFixed(1)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 truncate max-w-sm">{entry.description}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium space-x-2 space-x-reverse">
                                    <button onClick={() => handleEditEntry(entry)} className="text-primary hover:text-indigo-900 p-1"><EditIcon className="h-5 w-5"/></button>
                                    <button onClick={() => handleDeleteEntry(entry.id)} className="text-red-600 hover:text-red-900 p-1"><DeleteIcon className="h-5 w-5"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && (
                <Modal title={editingEntry ? "עריכת רישום שעות" : "הוספת רישום שעות"} onClose={() => setIsModalOpen(false)}>
                    <TimeEntryForm entry={editingEntry} employees={employees} onSave={handleSaveEntry} onCancel={() => setIsModalOpen(false)} />
                </Modal>
            )}
        </div>
    );
};

export default TimesheetPage;