import React, { useState, useMemo } from 'react';
import { Employee, AttendanceRecord, EmployeeRole, EmployeeStatus, EmploymentPeriod, TimelineEvent, FieldChange, AttendanceStatus, Attachment, SalaryRecord } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, IdIcon, ClockIcon, LogIcon, NoteIcon, DownloadIcon, CashIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon } from './icons';
import Modal from './Modal';
import { useAuth } from '../contexts/AuthContext';

interface EmployeesPageProps {
    employees: Employee[];
    setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
    attendanceRecords: AttendanceRecord[];
    setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
}

const EmployeeForm: React.FC<{ 
    employee: Employee | null; 
    allEmployees: Employee[]; 
    onSave: (employee: Employee) => void; 
    onCancel: () => void; 
}> = ({ employee, allEmployees, onSave, onCancel }) => {
    const { user } = useAuth();
    const isAdminOrManager = user?.roleType === 'ADMIN' || user?.roleType === 'MANAGER';
    const [activeTab, setActiveTab] = useState<'PERSONAL' | 'JOB' | 'HISTORY'>('PERSONAL');
    const [showPassword, setShowPassword] = useState(true);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [passwordValue, setPasswordValue] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [formData, setFormData] = useState<Partial<Employee>>({
        name: employee?.name || '',
        status: employee?.status || 'ACTIVE',
        startDate: employee?.startDate ? new Date(employee.startDate) : new Date(),
        role: employee?.role || '',
        roleType: employee?.roleType || 'EMPLOYEE',
        email: employee?.email || '',
        phone: employee?.phone || '',
        address: employee?.address || '',
        idNumber: employee?.idNumber || '',
        username: employee?.username || '',
        passwordHash: undefined, // Will be set when password field changes
        jobScopePercentage: employee?.jobScopePercentage || 100,
        salaryType: employee?.salaryType || 'HOURLY',
        hourlyWage: employee?.hourlyWage || 35,
        monthlyBaseSalary: employee?.monthlyBaseSalary || 0,
        employerCostPercentage: employee?.employerCostPercentage || 20,
        hasSalesBonus: employee?.hasSalesBonus || false,
        salesBonusPercentage: employee?.salesBonusPercentage || 0,
        bonusBasisEmployeeIds: employee?.bonusBasisEmployeeIds || (employee?.id ? [employee.id] : []),
        employmentHistory: employee?.employmentHistory || [],
        timeline: employee?.timeline || [],
        salaryHistory: employee?.salaryHistory || []
    });

    // Password strength calculator
    const calculatePasswordStrength = (password: string): { strength: 'weak' | 'medium' | 'strong' | 'very-strong', score: number, feedback: string[] } => {
        if (!password) return { strength: 'weak', score: 0, feedback: [] };
        
        let score = 0;
        const feedback: string[] = [];
        
        if (password.length >= 6) score += 1;
        else feedback.push('מינימום 6 תווים');
        
        if (password.length >= 8) score += 1;
        if (password.length >= 12) score += 1;
        
        if (/[a-z]/.test(password)) score += 1;
        else feedback.push('הוסף אותיות קטנות');
        
        if (/[A-Z]/.test(password)) score += 1;
        else feedback.push('הוסף אותיות גדולות');
        
        if (/[0-9]/.test(password)) score += 1;
        else feedback.push('הוסף מספרים');
        
        if (/[^a-zA-Z0-9]/.test(password)) score += 1;
        else feedback.push('הוסף תווים מיוחדים');
        
        let strength: 'weak' | 'medium' | 'strong' | 'very-strong' = 'weak';
        if (score >= 5) strength = 'very-strong';
        else if (score >= 4) strength = 'strong';
        else if (score >= 2) strength = 'medium';
        
        return { strength, score, feedback };
    };

    const passwordStrength = useMemo(() => calculatePasswordStrength(passwordValue), [passwordValue]);
    const hasPasswordSet = employee?.passwordHash && employee.passwordHash.length > 0;

    // Helper: Find effective salary record for display
    const latestSalaryRecord = useMemo(() => {
        if (!formData.salaryHistory || formData.salaryHistory.length === 0) return null;
        return [...formData.salaryHistory].sort((a, b) => 
            new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
        )[0];
    }, [formData.salaryHistory]);

    // Combined Unified Feed (Timeline + Salary Records)
    const unifiedFeed = useMemo(() => {
        const events: { id: string, date: Date, type: 'LOG' | 'NOTE' | 'SALARY', content: string, data: any }[] = [];
        
        // Add Timeline Events
        (formData.timeline || []).forEach(t => {
            events.push({
                id: t.id,
                date: new Date(t.timestamp),
                type: t.type === 'LOG' ? 'LOG' : 'NOTE',
                content: t.content,
                data: t
            });
        });

        // Add Salary Changes as Events
        (formData.salaryHistory || []).forEach(s => {
            events.push({
                id: s.id,
                date: new Date(s.effectiveDate),
                type: 'SALARY',
                content: `עדכון שכר: ${s.salaryType === 'GLOBAL' ? 'גלובלי' : 'שעתי'} - ₪${s.amount.toLocaleString()}`,
                data: s
            });
        });

        return events.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [formData.timeline, formData.salaryHistory]);

    // Sub-state for adding a new salary record
    const [newSalary, setNewSalary] = useState<Partial<SalaryRecord>>({
        amount: 0,
        salaryType: 'HOURLY',
        effectiveDate: new Date(),
        note: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : (type === 'number' ? parseFloat(value) : value);
        
        if (name === 'startDate') {
            setFormData(prev => ({ ...prev, [name]: new Date(value) }));
        } else if (name === 'hasSalesBonus' && val === true && (!formData.bonusBasisEmployeeIds || formData.bonusBasisEmployeeIds.length === 0)) {
             setFormData(prev => ({ ...prev, [name]: val, bonusBasisEmployeeIds: employee?.id ? [employee.id] : [] }));
        } else {
             setFormData(prev => ({ ...prev, [name]: val }));
        }
    };

    const handleAddSalaryRecord = () => {
        if (!newSalary.amount || newSalary.amount <= 0 || !newSalary.effectiveDate) {
            alert('נא להזין סכום ותאריך תוקף תקינים');
            return;
        }

        const record: SalaryRecord = {
            id: `sal_${Date.now()}`,
            amount: newSalary.amount,
            salaryType: newSalary.salaryType as 'HOURLY' | 'GLOBAL',
            effectiveDate: new Date(newSalary.effectiveDate),
            note: newSalary.note
        };

        setFormData(prev => {
            const history = [...(prev.salaryHistory || []), record].sort((a, b) => 
                new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
            );
            return { ...prev, salaryHistory: history };
        });

        // Reset new salary form
        setNewSalary({ amount: 0, salaryType: formData.salaryType, effectiveDate: new Date(), note: '' });
    };

    const removeSalaryRecord = (id: string) => {
        if (!window.confirm('האם למחוק רשומה זו מהיסטוריית השכר?')) return;
        setFormData(prev => ({
            ...prev,
            salaryHistory: prev.salaryHistory?.filter(s => s.id !== id)
        }));
    };

    const generateDiff = (oldEmp: Employee, newEmp: Partial<Employee>): FieldChange[] => {
        const changes: FieldChange[] = [];
        const labels: Record<string, string> = {
            name: 'שם עובד',
            role: 'תפקיד',
            status: 'סטטוס',
            hourlyWage: 'שכר שעתי',
            monthlyBaseSalary: 'שכר בסיס',
            jobScopePercentage: 'היקף משרה',
            roleType: 'הרשאה'
        };

        (Object.keys(labels) as (keyof Employee)[]).forEach(key => {
            if (newEmp[key] !== undefined && oldEmp[key] !== newEmp[key]) {
                changes.push({
                    field: key,
                    label: labels[key],
                    oldValue: (oldEmp as any)[key],
                    newValue: (newEmp as any)[key],
                    action: 'UPDATED'
                });
            }
        });
        return changes;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) {
            alert('שם העובד הוא שדה חובה');
            return;
        }

        // Validate password if provided
        if (passwordValue) {
            if (passwordValue.length < 6) {
                alert('סיסמה חייבת להכיל לפחות 6 תווים');
                return;
            }
            if (passwordConfirm && passwordConfirm !== passwordValue) {
                alert('הסיסמאות לא תואמות. אנא ודא שהסיסמאות זהות.');
                return;
            }
        }

        const isNew = !employee;
        let finalData = { ...formData } as Employee;
        finalData.id = employee?.id || `emp_${Date.now()}`;

        // Hard validation: ADMINs must be ACTIVE
        if (finalData.roleType === 'ADMIN') {
            finalData.status = 'ACTIVE';
        }

        // Ensure we have a salary history record
        if (!finalData.salaryHistory || finalData.salaryHistory.length === 0) {
             const initialAmount = finalData.salaryType === 'GLOBAL' ? (finalData.monthlyBaseSalary || 0) : (finalData.hourlyWage || 0);
             finalData.salaryHistory = [{
                id: `sal_init_${Date.now()}`,
                amount: initialAmount,
                salaryType: finalData.salaryType,
                effectiveDate: finalData.startDate,
                note: 'שכר התחלתי (סנכרון)'
            }];
        }

        // SYNC: Set main fields from latest history record
        const sorted = [...finalData.salaryHistory].sort((a,b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
        const newest = sorted[0];
        finalData.salaryType = newest.salaryType;
        if (newest.salaryType === 'HOURLY') {
            finalData.hourlyWage = newest.amount;
        } else {
            finalData.monthlyBaseSalary = newest.amount;
        }

        if (isNew) {
            finalData.employmentHistory = [{
                id: `period_${Date.now()}`,
                startDate: finalData.startDate,
            }];
            finalData.timeline = [{
                id: `log_${Date.now()}`,
                timestamp: new Date(),
                user: 'מערכת',
                type: 'LOG',
                content: 'עובד הוקם במערכת'
            }];
        } else {
            const diff = generateDiff(employee, finalData);
            if (diff.length > 0) {
                const logEvent: TimelineEvent = {
                    id: `log_${Date.now()}`,
                    timestamp: new Date(),
                    user: 'מערכת',
                    type: 'LOG',
                    content: 'עדכון פרטי עובד',
                    changes: diff
                };
                finalData.timeline = [logEvent, ...(employee.timeline || [])];

                if (employee.status !== finalData.status) {
                    const history = [...(employee.employmentHistory || [])];
                    if (finalData.status === 'INACTIVE') {
                        const lastPeriod = history[history.length - 1];
                        if (lastPeriod && !lastPeriod.endDate) {
                            lastPeriod.endDate = new Date();
                        }
                    } else if (finalData.status === 'ACTIVE') {
                        history.push({
                            id: `period_${Date.now()}`,
                            startDate: new Date(),
                        });
                    }
                    finalData.employmentHistory = history;
                }
            }
        }
        
        // Remove passwordHash if empty (don't update password)
        if (!finalData.passwordHash || finalData.passwordHash === '') {
            delete finalData.passwordHash;
        }
        
        // Keep password visible in field after save (do not clear)
        
        onSave(finalData);
    };

    return (
        <>
            <div className="flex flex-col h-full">
                <div className="flex space-x-1 space-x-reverse border-b border-slate-200 mb-4 overflow-x-auto">
                <button type="button" onClick={() => setActiveTab('PERSONAL')} className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === 'PERSONAL' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>פרטים אישיים</button>
                <button type="button" onClick={() => setActiveTab('JOB')} className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === 'JOB' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>העסקה ותנאים</button>
                <button type="button" onClick={() => setActiveTab('HISTORY')} className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === 'HISTORY' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>היסטוריה ותיעוד</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-start flex-1 overflow-y-auto p-1">
                {activeTab === 'PERSONAL' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700">שם מלא</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">סטטוס עובד</label>
                            <select 
                                name="status" 
                                value={formData.status} 
                                onChange={handleChange} 
                                disabled={formData.roleType === 'ADMIN'}
                                className={`mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:ring-primary sm:text-sm font-bold ${formData.status === 'ACTIVE' ? 'text-green-600' : 'text-red-600'} ${formData.roleType === 'ADMIN' ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                            >
                                <option value="ACTIVE">פעיל</option>
                                <option value="INACTIVE">לא פעיל (ארכיון)</option>
                            </select>
                            {formData.roleType === 'ADMIN' && (
                                <p className="text-[10px] text-slate-400 mt-1 font-bold">* לא ניתן להשבית מנהל מערכת</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">תאריך הצטרפות מקורי</label>
                            <input type="date" name="startDate" value={formData.startDate ? formData.startDate.toISOString().split('T')[0] : ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
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
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700">כתובת</label>
                            <input type="text" name="address" value={formData.address} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                        </div>
                        
                        {/* Authentication Fields */}
                        <div className="md:col-span-2 border-t border-slate-200 pt-4 mt-4">
                            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                פרטי התחברות
                                {hasPasswordSet && (
                                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                        <CheckCircleIcon className="w-4 h-4" />
                                        סיסמה הוגדרה
                                    </span>
                                )}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">
                                        שם משתמש
                                        {!formData.username && (
                                            <span className="text-red-500 mr-1">*</span>
                                        )}
                                    </label>
                                    <input 
                                        type="text" 
                                        name="username" 
                                        value={formData.username} 
                                        onChange={handleChange} 
                                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" 
                                        placeholder="הזן שם משתמש ייחודי"
                                    />
                                    {!formData.username && (
                                        <p className="text-xs text-amber-600 mt-1 font-bold">⚠️ שם משתמש נדרש להתחברות למערכת</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        סיסמה {employee ? '(השאר ריק כדי לא לשנות)' : ''}
                                    </label>
                                    <div className="relative">
                                        <input 
                                            type={showPassword ? "text" : "password"} 
                                            name="password" 
                                            value={passwordValue}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setPasswordValue(value);
                                                setFormData(prev => ({ ...prev, passwordHash: value }));
                                            }}
                                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm pr-10" 
                                            placeholder={employee ? "הזן סיסמה חדשה (אופציונלי)" : "הזן סיסמה"}
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    
                                    {/* Password Strength Indicator */}
                                    {passwordValue && (
                                        <div className="mt-2 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full transition-all duration-300 ${
                                                            passwordStrength.strength === 'very-strong' ? 'bg-green-500 w-full' :
                                                            passwordStrength.strength === 'strong' ? 'bg-green-400 w-3/4' :
                                                            passwordStrength.strength === 'medium' ? 'bg-yellow-400 w-1/2' :
                                                            'bg-red-400 w-1/4'
                                                        }`}
                                                    />
                                                </div>
                                                <span className={`text-xs font-bold ${
                                                    passwordStrength.strength === 'very-strong' ? 'text-green-600' :
                                                    passwordStrength.strength === 'strong' ? 'text-green-500' :
                                                    passwordStrength.strength === 'medium' ? 'text-yellow-600' :
                                                    'text-red-500'
                                                }`}>
                                                    {passwordStrength.strength === 'very-strong' ? 'חזקה מאוד' :
                                                     passwordStrength.strength === 'strong' ? 'חזקה' :
                                                     passwordStrength.strength === 'medium' ? 'בינונית' :
                                                     'חלשה'}
                                                </span>
                                            </div>
                                            {passwordStrength.feedback.length > 0 && passwordStrength.score < 4 && (
                                                <ul className="text-xs text-slate-500 list-disc list-inside space-y-0.5">
                                                    {passwordStrength.feedback.slice(0, 2).map((msg, idx) => (
                                                        <li key={idx}>{msg}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                    
                                    {!passwordValue && (
                                        <p className="text-xs text-slate-500 mt-1">מינימום 6 תווים • מומלץ: אותיות גדולות וקטנות, מספרים ותווים מיוחדים</p>
                                    )}
                                </div>
                                
                                {/* Password Confirmation Field */}
                                {passwordValue && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">
                                            אימות סיסמה
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type={showPasswordConfirm ? "text" : "password"} 
                                                value={passwordConfirm}
                                                onChange={(e) => setPasswordConfirm(e.target.value)}
                                                className={`mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm pr-10 ${
                                                    passwordConfirm && passwordConfirm !== passwordValue ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
                                                }`}
                                                placeholder="הזן שוב את הסיסמה"
                                                autoComplete="new-password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                                                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                                tabIndex={-1}
                                            >
                                                {showPasswordConfirm ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                            </button>
                                        </div>
                                        {passwordConfirm && passwordConfirm !== passwordValue && (
                                            <p className="text-xs text-red-600 mt-1 font-bold">⚠️ הסיסמאות לא תואמות</p>
                                        )}
                                        {passwordConfirm && passwordConfirm === passwordValue && (
                                            <p className="text-xs text-green-600 mt-1 font-bold flex items-center gap-1">
                                                <CheckCircleIcon className="w-3 h-3" />
                                                הסיסמאות תואמות
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
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

                            <div className="md:col-span-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="text-center sm:text-start">
                                    <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">נתוני שכר נוכחיים</label>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl font-black text-slate-800">
                                            {latestSalaryRecord ? (
                                                latestSalaryRecord.salaryType === 'HOURLY' 
                                                    ? `₪${latestSalaryRecord.amount} לשעה` 
                                                    : `₪${latestSalaryRecord.amount.toLocaleString()} גלובלי (ברוטו)`
                                            ) : (
                                                <span className="text-red-400">טרם הוגדר שכר</span>
                                            )}
                                        </span>
                                        {latestSalaryRecord && (
                                            <span className="text-[11px] font-bold bg-white px-2 py-1 rounded border border-indigo-100 text-indigo-600 shadow-sm">
                                                בתוקף מ-{new Date(latestSalaryRecord.effectiveDate).toLocaleDateString('he-IL')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2 italic">* שינוי שכר מתבצע תחת לשונית "היסטוריה ותיעוד".</p>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setActiveTab('HISTORY')}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-primary text-primary rounded-lg text-sm font-black hover:bg-primary hover:text-white transition-all shadow-sm"
                                >
                                    <ClockIcon className="w-4 h-4"/>
                                    לניהול שכר והיסטוריה
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700">היקף משרה (%)</label>
                                <input type="number" name="jobScopePercentage" value={formData.jobScopePercentage} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">עלות מעביד נוספת (%)</label>
                                <input type="number" name="employerCostPercentage" value={formData.employerCostPercentage} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'HISTORY' && (
                    <div className="space-y-8 animate-fadeIn">
                        {/* 1. Employment Summary */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <ClockIcon className="w-4 h-4"/> תקופות העסקה וסטטוס
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {formData.employmentHistory?.map((period, idx) => (
                                    <div key={period.id} className="flex justify-between bg-white p-3 rounded-lg border border-slate-200 text-sm shadow-sm relative group">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex gap-2">
                                                <span className="text-slate-400 font-bold">התחלה:</span> 
                                                <span className="font-black text-slate-800">{new Date(period.startDate).toLocaleDateString('he-IL')}</span>
                                            </div>
                                            {period.endDate && (
                                                <div className="flex gap-2">
                                                    <span className="text-slate-400 font-bold">סיום:</span> 
                                                    <span className="font-black text-red-600">{new Date(period.endDate).toLocaleDateString('he-IL')}</span>
                                                </div>
                                            )}
                                        </div>
                                        {!period.endDate && <span className="self-start bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter">נוכחי</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Salary Management Center */}
                        <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                <CashIcon className="w-24 h-24 text-indigo-900" />
                            </div>
                            <h4 className="text-sm font-black text-indigo-900 mb-4 flex items-center gap-2 relative">
                                <CashIcon className="w-4 h-4"/> ניהול גרסאות שכר (Versioning)
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end relative">
                                <div>
                                    <label className="block text-[10px] font-black text-indigo-400 uppercase mb-1">תאריך תוקף</label>
                                    <input type="date" value={newSalary.effectiveDate ? new Date(newSalary.effectiveDate).toISOString().split('T')[0] : ''} onChange={e => setNewSalary({...newSalary, effectiveDate: new Date(e.target.value)})} className="w-full text-sm rounded-lg border-indigo-200 p-2 focus:ring-primary focus:border-primary shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-indigo-400 uppercase mb-1">סוג שכר</label>
                                    <select value={newSalary.salaryType} onChange={e => setNewSalary({...newSalary, salaryType: e.target.value as any})} className="w-full text-sm rounded-lg border-indigo-200 p-2 focus:ring-primary focus:border-primary shadow-sm bg-white">
                                        <option value="HOURLY">שעתי</option>
                                        <option value="GLOBAL">גלובלי</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-indigo-400 uppercase mb-1">סכום ברוטו</label>
                                    <input type="number" value={newSalary.amount || ''} onChange={e => setNewSalary({...newSalary, amount: parseFloat(e.target.value)})} className="w-full text-sm rounded-lg border-indigo-200 p-2 font-black text-indigo-700 shadow-sm" placeholder="₪" />
                                </div>
                                <div>
                                    <button type="button" onClick={handleAddSalaryRecord} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-black shadow-md hover:bg-indigo-700 transition-all hover:-translate-y-0.5">עדכן שכר</button>
                                </div>
                                <div className="md:col-span-4">
                                    <label className="block text-[10px] font-black text-indigo-400 uppercase mb-1">סיבת העדכון / הערה</label>
                                    <input type="text" value={newSalary.note || ''} onChange={e => setNewSalary({...newSalary, note: e.target.value})} className="w-full text-sm rounded-lg border-indigo-200 p-2 shadow-sm" placeholder="לדוגמה: הערכה שנתית, קידום בתפקיד..." />
                                </div>
                            </div>
                        </div>

                        {/* 3. The Unified Activity Feed */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <LogIcon className="w-4 h-4"/> ציר זמן ופעילות מאוחד
                            </h4>
                            
                            <div className="space-y-6 relative before:absolute before:inset-y-0 before:right-4 before:w-0.5 before:bg-slate-100 pb-10">
                                {unifiedFeed.map((item) => {
                                    const isSalary = item.type === 'SALARY';
                                    const isLog = item.type === 'LOG';
                                    const isNote = item.type === 'NOTE';

                                    return (
                                        <div key={item.id} className="relative pr-10 animate-slideIn">
                                            {/* Date indicator on the line */}
                                            <div className="absolute right-0 top-1 w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10 
                                                ${isSalary ? 'bg-indigo-600' : isLog ? 'bg-slate-200' : 'bg-blue-400'}"
                                            >
                                                {isSalary ? <CashIcon className="w-3.5 h-3.5 text-white"/> : 
                                                 isLog ? <LogIcon className="w-3.5 h-3.5 text-slate-500"/> : 
                                                 <NoteIcon className="w-3.5 h-3.5 text-white"/>}
                                            </div>

                                            <div className={`p-4 rounded-xl border transition-all ${isSalary ? 'bg-indigo-50/30 border-indigo-100 shadow-sm ring-1 ring-indigo-50' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 inline-block ${
                                                            isSalary ? 'bg-indigo-100 text-indigo-700' : 
                                                            isLog ? 'bg-slate-100 text-slate-500' : 
                                                            'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {isSalary ? 'עדכון תנאי שכר' : isLog ? 'שינוי מערכתי' : 'הערת מנהל'}
                                                        </span>
                                                        <h5 className="text-sm font-black text-slate-800">{item.content}</h5>
                                                    </div>
                                                    <div className="text-left">
                                                        <time className="text-[10px] font-bold text-slate-400 block">{item.date.toLocaleDateString('he-IL')}</time>
                                                        <span className="text-[9px] text-slate-300 font-medium">{item.date.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}</span>
                                                    </div>
                                                </div>

                                                {/* Specialized Content for Salary */}
                                                {isSalary && (
                                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-indigo-100/50">
                                                        <div className="text-xs text-indigo-600 font-bold">
                                                            {item.data.note || 'ללא הערה נוספת'}
                                                        </div>
                                                        <button type="button" onClick={() => removeSalaryRecord(item.id)} className="text-red-300 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-all">
                                                            <DeleteIcon className="w-4 h-4"/>
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Specialized Content for Audit Logs */}
                                                {isLog && item.data.changes?.map((change: any, cIdx: number) => (
                                                    <div key={cIdx} className="mt-2 text-[11px] bg-slate-50 p-2 rounded-lg flex flex-wrap gap-1 border border-slate-100 shadow-inner">
                                                        <span className="font-bold text-slate-500">{change.label}:</span>
                                                        <span className="line-through text-slate-300 mx-1">{String(change.oldValue)}</span>
                                                        <span className="text-slate-400">➔</span>
                                                        <span className="text-primary font-black mx-1">{String(change.newValue)}</span>
                                                    </div>
                                                ))}

                                                {/* Metadata */}
                                                {!isSalary && (
                                                    <div className="mt-3 text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                                                        עודכן ע"י: {item.data.user || 'מערכת'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {unifiedFeed.length === 0 && (
                                    <div className="text-center py-20 text-slate-300 italic">אין היסטוריה מתועדת לעובד זה</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex justify-end space-x-2 pt-4 space-x-reverse border-t mt-4">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 font-bold shadow-sm">שמירת נתונים</button>
                </div>
            </form>
        </div>
        </>
    );
};

const CertificateViewer: React.FC<{ 
    file: Attachment; 
    onClose: () => void 
}> = ({ file, onClose }) => {
    const isPdf = file.type === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    return (
        <Modal title={`אישור מחלה: ${file.fileName}`} onClose={onClose} size="4xl" zIndex={100}>
            <div className="flex flex-col h-[70vh]">
                <div className="flex-1 bg-slate-100 rounded overflow-hidden flex items-center justify-center p-2 relative">
                    {isImage ? (
                        <img src={file.dataUrl} alt="Sick Certificate" className="max-w-full max-h-full object-contain" />
                    ) : isPdf ? (
                        <iframe src={file.dataUrl} className="w-full h-full border-none bg-white" title="PDF Certificate" />
                    ) : (
                        <div className="text-center">
                            <p className="mb-4">לא ניתן להציג קובץ זה בתצוגה מקדימה.</p>
                            <a href={file.dataUrl} download={file.fileName} className="px-4 py-2 bg-primary text-white rounded font-bold">הורד קובץ</a>
                        </div>
                    )}
                </div>
                <div className="mt-4 flex justify-between items-center p-2 bg-slate-50 border rounded">
                    <span className="text-sm font-medium text-slate-500">{file.fileName}</span>
                    <a href={file.dataUrl} download={file.fileName} className="text-primary font-bold hover:underline flex items-center gap-1">
                        <DownloadIcon className="w-4 h-4"/> הורד
                    </a>
                </div>
            </div>
        </Modal>
    );
};

const EmployeesPage: React.FC<EmployeesPageProps> = ({ employees, setEmployees, addActivity, attendanceRecords, setAttendanceRecords }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [activeMainTab, setActiveMainTab] = useState<'LIST' | 'REQUESTS'>('LIST');
    const [searchTerm, setSearchTerm] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [viewingCertificate, setViewingCertificate] = useState<Attachment | null>(null);

    const pendingRequests = attendanceRecords.filter(r => r.status === 'PENDING_APPROVAL' && r.correctionRequest);

    const filteredEmployees = useMemo(() => {
        let result = employees;
        if (!showInactive) result = result.filter(e => e.status !== 'INACTIVE');
        if (searchTerm.trim()) {
            const lowTerm = searchTerm.toLowerCase();
            result = result.filter(e => e.name.toLowerCase().includes(lowTerm) || e.role.toLowerCase().includes(lowTerm) || e.idNumber?.includes(lowTerm));
        }
        return result;
    }, [employees, searchTerm, showInactive]);

    const handleAddEmployee = () => { setEditingEmployee(null); setIsModalOpen(true); };
    const handleEditEmployee = (employee: Employee) => { setEditingEmployee(employee); setIsModalOpen(true); };

    const handleSaveEmployee = (employee: Employee) => {
        if (editingEmployee) { setEmployees(prev => prev.map(e => e.id === employee.id ? employee : e)); addActivity(`עובד עודכן: ${employee.name}`, { entityType: 'employee', entityId: employee.id, action: 'update', metadata: { name: employee.name } }); }
        else { setEmployees(prev => [...prev, employee]); addActivity(`עובד חדש נוסף: ${employee.name}`, { entityType: 'employee', entityId: employee.id, action: 'create', metadata: { name: employee.name } }); }
        setIsModalOpen(false); setEditingEmployee(null);
    };

    const handleApproveRequest = (recordId: string, approve: boolean) => {
        setAttendanceRecords(prev => prev.map(record => {
            if (record.id !== recordId || !record.correctionRequest) return record;

            if (approve) {
                const start = record.correctionRequest.requestedClockIn;
                const end = record.correctionRequest.requestedClockOut;
                const reqStatus = record.correctionRequest.requestedStatus;
                
                const isLeave = reqStatus === 'VACATION' || reqStatus === 'SICK';
                const totalHours = isLeave ? 0 : (end.getTime() - start.getTime()) / (1000 * 60 * 60);

                const statusLabel = reqStatus === 'VACATION' ? 'חופשה' : reqStatus === 'SICK' ? 'מחלה' : reqStatus === 'WFH' ? 'עבודה מהבית' : 'תיקון שעות';

                return {
                    ...record,
                    clockIn: isLeave ? undefined : start, 
                    clockOut: isLeave ? undefined : end, 
                    totalHours: Math.max(0, totalHours),
                    status: reqStatus || 'PRESENT',
                    certificate: record.correctionRequest.certificate || record.certificate,
                    note: `${record.note ? record.note + ' | ' : ''}אושר ${statusLabel}: ${record.correctionRequest.reason}`,
                    correctionRequest: undefined
                };
            } else {
                return {
                    ...record,
                    status: 'REJECTED',
                    note: `${record.note ? record.note + ' | ' : ''}בקשת תיקון נדחתה`
                };
            }
        }));
        addActivity(approve ? 'אושרה בקשת תיקון שעות/היעדרות' : 'נדחתה בקשת תיקון שעות/היעדרות');
    };

    return (
        <div>
            {viewingCertificate && <CertificateViewer file={viewingCertificate} onClose={() => setViewingCertificate(null)} />}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex space-x-4 space-x-reverse">
                    <button onClick={() => setActiveMainTab('LIST')} className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeMainTab === 'LIST' ? 'bg-white shadow text-primary' : 'text-slate-500 hover:bg-slate-100'}`}>רשימת עובדים</button>
                    <button onClick={() => setActiveMainTab('REQUESTS')} className={`px-4 py-2 rounded-lg font-medium transition-colors relative ${activeMainTab === 'REQUESTS' ? 'bg-white shadow text-primary' : 'text-slate-500 hover:bg-slate-100'}`}>
                        בקשות לתיקון נוכחות
                        {pendingRequests.length > 0 && (<span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">{pendingRequests.length}</span>)}
                    </button>
                </div>
                {activeMainTab === 'LIST' && (
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <button onClick={() => setShowInactive(!showInactive)} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${showInactive ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-500 border-slate-300'}`}>{showInactive ? 'הסתר לא פעילים' : 'הצג ארכיון עובדים'}</button>
                        <div className="relative flex-1 md:w-64"><input type="text" placeholder="חיפוש עובד..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-primary focus:border-primary text-sm shadow-sm" /><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div></div>
                        <button onClick={handleAddEmployee} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md font-bold"><PlusIcon className="h-5 w-5 me-2" /> עובד חדש</button>
                    </div>
                )}
            </div>

            {activeMainTab === 'LIST' && (
                <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-start">
                            <thead className="bg-slate-50">
                                <tr><th className="px-6 py-4 text-start text-[10px] font-black text-slate-400 uppercase tracking-widest">עובד / תפקיד</th><th className="px-6 py-4 text-start text-[10px] font-black text-slate-400 uppercase tracking-widest">תאריך הצטרפות</th><th className="px-6 py-4 text-start text-[10px] font-black text-slate-400 uppercase tracking-widest">סוג שכר</th><th className="px-6 py-4 text-start text-[10px] font-black text-slate-400 uppercase tracking-widest">ברוטו / שעתי</th><th className="px-6 py-4 text-start text-[10px] font-black text-slate-400 uppercase tracking-widest">סטטוס</th><th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">פעולות</th></tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                                {filteredEmployees.map(employee => (
                                    <tr key={employee.id} className={`hover:bg-slate-50 transition-colors group ${employee.status === 'INACTIVE' ? 'opacity-60 bg-slate-50/50' : ''}`}>
                                        <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center"><div className={`w-1.5 h-10 rounded-full me-3 ${employee.status === 'INACTIVE' ? 'bg-slate-400' : employee.roleType === 'ADMIN' ? 'bg-purple-600' : employee.roleType === 'MANAGER' ? 'bg-blue-500' : 'bg-emerald-400'}`}></div><div><div className="text-sm font-black text-slate-900">{employee.name}</div><div className="text-[11px] text-slate-400 font-bold">{employee.role}</div></div></div></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-medium">{employee.startDate ? new Date(employee.startDate).toLocaleDateString('he-IL') : '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap"><span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-tight ${employee.salaryType === 'GLOBAL' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{employee.salaryType === 'GLOBAL' ? 'גלובלי' : 'שעתי'}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-slate-700">₪{employee.salaryType === 'GLOBAL' ? (employee.monthlyBaseSalary || 0).toLocaleString() : employee.hourlyWage}</td>
                                        <td className="px-6 py-4 whitespace-nowrap"><span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest ${employee.status === 'ACTIVE' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>{employee.status === 'ACTIVE' ? 'פעיל' : 'לא פעיל'}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center"><div className="flex justify-center gap-2"><button onClick={() => handleEditEmployee(employee)} className="p-2 bg-indigo-50 text-primary hover:bg-primary hover:text-white rounded-lg transition-all shadow-sm" title="כרטיס עובד"><EditIcon className="w-4 h-4"/></button></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeMainTab === 'REQUESTS' && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    {pendingRequests.length === 0 ? (<div className="p-10 text-center text-slate-500"><ClockIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>אין בקשות ממתינות לאישור.</p></div>) : (
                        <div className="divide-y divide-slate-100">
                            {pendingRequests.map(req => {
                                const emp = employees.find(e => e.id === req.employeeId);
                                if (!req.correctionRequest) return null;
                                
                                const reqType = req.correctionRequest.requestedStatus;
                                const isLeave = reqType === 'VACATION' || reqType === 'SICK';
                                const isWfh = reqType === 'WFH';
                                const requestCertificate = req.correctionRequest.certificate;
                                
                                const originalStart = req.clockIn ? req.clockIn.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '-';
                                const originalEnd = req.clockOut ? req.clockOut.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '-';
                                const newStart = req.correctionRequest.requestedClockIn.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
                                const newEnd = req.correctionRequest.requestedClockOut.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
                                
                                return (
                                    <div key={req.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-800">{emp?.name}</span>
                                                <span className="text-sm text-slate-500">{req.date.toLocaleDateString('he-IL')}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${reqType === 'VACATION' ? 'bg-amber-100 text-amber-800' : reqType === 'SICK' ? 'bg-rose-100 text-rose-800' : isWfh ? 'bg-indigo-100 text-indigo-800' : 'bg-blue-100 text-blue-800'}`}>
                                                    {reqType === 'VACATION' ? 'בקשת חופשה' : reqType === 'SICK' ? 'בקשת מחלה' : isWfh ? 'עבודה מהבית' : 'תיקון שעות'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-600 mt-1"><span className="font-medium">סיבה:</span> {req.correctionRequest.reason}</p>
                                            <div className="flex items-center gap-4 mt-2 text-sm bg-slate-50 p-2 rounded border border-slate-200">
                                                {!isLeave ? (
                                                    <>
                                                        <div><span className="block text-xs text-slate-400">מקור</span><span className="line-through text-slate-500">{originalStart} - {originalEnd}</span></div>
                                                        <div className="text-slate-400">➔</div>
                                                        <div><span className="block text-xs text-green-600 font-bold">מבוקש</span><span className="font-bold text-slate-800">{newStart} - {newEnd}</span></div>
                                                        {isWfh && <div className="border-r border-slate-300 pr-4 mr-2"><span className="block text-xs text-indigo-500 font-bold">מיקום</span><span className="font-bold text-indigo-700">🏠 מהבית</span></div>}
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-4 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <ClockIcon className="w-4 h-4 text-slate-400"/>
                                                            <span className="font-medium text-slate-700">היעדרות מלאה מהעבודה</span>
                                                        </div>
                                                        {requestCertificate && (
                                                            <button 
                                                                onClick={() => setViewingCertificate(requestCertificate)}
                                                                className="flex items-center gap-2 bg-rose-100 text-rose-700 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-rose-200 transition-colors border border-rose-200"
                                                            >
                                                                📄 צפה באישור מחלה
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 self-end md:self-center">
                                            <button onClick={() => handleApproveRequest(req.id, false)} className="px-3 py-1.5 bg-red-50 text-red-700 rounded hover:bg-red-100 text-sm font-medium">דחה</button>
                                            <button onClick={() => handleApproveRequest(req.id, true)} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium shadow-sm">אשר בקשה</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {isModalOpen && (<Modal title={editingEmployee ? `ניהול כרטיס עובד: ${editingEmployee.name}` : "הקמת עובד חדש"} onClose={() => setIsModalOpen(false)} size="4xl"><EmployeeForm employee={editingEmployee} allEmployees={employees} onSave={handleSaveEmployee} onCancel={() => setIsModalOpen(false)} /></Modal>)}
        </div>
    );
};

export default EmployeesPage;
