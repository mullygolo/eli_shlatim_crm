
import React, { useState, useEffect, useMemo } from 'react';
import { Employee, AttendanceRecord, Order, OrderStatusConfiguration } from '../types';
import { ClockIcon, EditIcon, PlusIcon, ImportIcon } from './icons';
import Modal from './Modal';
import { calculateOrderTotals } from '../utils/calculations';
import { getJewishHoliday } from '../utils/holidays';

interface AttendancePageProps {
    employees: Employee[];
    records: AttendanceRecord[];
    setRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
    orders: Order[];
    statusConfigs: OrderStatusConfiguration[];
}

// --- Helpers ---

// Helper to convert decimal hours (e.g., 10.62) to HH:MM (e.g., 10:37)
const formatDecimalHoursToTime = (decimalHours: number): string => {
    if (!decimalHours || isNaN(decimalHours)) return "0:00";
    
    const totalMinutes = Math.round(decimalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

// Native Hebrew Date Formatter
const formatHebrewDate = (date: Date) => {
    return new Intl.DateTimeFormat('he-IL', { calendar: 'hebrew', day: 'numeric', month: 'long' }).format(date);
};

const getDaysInMonth = (month: number, year: number) => {
    const date = new Date(year, month - 1, 1);
    const days: Date[] = [];
    while (date.getMonth() === month - 1) {
        days.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return days;
};

const exportToCSV = (filename: string, rows: any[][]) => {
    const processRow = (row: any[]) => {
        return row.map(val => {
            if (val === null || val === undefined) return '';
            let result = val.toString();
            if (val instanceof Date) result = val.toLocaleString('he-IL');
            result = result.replace(/"/g, '""');
            if (result.search(/("|,|\n)/g) >= 0) result = `"${result}"`;
            return result;
        }).join(',');
    };

    const csvContent = '\uFEFF' + rows.map(processRow).join('\n'); // Add BOM for Hebrew Excel support
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// Correction Request Modal
const CorrectionRequestModal: React.FC<{ 
    date: Date;
    record?: AttendanceRecord; 
    onClose: () => void; 
    onSubmit: (data: any) => void 
}> = ({ date, record, onClose, onSubmit }) => {
    const [start, setStart] = useState(record?.clockIn ? new Date(record.clockIn).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '09:00');
    const [end, setEnd] = useState(record?.clockOut ? new Date(record.clockOut).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '17:00');
    const [breakMins, setBreakMins] = useState(record?.breakDurationMinutes || 0);
    const [reason, setReason] = useState('');

    const handleSubmit = () => {
        if (!reason) { alert("חובה לפרט סיבה לשינוי/הוספה"); return; }
        onSubmit({ start, end, breakMins, reason });
    };

    return (
        <Modal title={record ? "תיקון דיווח קיים" : "דיווח חוסר / הוספה ידנית"} onClose={onClose} size="lg">
            <div className="space-y-4 text-start">
                <div className="bg-blue-50 p-3 rounded border border-blue-100">
                    <p className="text-sm text-blue-800 font-bold">
                        {date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-xs text-blue-600">{formatHebrewDate(date)}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">כניסה</label>
                        <input type="time" value={start} onChange={e => setStart(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">יציאה</label>
                        <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">זמן הפסקה (דקות)</label>
                        <input type="number" value={breakMins} onChange={e => setBreakMins(Number(e.target.value))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">סיבה לבקשה</label>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary" rows={3} placeholder="לדוג': שכחתי להחתים, הייתי בחופש, מחלה..." />
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100 mt-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md me-2">ביטול</button>
                    <button onClick={handleSubmit} className="bg-primary text-white px-4 py-2 rounded-md hover:bg-indigo-700 shadow-sm">שלח לאישור</button>
                </div>
            </div>
        </Modal>
    );
};

const AttendancePage: React.FC<AttendancePageProps> = ({ employees, records, setRecords, orders, statusConfigs }) => {
    const [currentEmployeeId, setCurrentEmployeeId] = useState<string>(employees[0]?.id || '');
    const [activeTab, setActiveTab] = useState<'MY_PORTAL' | 'ADMIN_DASHBOARD'>('MY_PORTAL');
    
    // Filters (Shared for My Portal History and Admin)
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    
    // Correction State
    const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
    const [selectedDateForCorrection, setSelectedDateForCorrection] = useState<Date | null>(null);
    const [recordForCorrection, setRecordForCorrection] = useState<AttendanceRecord | undefined>(undefined);

    // Live Clock
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const currentEmployee = employees.find(e => e.id === currentEmployeeId);
    const isManager = currentEmployee?.roleType === 'ADMIN' || currentEmployee?.roleType === 'MANAGER';

    // --- Logic: Clock In/Out (Multiple Shifts Support) ---
    
    const todaysRecords = useMemo(() => {
        const todayStr = new Date().toDateString();
        return records
            .filter(r => r.employeeId === currentEmployeeId && new Date(r.date).toDateString() === todayStr)
            .sort((a, b) => new Date(a.clockIn || 0).getTime() - new Date(b.clockIn || 0).getTime());
    }, [records, currentEmployeeId]);

    const lastRecord = todaysRecords.length > 0 ? todaysRecords[todaysRecords.length - 1] : null;
    const isClockedIn = lastRecord && !lastRecord.clockOut;

    const handleClockAction = (action: 'IN' | 'OUT') => {
        const now = new Date();
        
        if (action === 'IN') {
            // Only allow clock in if no records exist OR last record is closed
            if (lastRecord && !lastRecord.clockOut) {
                alert("יש לסגור משמרת קודמת לפני פתיחת חדשה.");
                return;
            }

            const newRecord: AttendanceRecord = {
                id: `att_${Date.now()}`,
                employeeId: currentEmployeeId,
                date: now,
                clockIn: now,
                breakDurationMinutes: 0,
                totalHours: 0,
                status: 'PRESENT',
            };
            setRecords(prev => [...prev, newRecord]);
        } else {
            // Clock Out
            if (!lastRecord || lastRecord.clockOut) return;
            
            const updatedRecord = { ...lastRecord, clockOut: now };
            if (updatedRecord.clockIn) {
                const durationMs = now.getTime() - new Date(updatedRecord.clockIn).getTime();
                updatedRecord.totalHours = Math.max(0, (durationMs / (1000 * 60 * 60)) - (updatedRecord.breakDurationMinutes / 60));
            }
            
            setRecords(prev => prev.map(r => r.id === lastRecord.id ? updatedRecord : r));
        }
    };

    // --- Logic: Correction Request ---

    const openCorrectionModal = (date: Date, record?: AttendanceRecord) => {
        setSelectedDateForCorrection(date);
        setRecordForCorrection(record);
        setCorrectionModalOpen(true);
    };

    const handleCorrectionSubmit = (data: any) => {
        if (!selectedDateForCorrection) return;

        // Parse times relative to the selected date
        const [startH, startM] = data.start.split(':');
        const [endH, endM] = data.end.split(':');
        
        const reqIn = new Date(selectedDateForCorrection); 
        reqIn.setHours(parseInt(startH), parseInt(startM), 0, 0);
        
        const reqOut = new Date(selectedDateForCorrection); 
        reqOut.setHours(parseInt(endH), parseInt(endM), 0, 0);

        if (recordForCorrection) {
            // Updating existing record
            const updatedRecord: AttendanceRecord = {
                ...recordForCorrection,
                status: 'PENDING_APPROVAL',
                correctionRequest: {
                    requestedClockIn: reqIn,
                    requestedClockOut: reqOut,
                    requestedBreak: data.breakMins,
                    reason: data.reason
                }
            };
            setRecords(prev => prev.map(r => r.id === recordForCorrection.id ? updatedRecord : r));
        } else {
            // Creating new record for missing day/time
            const newRecord: AttendanceRecord = {
                id: `att_req_${Date.now()}`,
                employeeId: currentEmployeeId,
                date: selectedDateForCorrection,
                clockIn: reqIn, // Use requested time as placeholder display
                clockOut: reqOut,
                breakDurationMinutes: data.breakMins,
                totalHours: 0, // 0 until approved
                status: 'PENDING_APPROVAL',
                note: 'נוצר ידנית ע"י עובד',
                correctionRequest: {
                    requestedClockIn: reqIn,
                    requestedClockOut: reqOut,
                    requestedBreak: data.breakMins,
                    reason: data.reason
                }
            };
            setRecords(prev => [...prev, newRecord]);
        }
        
        setCorrectionModalOpen(false);
        setRecordForCorrection(undefined);
    };

    // --- Logic: Stats & Export ---

    const getMonthlyStats = (empId: string, month: number, year: number) => {
        const empRecords = records.filter(r => {
            const d = new Date(r.date);
            return r.employeeId === empId && d.getMonth() + 1 === month && d.getFullYear() === year;
        });

        // Calculate unique work days (presence)
        const uniqueDays = new Set(empRecords
            .filter(r => r.status === 'PRESENT')
            .map(r => new Date(r.date).toDateString())
        );
        const workDays = uniqueDays.size;

        // Calculate hours (use requested hours if pending approval for display? No, usually 0 until approved)
        const totalHours = empRecords.reduce((sum, r) => {
            // If approved/present, use calculated totalHours. 
            return sum + (r.status === 'PRESENT' ? r.totalHours : 0);
        }, 0);

        const emp = employees.find(e => e.id === empId);
        if (!emp) return { totalHours: 0, baseSalary: 0, bonus: 0, totalGross: 0, employerCost: 0, workDays: 0 };

        const baseSalary = totalHours * emp.hourlyWage;
        
        // Calculate Bonus (Includes Team/Group logic)
        let bonus = 0;
        if (emp.hasSalesBonus) {
            // Identify target employee IDs for bonus calculation (Team or Self)
            const targetEmployeeIds = emp.bonusBasisEmployeeIds && emp.bonusBasisEmployeeIds.length > 0 
                ? emp.bonusBasisEmployeeIds 
                : [emp.id]; // Default to self if empty

            const relevantOrders = orders.filter(o => {
                const d = new Date(o.dealStartDate || o.date);
                const isWon = statusConfigs.find(c => c.label === o.orderStatus)?.isActiveDeal; 
                
                // Check if order belongs to any of the target employees (Team/Self)
                const belongsToTeam = targetEmployeeIds.includes(o.employeeId);

                // Payment must be PAID
                return belongsToTeam && 
                       d.getMonth() + 1 === month && 
                       d.getFullYear() === year &&
                       isWon && 
                       o.paymentStatus === 'שולם'; 
            });
            
            const totalSales = relevantOrders.reduce((sum, o) => sum + calculateOrderTotals(o).totalAmount, 0);
            bonus = totalSales * (emp.salesBonusPercentage / 100);
        }

        const totalGross = baseSalary + bonus;
        const employerCost = totalGross * (1 + emp.employerCostPercentage / 100);

        return { totalHours, baseSalary, bonus, totalGross, employerCost, workDays };
    };

    const handleExportExcel = () => {
        const days = getDaysInMonth(selectedMonth, selectedYear);
        const header = ["תאריך", "יום בשבוע", "תאריך עברי", "כניסה", "יציאה", "הפסקה (דק')", 'סה"כ שעות', "סטטוס", "הערות"];
        
        const dataRows: any[][] = [];
        
        days.forEach(day => {
            const dayStr = day.toDateString();
            const dayRecords = records.filter(r => r.employeeId === currentEmployeeId && new Date(r.date).toDateString() === dayStr);
            
            if (dayRecords.length === 0) {
                dataRows.push([
                    day.toLocaleDateString('he-IL'),
                    day.toLocaleDateString('he-IL', { weekday: 'long' }),
                    formatHebrewDate(day),
                    '-', '-', '-', '0:00', 'חסר', ''
                ]);
            } else {
                dayRecords.forEach(r => {
                    dataRows.push([
                        new Date(r.date).toLocaleDateString('he-IL'),
                        new Date(r.date).toLocaleDateString('he-IL', { weekday: 'long' }),
                        formatHebrewDate(new Date(r.date)),
                        r.clockIn ? new Date(r.clockIn).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '',
                        r.clockOut ? new Date(r.clockOut).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '',
                        r.breakDurationMinutes,
                        formatDecimalHoursToTime(r.totalHours),
                        r.status === 'PENDING_APPROVAL' ? 'ממתין לאישור' : r.status === 'PRESENT' ? 'אושר/נוכח' : r.status,
                        r.note || (r.correctionRequest ? `בקשת תיקון: ${r.correctionRequest.reason}` : '')
                    ]);
                });
            }
        });

        exportToCSV(`Attendance_Report_${currentEmployee?.name}_${selectedMonth}_${selectedYear}.csv`, [header, ...dataRows]);
    };

    // --- Views ---

    const renderMyPortal = () => {
        const stats = getMonthlyStats(currentEmployeeId, selectedMonth, selectedYear);
        const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);

        return (
            <div className="space-y-6 pb-10">
                {/* Top Stats & Clock (Only show Clock if viewing CURRENT month) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Clock Widget */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-6 relative overflow-hidden">
                        <div className="text-center sm:text-start z-10">
                            <h2 className="text-2xl font-bold text-slate-800 mb-1">שלום, {currentEmployee?.name}</h2>
                            <p className="text-slate-500">{currentTime.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            <p className="text-4xl font-mono font-bold text-primary mt-2 tracking-wider">
                                {currentTime.toLocaleTimeString('he-IL')}
                            </p>
                        </div>

                        <div className="flex items-center gap-4 z-10">
                            {!isClockedIn ? (
                                <button 
                                    onClick={() => handleClockAction('IN')}
                                    className="w-32 h-32 rounded-full flex flex-col items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 bg-green-600 text-white hover:bg-green-700 border-4 border-green-100"
                                >
                                    <ClockIcon className="w-8 h-8 mb-1" />
                                    <span className="font-bold text-lg">כניסה</span>
                                    {lastRecord && lastRecord.clockOut && <span className="text-[10px] opacity-80 font-normal">(משמרת נוספת)</span>}
                                </button>
                            ) : (
                                <button 
                                    onClick={() => handleClockAction('OUT')}
                                    className="w-32 h-32 rounded-full flex flex-col items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 bg-red-500 text-white hover:bg-red-600 border-4 border-red-100"
                                >
                                    <ClockIcon className="w-8 h-8 mb-1" />
                                    <span className="font-bold text-lg">יציאה</span>
                                </button>
                            )}
                        </div>
                        
                        {/* Background decoration */}
                        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none"></div>
                    </div>

                    {/* Monthly Summary Card */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-700">סיכום חודשי</h3>
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold">
                                {selectedMonth}/{selectedYear}
                            </span>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                <span className="text-slate-500 text-sm">ימי עבודה</span>
                                <span className="font-bold text-xl text-indigo-600">{stats.workDays}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                <span className="text-slate-500 text-sm">שעות בפועל</span>
                                <span className="font-bold text-xl text-slate-800">{formatDecimalHoursToTime(stats.totalHours)}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                <span className="text-slate-500 text-sm">שכר בסיס</span>
                                <span className="font-bold text-lg text-slate-800">₪{stats.baseSalary.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                <span className="text-slate-500 text-sm">בונוס מכירות</span>
                                <span className="font-bold text-lg text-green-600">₪{stats.bonus.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                                <span className="text-slate-800 font-bold text-sm">סה"כ ברוטו (משוער)</span>
                                <span className="font-black text-xl text-primary">₪{stats.totalGross.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters & Actions Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-500">שנה:</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="text-sm border-slate-300 rounded-md py-1 pe-8">
                                {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-500">חודש:</label>
                            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="text-sm border-slate-300 rounded-md py-1 pe-8">
                                {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(0, m-1).toLocaleString('he-IL', {month: 'long'})}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-white border border-green-600 text-green-700 rounded-md text-sm font-medium hover:bg-green-50 transition-colors w-full sm:w-auto justify-center">
                        <ImportIcon className="w-4 h-4 transform rotate-180" /> {/* Reusing import icon as export for now */}
                        הורד דוח שעות (Excel)
                    </button>
                </div>

                {/* Full Month Calendar Table */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-right">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                                <tr>
                                    <th className="px-4 py-3 border-b">תאריך</th>
                                    <th className="px-4 py-3 border-b">יום</th>
                                    <th className="px-4 py-3 border-b">כניסה</th>
                                    <th className="px-4 py-3 border-b">יציאה</th>
                                    <th className="px-4 py-3 border-b">הפסקה</th>
                                    <th className="px-4 py-3 border-b">סה"כ</th>
                                    <th className="px-4 py-3 border-b">סטטוס</th>
                                    <th className="px-4 py-3 border-b">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {daysInMonth.map((date) => {
                                    const dateKey = date.toDateString();
                                    const holiday = getJewishHoliday(date);
                                    
                                    // Find all records for this day
                                    const dayRecords = records
                                        .filter(r => r.employeeId === currentEmployeeId && new Date(r.date).toDateString() === dateKey)
                                        .sort((a, b) => new Date(a.clockIn || 0).getTime() - new Date(b.clockIn || 0).getTime());

                                    const isWeekend = date.getDay() === 5 || date.getDay() === 6; // Fri/Sat
                                    const isFuture = date > new Date();
                                    const hasRecords = dayRecords.length > 0;

                                    if (!hasRecords) {
                                        if (isFuture) return null; // Don't show future empty days
                                        return (
                                            <tr key={dateKey} className={`hover:bg-slate-50 ${holiday ? 'bg-purple-50/50' : isWeekend ? 'bg-slate-50/50' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div>
                                                            <span className="font-medium text-slate-700">{date.toLocaleDateString('he-IL')}</span>
                                                            <span className="block text-xs text-slate-400">{formatHebrewDate(date)}</span>
                                                        </div>
                                                        {holiday && (
                                                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200 whitespace-nowrap" title={holiday}>
                                                                🎉 {holiday}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">{date.toLocaleDateString('he-IL', { weekday: 'long' })}</td>
                                                <td className="px-4 py-3 text-slate-300">-</td>
                                                <td className="px-4 py-3 text-slate-300">-</td>
                                                <td className="px-4 py-3 text-slate-300">-</td>
                                                <td className="px-4 py-3 text-slate-300">0:00</td>
                                                <td className="px-4 py-3"><span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">חסר</span></td>
                                                <td className="px-4 py-3">
                                                    <button onClick={() => openCorrectionModal(date)} className="text-primary hover:underline text-xs font-medium flex items-center gap-1">
                                                        <PlusIcon className="w-3 h-3"/> השלם חוסר
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return dayRecords.map((record, idx) => (
                                        <tr key={record.id} className={`hover:bg-slate-50 ${record.status === 'PENDING_APPROVAL' ? 'bg-orange-50/60' : holiday ? 'bg-purple-50/30' : ''}`}>
                                            <td className="px-4 py-3">
                                                {idx === 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <div>
                                                            <span className="font-medium text-slate-700">{date.toLocaleDateString('he-IL')}</span>
                                                            <span className="block text-xs text-slate-400">{formatHebrewDate(date)}</span>
                                                        </div>
                                                        {holiday && (
                                                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200 whitespace-nowrap" title={holiday}>
                                                                🎉 {holiday}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {idx === 0 && date.toLocaleDateString('he-IL', { weekday: 'long' })}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-slate-700">
                                                {record.clockIn ? new Date(record.clockIn).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '-'}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-slate-700">
                                                {record.clockOut ? new Date(record.clockOut).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : 
                                                 (record.status === 'PRESENT' ? <span className="text-green-600 text-xs animate-pulse">פעיל...</span> : '-')
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{record.breakDurationMinutes > 0 ? `${record.breakDurationMinutes} ד'` : '-'}</td>
                                            <td className="px-4 py-3 font-bold text-slate-800">{formatDecimalHoursToTime(record.totalHours)}</td>
                                            <td className="px-4 py-3">
                                                {record.status === 'PENDING_APPROVAL' ? (
                                                    <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full whitespace-nowrap">ממתין לאישור</span>
                                                ) : record.status === 'REJECTED' ? (
                                                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">נדחה</span>
                                                ) : (
                                                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">תקין</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {record.status !== 'PENDING_APPROVAL' && (
                                                    <button onClick={() => openCorrectionModal(date, record)} className="text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors" title="בקש תיקון שעות">
                                                        <EditIcon className="w-4 h-4"/>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ));
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const renderAdminDashboard = () => {
        const allMonthlyStats = employees.map(e => ({
            ...e,
            ...getMonthlyStats(e.id, selectedMonth, selectedYear)
        }));

        const totalCompanyCost = allMonthlyStats.reduce((sum, s) => sum + s.employerCost, 0);

        return (
            <div className="space-y-6">
                {/* Filter Bar */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between">
                    <div className="flex gap-4">
                        <div>
                            <label className="block text-sm text-slate-600 mb-1">חודש</label>
                            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="border p-2 rounded w-32">
                                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-600 mb-1">שנה</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="border p-2 rounded w-32">
                                {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="bg-slate-800 text-white px-6 py-3 rounded-lg shadow">
                        <span className="block text-xs opacity-75">סה"כ עלות מעביד (חודשי)</span>
                        <span className="text-xl font-bold">₪{totalCompanyCost.toLocaleString()}</span>
                    </div>
                </div>

                {/* Summary Table */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
                    <table className="min-w-full text-sm text-right">
                        <thead className="bg-slate-50 text-slate-600 font-bold">
                            <tr>
                                <th className="px-4 py-3">שם העובד</th>
                                <th className="px-4 py-3">תפקיד</th>
                                <th className="px-4 py-3">ימי עבודה</th>
                                <th className="px-4 py-3">שעות</th>
                                <th className="px-4 py-3">שכר בסיס</th>
                                <th className="px-4 py-3">בונוס מכירות</th>
                                <th className="px-4 py-3">ברוטו משוער</th>
                                <th className="px-4 py-3">עלות מעביד</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {allMonthlyStats.map(stat => (
                                <tr key={stat.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{stat.name}</td>
                                    <td className="px-4 py-3 text-slate-500">{stat.role}</td>
                                    <td className="px-4 py-3 text-indigo-600 font-bold">{stat.workDays}</td>
                                    <td className="px-4 py-3 font-mono">{formatDecimalHoursToTime(stat.totalHours)}</td>
                                    <td className="px-4 py-3">₪{stat.baseSalary.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-green-600">₪{stat.bonus.toLocaleString()}</td>
                                    <td className="px-4 py-3 font-bold text-primary">₪{stat.totalGross.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-slate-500 font-bold">₪{stat.employerCost.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div>
            {/* Top Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex space-x-1 space-x-reverse w-full sm:w-auto bg-slate-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('MY_PORTAL')} 
                        className={`flex-1 sm:flex-none px-6 py-2 rounded-md font-medium transition-all text-sm ${activeTab === 'MY_PORTAL' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        הנוכחות שלי
                    </button>
                    {isManager && (
                        <button 
                            onClick={() => setActiveTab('ADMIN_DASHBOARD')} 
                            className={`flex-1 sm:flex-none px-6 py-2 rounded-md font-medium transition-all text-sm ${activeTab === 'ADMIN_DASHBOARD' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            דוחות שכר (מנהל)
                        </button>
                    )}
                </div>
                
                {/* User Switcher for Demo Purposes */}
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <span className="text-xs text-slate-400 ps-2 font-medium">מציג כ:</span>
                    <select 
                        value={currentEmployeeId} 
                        onChange={(e) => setCurrentEmployeeId(e.target.value)}
                        className="text-sm border-none focus:ring-0 py-1 pe-8 font-bold text-slate-700 bg-transparent"
                    >
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.roleType === 'ADMIN' ? 'מנהל' : 'עובד'})</option>)}
                    </select>
                </div>
            </div>

            {activeTab === 'MY_PORTAL' ? renderMyPortal() : renderAdminDashboard()}

            {correctionModalOpen && selectedDateForCorrection && (
                <CorrectionRequestModal 
                    date={selectedDateForCorrection}
                    record={recordForCorrection}
                    onClose={() => setCorrectionModalOpen(false)} 
                    onSubmit={handleCorrectionSubmit} 
                />
            )}
        </div>
    );
};

export default AttendancePage;
