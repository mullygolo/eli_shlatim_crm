
import React, { useState } from 'react';
import { Employee, AttendanceRecord, EmployeeRole } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, IdIcon, ClockIcon } from './icons';
import Modal from './Modal';

interface EmployeesPageProps {
    employees: Employee[];
    setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
    addActivity: (description: string) => void;
    attendanceRecords: AttendanceRecord[];
    setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
}

const EmployeeForm: React.FC<{ 
    employee: Employee | null; 
    allEmployees: Employee[]; // Need access to list for team selection
    onSave: (employee: Employee) => void; 
    onCancel: () => void; 
}> = ({ employee, allEmployees, onSave, onCancel }) => {
    const [activeTab, setActiveTab] = useState<'PERSONAL' | 'JOB'>('PERSONAL');
    const [formData, setFormData] = useState<Partial<Employee>>({
        name: employee?.name || '',
        role: employee?.role || '',
        roleType: employee?.roleType || 'EMPLOYEE',
        email: employee?.email || '',
        phone: employee?.phone || '',
        address: employee?.address || '',
        idNumber: employee?.idNumber || '',
        jobScopePercentage: employee?.jobScopePercentage || 100,
        hourlyWage: employee?.hourlyWage || 35,
        employerCostPercentage: employee?.employerCostPercentage || 20,
        hasSalesBonus: employee?.hasSalesBonus || false,
        salesBonusPercentage: employee?.salesBonusPercentage || 0,
        bonusBasisEmployeeIds: employee?.bonusBasisEmployeeIds || (employee?.id ? [employee.id] : []),
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : (type === 'number' ? parseFloat(value) : value);
        
        // If enabling bonus for the first time, default to self
        if (name === 'hasSalesBonus' && val === true && (!formData.bonusBasisEmployeeIds || formData.bonusBasisEmployeeIds.length === 0)) {
             // If creating new employee, we don't have ID yet, but empty array implies self in later logic if we want, 
             // or we just wait until save. For editing, we use current ID.
             setFormData(prev => ({ ...prev, [name]: val, bonusBasisEmployeeIds: employee?.id ? [employee.id] : [] }));
        } else {
             setFormData(prev => ({ ...prev, [name]: val }));
        }
    };

    const handleTeamSelection = (empId: string) => {
        setFormData(prev => {
            const currentList = prev.bonusBasisEmployeeIds || [];
            if (currentList.includes(empId)) {
                return { ...prev, bonusBasisEmployeeIds: currentList.filter(id => id !== empId) };
            } else {
                return { ...prev, bonusBasisEmployeeIds: [...currentList, empId] };
            }
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) {
            alert('שם העובד הוא שדה חובה');
            return;
        }
        // Ensure bonus basis has at least self if not set (for new employees where ID generated on save)
        // Logic handled in onSave or component wrapper usually, but here we pass data.
        // The ID generation happens in onSave wrapper if new.
        
        onSave({
            id: employee?.id || `emp_${Date.now()}`,
            ...formData as Employee
        });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex space-x-1 space-x-reverse border-b border-slate-200 mb-4">
                <button onClick={() => setActiveTab('PERSONAL')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'PERSONAL' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>פרטים אישיים</button>
                <button onClick={() => setActiveTab('JOB')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'JOB' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>העסקה ושכר</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-start flex-1 overflow-y-auto p-1">
                {activeTab === 'PERSONAL' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700">שם מלא</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">תעודת זהות</label>
                            <input type="text" name="idNumber" value={formData.idNumber} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">טלפון</label>
                            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">אימייל</label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">כתובת</label>
                            <input type="text" name="address" value={formData.address} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                    </div>
                )}

                {activeTab === 'JOB' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">תואר התפקיד</label>
                                <input type="text" name="role" value={formData.role} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">סוג הרשאה</label>
                                <select name="roleType" value={formData.roleType} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                    <option value="EMPLOYEE">עובד רגיל</option>
                                    <option value="MANAGER">מנהל (גישה מורחבת)</option>
                                    <option value="ADMIN">מנהל מערכת (בעלים)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">היקף משרה (%)</label>
                                <input type="number" name="jobScopePercentage" value={formData.jobScopePercentage} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">שכר שעתי (₪)</label>
                                <input type="number" name="hourlyWage" value={formData.hourlyWage} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">עלות מעביד נוספת (%)</label>
                                <input type="number" name="employerCostPercentage" value={formData.employerCostPercentage} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                <p className="text-xs text-slate-500">ביטוח לאומי, פנסיה וכו'</p>
                            </div>
                        </div>

                        <div className="border-t pt-4 mt-4">
                            <div className="flex items-center mb-2">
                                <input type="checkbox" id="hasSalesBonus" name="hasSalesBonus" checked={formData.hasSalesBonus} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2" />
                                <label htmlFor="hasSalesBonus" className="text-sm font-bold text-slate-700">זכאי לבונוס מכירות?</label>
                            </div>
                            {formData.hasSalesBonus && (
                                <div className="bg-slate-50 p-4 rounded border border-slate-200 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">גובה הבונוס (%) מסך עסקה</label>
                                        <input type="number" name="salesBonusPercentage" value={formData.salesBonusPercentage} onChange={handleChange} className="mt-1 block w-32 rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">בסיס לחישוב הבונוס (בחירת עובדים)</label>
                                        <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-md p-2 bg-white space-y-1">
                                            {allEmployees.map(emp => (
                                                <div key={emp.id} className="flex items-center">
                                                    <input 
                                                        type="checkbox" 
                                                        id={`bonus_basis_${emp.id}`} 
                                                        checked={(formData.bonusBasisEmployeeIds || []).includes(emp.id)}
                                                        onChange={() => handleTeamSelection(emp.id)}
                                                        className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                                                    />
                                                    <label htmlFor={`bonus_basis_${emp.id}`} className="ms-2 text-sm text-slate-700 cursor-pointer select-none">
                                                        {emp.name} {emp.id === employee?.id ? '(עצמי)' : ''}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">בחר אילו עובדים יתרמו לחישוב הבונוס של עובד זה (עבור עבודה בצוות).</p>
                                    </div>

                                    <div className="bg-yellow-50 border-r-4 border-yellow-400 p-3">
                                        <p className="text-xs text-yellow-800 font-bold">
                                            שים לב: הבונוס מחושב אך ורק מעסקאות בסטטוס "מאושר" (זכייה) ששולמו במלואן, ונגזר מסכום המכירה ללקוח לפני מע"מ.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-end space-x-2 pt-4 space-x-reverse border-t mt-4">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמירה</button>
                </div>
            </form>
        </div>
    );
};

const EmployeesPage: React.FC<EmployeesPageProps> = ({ employees, setEmployees, addActivity, attendanceRecords, setAttendanceRecords }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [activeMainTab, setActiveMainTab] = useState<'LIST' | 'REQUESTS'>('LIST');

    // Filter pending requests
    const pendingRequests = attendanceRecords.filter(r => r.status === 'PENDING_APPROVAL' && r.correctionRequest);

    const handleAddEmployee = () => {
        setEditingEmployee(null);
        setIsModalOpen(true);
    };

    const handleEditEmployee = (employee: Employee) => {
        setEditingEmployee(employee);
        setIsModalOpen(true);
    };

    const handleDeleteEmployee = (employeeId: string) => {
        const emp = employees.find(e => e.id === employeeId);
        if (emp?.roleType === 'ADMIN') {
            alert("לא ניתן למחוק את מנהל המערכת.");
            return;
        }
        if(window.confirm(`האם אתה בטוח שברצונך למחוק את העובד ${emp?.name}?`)) {
            setEmployees(prev => prev.filter(e => e.id !== employeeId));
            addActivity(`עובד נמחק: ${emp?.name}`);
        }
    };

    const handleSaveEmployee = (employee: Employee) => {
        // Logic to ensure bonusBasisEmployeeIds has at least self if empty and bonus is enabled
        let updatedEmployee = { ...employee };
        if (updatedEmployee.hasSalesBonus && (!updatedEmployee.bonusBasisEmployeeIds || updatedEmployee.bonusBasisEmployeeIds.length === 0)) {
            updatedEmployee.bonusBasisEmployeeIds = [updatedEmployee.id];
        }

        if (editingEmployee) {
            setEmployees(prev => prev.map(e => e.id === employee.id ? updatedEmployee : e));
            addActivity(`עובד עודכן: ${employee.name}`);
        } else {
            setEmployees(prev => [...prev, updatedEmployee]);
            addActivity(`עובד חדש נוסף: ${employee.name}`);
        }
        setIsModalOpen(false);
        setEditingEmployee(null);
    };

    const handleApproveRequest = (recordId: string, approve: boolean) => {
        setAttendanceRecords(prev => prev.map(record => {
            if (record.id !== recordId || !record.correctionRequest) return record;

            if (approve) {
                // Calculate new hours
                const start = record.correctionRequest.requestedClockIn;
                const end = record.correctionRequest.requestedClockOut;
                const breakMins = record.correctionRequest.requestedBreak;
                const totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60) - (breakMins / 60);

                return {
                    ...record,
                    clockIn: start,
                    clockOut: end,
                    breakDurationMinutes: breakMins,
                    totalHours: Math.max(0, totalHours),
                    status: 'PRESENT',
                    note: `${record.note ? record.note + ' | ' : ''}תיקון אושר: ${record.correctionRequest.reason}`,
                    correctionRequest: undefined
                };
            } else {
                return {
                    ...record,
                    status: record.totalHours > 0 ? 'PRESENT' : 'ABSENT', // Revert to previous probable status
                    correctionRequest: undefined,
                    note: `${record.note ? record.note + ' | ' : ''}בקשת תיקון נדחתה`
                };
            }
        }));
        addActivity(approve ? 'אושרה בקשת תיקון שעות' : 'נדחתה בקשת תיקון שעות');
    };

    return (
        <div>
            <div className="mb-6 flex justify-between items-center">
                <div className="flex space-x-4 space-x-reverse">
                    <button 
                        onClick={() => setActiveMainTab('LIST')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeMainTab === 'LIST' ? 'bg-white shadow text-primary' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        רשימת עובדים
                    </button>
                    <button 
                        onClick={() => setActiveMainTab('REQUESTS')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors relative ${activeMainTab === 'REQUESTS' ? 'bg-white shadow text-primary' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        בקשות לתיקון נוכחות
                        {pendingRequests.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                                {pendingRequests.length}
                            </span>
                        )}
                    </button>
                </div>
                
                {activeMainTab === 'LIST' && (
                    <button onClick={handleAddEmployee} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        <PlusIcon className="h-5 w-5 me-2" />
                        הוסף עובד
                    </button>
                )}
            </div>

            {activeMainTab === 'LIST' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {employees.map(employee => (
                        <div key={employee.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                            <div className={`h-2 ${employee.roleType === 'ADMIN' ? 'bg-purple-500' : employee.roleType === 'MANAGER' ? 'bg-blue-500' : 'bg-slate-400'}`}></div>
                            <div className="p-5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800">{employee.name}</h3>
                                        <p className="text-sm text-slate-500">{employee.role}</p>
                                    </div>
                                    {employee.roleType === 'ADMIN' && <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">בעלים</span>}
                                </div>
                                
                                <div className="mt-4 space-y-2 text-sm text-slate-600">
                                    <div className="flex items-center gap-2">
                                        <IdIcon className="w-4 h-4 text-slate-400" />
                                        <span>{employee.idNumber || 'לא הוזן ת"ז'}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-slate-100 pt-2 mt-2">
                                        <span>שכר שעתי:</span>
                                        <span className="font-semibold">₪{employee.hourlyWage}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>היקף משרה:</span>
                                        <span>{employee.jobScopePercentage}%</span>
                                    </div>
                                    {employee.hasSalesBonus && (
                                        <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                                            <div className="flex justify-between text-green-700 bg-green-50 px-2 py-1 rounded">
                                                <span>בונוס מכירות:</span>
                                                <span className="font-bold">{employee.salesBonusPercentage}%</span>
                                            </div>
                                            {employee.bonusBasisEmployeeIds && employee.bonusBasisEmployeeIds.length > 1 && (
                                                <span className="text-xs text-slate-400 text-center">(בונוס קבוצתי - {employee.bonusBasisEmployeeIds.length} עובדים)</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
                                    <button onClick={() => handleEditEmployee(employee)} className="text-primary hover:bg-indigo-50 p-2 rounded-full transition-colors"><EditIcon className="h-5 w-5"/></button>
                                    {employee.roleType !== 'ADMIN' && (
                                        <button onClick={() => handleDeleteEmployee(employee.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"><DeleteIcon className="h-5 w-5"/></button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeMainTab === 'REQUESTS' && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    {pendingRequests.length === 0 ? (
                        <div className="p-10 text-center text-slate-500">
                            <ClockIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                            <p>אין בקשות ממתינות לאישור.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {pendingRequests.map(req => {
                                const emp = employees.find(e => e.id === req.employeeId);
                                if (!req.correctionRequest) return null;
                                
                                const originalStart = req.clockIn ? req.clockIn.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '-';
                                const originalEnd = req.clockOut ? req.clockOut.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '-';
                                
                                const newStart = req.correctionRequest.requestedClockIn.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
                                const newEnd = req.correctionRequest.requestedClockOut.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});

                                return (
                                    <div key={req.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-800">{emp?.name}</span>
                                                <span className="text-sm text-slate-500">{req.date.toLocaleDateString('he-IL')}</span>
                                            </div>
                                            <p className="text-sm text-slate-600 mt-1">
                                                <span className="font-medium">סיבה:</span> {req.correctionRequest.reason}
                                            </p>
                                            <div className="flex items-center gap-4 mt-2 text-sm bg-slate-50 p-2 rounded border border-slate-200">
                                                <div>
                                                    <span className="block text-xs text-slate-400">מקורי</span>
                                                    <span className="line-through text-slate-500">{originalStart} - {originalEnd}</span>
                                                </div>
                                                <div className="text-slate-400">➔</div>
                                                <div>
                                                    <span className="block text-xs text-green-600 font-bold">מבוקש</span>
                                                    <span className="font-bold text-slate-800">{newStart} - {newEnd}</span>
                                                </div>
                                                {(req.correctionRequest.requestedBreak !== req.breakDurationMinutes) && (
                                                    <div className="border-r border-slate-300 pr-4 mr-2">
                                                        <span className="block text-xs text-slate-400">הפסקה</span>
                                                        <span className="font-bold">{req.correctionRequest.requestedBreak} דק'</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 self-end md:self-center">
                                            <button onClick={() => handleApproveRequest(req.id, false)} className="px-3 py-1.5 bg-red-50 text-red-700 rounded hover:bg-red-100 text-sm font-medium">דחה</button>
                                            <button onClick={() => handleApproveRequest(req.id, true)} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium shadow-sm">אשר שינוי</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {isModalOpen && (
                <Modal title={editingEmployee ? "עריכת פרטי עובד" : "הקמת עובד חדש"} onClose={() => setIsModalOpen(false)} size="2xl">
                    <EmployeeForm 
                        employee={editingEmployee} 
                        allEmployees={employees}
                        onSave={handleSaveEmployee} 
                        onCancel={() => setIsModalOpen(false)} 
                    />
                </Modal>
            )}
        </div>
    );
};

export default EmployeesPage;
