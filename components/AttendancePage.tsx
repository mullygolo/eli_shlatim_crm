
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Employee, AttendanceRecord, Order, OrderStatusConfiguration, AttendanceStatus, PaymentMethod, Attachment, PayrollOverrideMap } from '../types';
import { ClockIcon, EditIcon, PlusIcon, ImportIcon, DownloadIcon } from './icons';
import Modal from './Modal';
import { calculateOrderTotals, getEmployeeSalaryAtDate } from '../utils/calculations';
import { getJewishHoliday } from '../utils/holidays';
import { useAuth } from '../contexts/AuthContext';
import * as mongoService from '../services/mongoService';
import { getDateStringForComparison, getDateStringIsrael } from '../utils/timezone';

interface AttendancePageProps {
    employees: Employee[];
    records: AttendanceRecord[];
    setRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
    orders: Order[];
    statusConfigs: OrderStatusConfiguration[];
    payrollOverrides: PayrollOverrideMap;
    setPayrollOverrides: React.Dispatch<React.SetStateAction<PayrollOverrideMap>>;
    onAttendanceMutationBusy?: (busy: boolean) => void;
}

// --- Helpers ---

const formatDecimalHoursToTime = (decimalHours: number): string => {
    if (!decimalHours || isNaN(decimalHours)) return "0:00";
    const totalMinutes = Math.round(decimalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

// Helper for live cumulative timer (HH:mm:ss)
const formatMsToHMS = (ms: number): string => {
    if (ms < 0) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const getGematriaDay = (day: number): string => {
    if (day === 15) return 'ט"ו';
    if (day === 16) return 'ט"ז';
    
    const units = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    const tens = ["", "י", "כ", "ל"];
    
    const t = Math.floor(day / 10);
    const u = day % 10;
    
    const str = tens[t] + units[u];
    if (str.length === 1) return str + "'";
    return str.slice(0, -1) + '"' + str.slice(-1);
};

const HEBREW_MONTHS_MAP: Record<string, string> = {
    'תשרי': 'תשרי',
    'חשון': 'חשוון',
    'חשוון': 'חשוון',
    'מרחשון': 'חשוון',
    'מרחשוון': 'חשוון',
    'כסלו': 'כסלו',
    'כסלב': 'כסלו',
    'טבת': 'טבת',
    'שבט': 'שבט',
    'אדר': 'אדר',
    'אדר א': "אדר א'",
    'אדר b': "אדר ב'",
    'ניסן': 'ניסן',
    'אייר': 'אייר',
    'סיון': 'סיוון',
    'סיוון': 'סיוון',
    'תמוז': 'תמוז',
    'אב': 'אב',
    'אלול': 'אלול'
};

const formatHebrewDate = (date: Date) => {
    try {
        const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { 
            day: 'numeric', 
            month: 'long' 
        }).formatToParts(date);
        
        const dayStr = parts.find(p => p.type === 'day')?.value;
        const monthStr = parts.find(p => p.type === 'month')?.value;
        
        if (!dayStr || !monthStr) return '';
        
        const dayNum = parseInt(dayStr, 10);
        const gematriaDay = getGematriaDay(dayNum);
        const normalizedMonth = HEBREW_MONTHS_MAP[monthStr] || monthStr;
        
        return `${gematriaDay} ב${normalizedMonth}`;
    } catch (e) {
        return date.toLocaleDateString('he-IL');
    }
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

    const csvContent = '\uFEFF' + rows.map(processRow).join('\n');
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

// Component for viewing certificates
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

// Correction Request Modal
const CorrectionRequestModal: React.FC<{ 
    date: Date;
    record?: AttendanceRecord; 
    onClose: () => void; 
    onSubmit: (data: any) => void 
}> = ({ date, record, onClose, onSubmit }) => {
    const isFuture = date > new Date();
    const [reportType, setReportType] = useState<'PRESENT' | 'VACATION' | 'SICK'>(
        isFuture ? 'VACATION' : 'PRESENT'
    );
    const [isWFH, setIsWFH] = useState(record?.status === 'WFH');
    const [start, setStart] = useState(record?.clockIn ? new Date(record.clockIn).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '09:00');
    const [end, setEnd] = useState(record?.clockOut ? new Date(record.clockOut).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '17:00');
    const [reason, setReason] = useState('');
    const [certificate, setCertificate] = useState<Attachment | undefined>(record?.certificate);
    const [error, setError] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setCertificate({
                        id: `cert_${Date.now()}`,
                        fileName: file.name,
                        dataUrl: event.target.result as string,
                        type: file.type,
                    });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = () => {
        if (!reason.trim()) { 
            setError("חובה למלא סיבה לבקשה"); 
            return; 
        }
        const finalStatus = reportType === 'PRESENT' && isWFH ? 'WFH' : reportType;
        onSubmit({ start, end, reason, reportType: finalStatus, certificate });
    };

    return (
        <Modal title={record ? "תיקון דיווח קיים" : "דיווח חוסר / תכנון חופשה"} onClose={onClose} size="lg">
            <div className="space-y-4 text-start">
                <div className="bg-blue-50 p-3 rounded border border-blue-100">
                    <p className="text-sm text-blue-800 font-bold">
                        {date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-xs text-blue-600">{formatHebrewDate(date)}</p>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">סוג הדיווח</label>
                    <div className="flex gap-2">
                        {!isFuture && (
                            <button 
                                onClick={() => setReportType('PRESENT')} 
                                className={`flex-1 py-2 px-3 rounded-md border text-sm font-bold transition-all ${reportType === 'PRESENT' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                            >
                                נוכחות
                            </button>
                        )}
                        <button 
                            onClick={() => setReportType('VACATION')} 
                            className={`flex-1 py-2 px-3 rounded-md border text-sm font-bold transition-all ${reportType === 'VACATION' ? 'bg-amber-500 text-white border-amber-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                        >
                            חופשה
                        </button>
                        <button 
                            onClick={() => setReportType('SICK')} 
                            className={`flex-1 py-2 px-3 rounded-md border text-sm font-bold transition-all ${reportType === 'SICK' ? 'bg-rose-500 text-white border-rose-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                        >
                            מחלה
                        </button>
                    </div>
                </div>
                
                {reportType === 'PRESENT' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                            <input 
                                type="checkbox" 
                                id="modalWfhToggle" 
                                checked={isWFH} 
                                onChange={e => setIsWFH(e.target.checked)}
                                className="w-5 h-5 text-primary border-slate-300 rounded focus:ring-primary"
                            />
                            <label htmlFor="modalWfhToggle" className="text-sm font-bold text-indigo-800 cursor-pointer select-none flex items-center gap-1">
                                🏠 עבודה מהבית (WFH)
                            </label>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">שעת כניסה</label>
                                <input type="time" value={start} onChange={e => setStart(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">שעת יציאה</label>
                                <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary" />
                            </div>
                        </div>
                    </div>
                )}

                {reportType === 'SICK' && (
                    <div className="bg-rose-50 p-4 rounded-lg border border-rose-200 space-y-3">
                        <h4 className="text-sm font-bold text-rose-800 flex items-center gap-2">
                             📄 צירוף אישור מחלה
                        </h4>
                        <div className="flex items-center gap-3">
                            <label className="cursor-pointer bg-white border border-rose-300 text-rose-600 px-4 py-2 rounded-md text-sm font-bold hover:bg-rose-100 transition-colors shadow-sm">
                                {certificate ? 'שנה קובץ' : 'בחר קובץ (PDF/תמונה)'}
                                <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileChange} />
                            </label>
                            {certificate && (
                                <div className="flex-1 flex items-center justify-between text-xs text-slate-600 bg-white/50 p-1.5 rounded border border-rose-100">
                                    <span className="truncate max-w-[150px]">{certificate.fileName}</span>
                                    <button type="button" onClick={() => {
                                        if (window.confirm(`האם אתה בטוח שברצונך למחוק את התעודה "${certificate.fileName}"?`)) {
                                            setCertificate(undefined);
                                        }
                                    }} className="text-rose-600 font-bold px-1 hover:underline">מחק</button>
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-rose-600 font-medium">מומלץ לצרף אישור רפואי רשמי לצורך זיכוי ימי מחלה ע"י המנהל.</p>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-bold text-slate-700">
                        סיבה לבקשה <span className="text-red-500">*</span>
                    </label>
                    <textarea 
                        value={reason} 
                        onChange={e => { setReason(e.target.value); setError(''); }} 
                        className={`mt-1 block w-full rounded-md shadow-sm focus:border-primary focus:ring-primary ${error ? 'border-red-500 bg-red-50' : 'border-slate-300'}`} 
                        rows={3} 
                        placeholder="פרט את סיבת הדיווח (לדוגמה: מחלה, חופשה שנתית, שכחתי להחתים...)" 
                    />
                    {error && <p className="text-xs text-red-600 font-bold mt-1">{error}</p>}
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100 mt-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md me-2">ביטול</button>
                    <button onClick={handleSubmit} className="bg-primary text-white px-4 py-2 rounded-md hover:bg-indigo-700 shadow-sm font-bold">שלח לאישור</button>
                </div>
            </div>
        </Modal>
    );
};

const AttendancePage: React.FC<AttendancePageProps> = ({ employees, records, setRecords, orders, statusConfigs, payrollOverrides, setPayrollOverrides, onAttendanceMutationBusy }) => {
    const { user } = useAuth();
    const isUserManager = user?.roleType === 'ADMIN' || user?.roleType === 'MANAGER';
    
    // עובד רגיל יכול לראות רק את עצמו, מנהל יכול לבחור כל עובד
    const [currentEmployeeId, setCurrentEmployeeId] = useState<string>(() => {
        // אם המשתמש הוא עובד רגיל, הצג רק אותו
        if (user?.roleType === 'EMPLOYEE' && user.id) {
            return user.id;
        }
        // אם המשתמש הוא מנהל, אפשר לו לבחור כל עובד
        return employees[0]?.id || '';
    });
    
    const [activeTab, setActiveTab] = useState<'MY_PORTAL' | 'ADMIN_DASHBOARD'>('MY_PORTAL');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
    const [selectedDateForCorrection, setSelectedDateForCorrection] = useState<Date | null>(null);
    const [recordForCorrection, setRecordForCorrection] = useState<AttendanceRecord | undefined>(undefined);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isWFH, setIsWFH] = useState(false);
    const [viewingCertificate, setViewingCertificate] = useState<Attachment | null>(null);
    const [isClocking, setIsClocking] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const clockInRequestInProgressRef = useRef(false);

    // Dynamic Year List: Start from 2023 up to current year + 1
    const availableYears = useMemo(() => {
        const startYear = 2023;
        const currentYear = new Date().getFullYear();
        const endYear = currentYear + 1;
        const years = [];
        for (let y = startYear; y <= endYear; y++) {
            years.push(y);
        }
        return years;
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    
    // Pagination state for monthly records
    const [paginatedRecords, setPaginatedRecords] = useState<AttendanceRecord[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [loadingRecords, setLoadingRecords] = useState(false);
    
    // Refetch function for paginated records
    const refetchRecords = async () => {
        try {
            setLoadingRecords(true);
            const filters: any = {
                employeeId: currentEmployeeId,
                month: selectedMonth,
                year: selectedYear
            };
            
            const result = await mongoService.getAttendanceRecordsPaginated(filters, currentPage, pageSize);
            setPaginatedRecords(result.records);
            setTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading paginated records:', error);
        } finally {
            setLoadingRecords(false);
        }
    };
    
    // Load paginated records when filters or pagination change
    useEffect(() => {
        const loadRecords = async () => {
            try {
                setLoadingRecords(true);
                const filters: any = {
                    employeeId: currentEmployeeId,
                    month: selectedMonth,
                    year: selectedYear
                };
                
                const result = await mongoService.getAttendanceRecordsPaginated(filters, currentPage, pageSize);
                setPaginatedRecords(result.records);
                setTotalCount(result.totalCount);
            } catch (error) {
                console.error('Error loading paginated records:', error);
            } finally {
                setLoadingRecords(false);
            }
        };
        loadRecords();
    }, [currentEmployeeId, selectedMonth, selectedYear, currentPage, pageSize]);
    
    // Keep ref to latest setRecords so we don't re-run the effect when it changes (which would overwrite optimistic clock-out)
    const setRecordsRef = useRef(setRecords);
    setRecordsRef.current = setRecords;

    // Auto-close old records on component mount and periodically only (not when setRecords identity changes)
    useEffect(() => {
        const checkAndCloseOldRecords = async () => {
            try {
                const updatedRecords = await mongoService.getAttendanceRecords();
                setRecordsRef.current(updatedRecords);
                refetchRecords();
            } catch (error) {
                console.error('Error refreshing records to close old ones:', error);
            }
        };

        checkAndCloseOldRecords();
        const interval = setInterval(checkAndCloseOldRecords, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);
    
    // עדכן currentEmployeeId אם המשתמש הוא עובד רגיל
    useEffect(() => {
        if (user?.roleType === 'EMPLOYEE' && user.id) {
            const userEmployee = employees.find(e => e.id === user.id);
            if (userEmployee && currentEmployeeId !== user.id) {
                setCurrentEmployeeId(user.id);
            }
        }
    }, [user, employees, currentEmployeeId]);

    // Clear error message after 5 seconds
    useEffect(() => {
        if (errorMessage) {
            const timer = setTimeout(() => setErrorMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [errorMessage]);

    const currentEmployee = employees.find(e => e.id === currentEmployeeId);
    // isManager צריך להיות לפי המשתמש הנוכחי, לא לפי העובד שנבחר
    const isManager = isUserManager;

    const todaysRecords = useMemo(() => {
        const todayStr = getDateStringIsrael(); // Use Israel timezone
        return records
            .filter(r => {
                if (r.employeeId !== currentEmployeeId) return false;
                const recordDateStr = getDateStringForComparison(r.date);
                return recordDateStr === todayStr;
            })
            .sort((a, b) => new Date(a.clockIn || 0).getTime() - new Date(b.clockIn || 0).getTime());
    }, [records, currentEmployeeId]);

    // Only real records (not optimistic att_opt_*) count as "active" for display/timer/clock-out
    const activeRecord = todaysRecords.find(r => !r.clockOut && !String(r.id).startsWith('att_opt_'));
    const isClockedIn = !!activeRecord;

    // LIVE Shift Duration Logic
    const liveDuration = useMemo(() => {
        if (!activeRecord?.clockIn) return "00:00:00";
        // If already clocked out, don't show live duration
        if (activeRecord.clockOut) return "00:00:00";
        const startMs = new Date(activeRecord.clockIn).getTime();
        const diffMs = currentTime.getTime() - startMs;
        return formatMsToHMS(diffMs);
    }, [activeRecord, currentTime]);

    // Helper function to save to offline queue
    const saveToOfflineQueue = (action: 'IN' | 'OUT', data: any) => {
        try {
            const queue = JSON.parse(localStorage.getItem('attendanceQueue') || '[]');
            const todayStr = getDateStringIsrael();
            
            // Check for duplicates before adding to queue
            if (action === 'IN') {
                // Check if there's already a pending clock-in for this employee today
                const hasPendingClockIn = queue.some((item: any) => 
                    item.action === 'IN' && 
                    item.data.employeeId === data.employeeId &&
                    // Check if it's from today (within last 24 hours)
                    (Date.now() - item.timestamp) < 24 * 60 * 60 * 1000
                );
                
                if (hasPendingClockIn) {
                    console.log('Skipping duplicate clock-in in offline queue');
                    return;
                }
            } else if (action === 'OUT') {
                // Check if there's already a pending clock-out for this record
                const hasPendingClockOut = queue.some((item: any) => 
                    item.action === 'OUT' && 
                    item.data.recordId === data.recordId
                );
                
                if (hasPendingClockOut) {
                    console.log('Skipping duplicate clock-out in offline queue');
                    return;
                }
            }
            
            queue.push({ action, data, timestamp: Date.now() });
            localStorage.setItem('attendanceQueue', JSON.stringify(queue));
        } catch (error) {
            console.error('Error saving to offline queue:', error);
        }
    };

    // Helper function to retry with exponential backoff
    async function retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        baseDelay: number = 1000
    ): Promise<T> {
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;
                if (attempt < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError || new Error('Max retries exceeded');
    }

    // Process offline queue when online
    useEffect(() => {
        const processOfflineQueue = async () => {
            try {
                const queue = JSON.parse(localStorage.getItem('attendanceQueue') || '[]');
                if (queue.length === 0) return;

                // First, refresh records to get latest state
                const currentRecords = await mongoService.getAttendanceRecords();
                setRecords(currentRecords);

                const processed: number[] = [];
                const todayStr = getDateStringIsrael();
                
                for (const item of queue) {
                    try {
                        // Check if this action is still valid before processing
                        if (item.action === 'IN') {
                            // Check if there's already an active clock-in for this employee today
                            const hasActiveRecord = currentRecords.some(r => {
                                if (r.employeeId !== item.data.employeeId) return false;
                                const recordDateStr = getDateStringForComparison(r.date);
                                return recordDateStr === todayStr && !r.clockOut;
                            });
                            
                            if (hasActiveRecord) {
                                // Skip this item - already clocked in
                                console.log('Skipping duplicate clock-in from queue');
                                processed.push(item.timestamp);
                                continue;
                            }
                            
                            await mongoService.clockIn(item.data.employeeId, item.data.isWFH);
                        } else if (item.action === 'OUT') {
                            // Check if the record still exists and doesn't have clockOut
                            const record = currentRecords.find(r => r.id === item.data.recordId);
                            if (!record) {
                                // Record doesn't exist, skip
                                console.log('Skipping clock-out for non-existent record');
                                processed.push(item.timestamp);
                                continue;
                            }
                            if (record.clockOut) {
                                // Already clocked out, skip
                                console.log('Skipping duplicate clock-out from queue');
                                processed.push(item.timestamp);
                                continue;
                            }
                            
                            await mongoService.clockOut(item.data.recordId);
                        }
                        processed.push(item.timestamp);
                    } catch (error: any) {
                        console.error('Error processing offline queue item:', error);
                        // If it's a duplicate error, mark as processed to avoid retrying
                        if (error?.message && error.message.includes('already has an active clock-in')) {
                            console.log('Skipping duplicate clock-in from queue (server rejected)');
                            processed.push(item.timestamp);
                        }
                        // Otherwise, keep failed items in queue for next attempt
                    }
                }

                // Remove processed items
                if (processed.length > 0) {
                    const remaining = queue.filter((item: any) => !processed.includes(item.timestamp));
                    localStorage.setItem('attendanceQueue', JSON.stringify(remaining));
                    // Reload records to sync with server
                    const updatedRecords = await mongoService.getAttendanceRecords();
                    setRecords(updatedRecords);
                }
            } catch (error) {
                console.error('Error processing offline queue:', error);
            }
        };

        // Only process if online
        if (navigator.onLine) {
            // Try to process queue every 30 seconds when online
            const interval = setInterval(processOfflineQueue, 30000);
            processOfflineQueue(); // Try immediately

            return () => clearInterval(interval);
        }
    }, [setRecords, currentEmployeeId]);

    const handleClockAction = async (action: 'IN' | 'OUT') => {
        if (isClocking) return;

        setErrorMessage(null);

        if (action === 'IN') {
            if (clockInRequestInProgressRef.current) return;
            clockInRequestInProgressRef.current = true;
            if (todaysRecords.some(r => !r.clockOut)) {
                setErrorMessage('כבר יש כניסה פעילה להיום');
                clockInRequestInProgressRef.current = false;
                return;
            }

            setIsClocking(true);
            if (import.meta.env.DEV) console.log('[Attendance] clock-in start');
            const optimisticId = `att_opt_${Date.now()}`;
            const now = new Date();
            const optimisticRecord: AttendanceRecord = {
                id: optimisticId,
                employeeId: currentEmployeeId,
                date: now,
                clockIn: now,
                totalHours: 0,
                status: isWFH ? 'WFH' : 'PRESENT',
            };
            onAttendanceMutationBusy?.(true);
            setRecords(prev => [...prev, optimisticRecord]);

            try {
                const savedRecord = await retryWithBackoff(() =>
                    mongoService.clockIn(currentEmployeeId, isWFH)
                );
                setRecords(prev =>
                    prev.map(r => r.id === optimisticId ? savedRecord : r).filter(r => !String(r.id).startsWith('att_opt_'))
                );
                if (import.meta.env.DEV) console.log('[Attendance] clock-in success', savedRecord.id);
                setTimeout(async () => {
                    try {
                        const updatedRecords = await mongoService.getAttendanceRecords();
                        setRecords(updatedRecords);
                    } catch (err) {
                        console.error('Error refreshing records after clock-in:', err);
                    }
                }, 500);
            } catch (error: any) {
                console.error('Error clocking in:', error);
                setRecords(prev => prev.filter(r => r.id !== optimisticId));

                const isNetworkError = !navigator.onLine ||
                    (error.message && error.message.includes('fetch')) ||
                    (error.message && error.message.includes('network'));

                if (isNetworkError) {
                    saveToOfflineQueue('IN', { employeeId: currentEmployeeId, isWFH });
                    setErrorMessage('אין חיבור לאינטרנט. הפעולה נשמרה ותתבצע אוטומטית כשהחיבור יחזור.');
                } else {
                    const msg = error.message && error.message.includes('already has an active clock-in')
                        ? 'כבר יש כניסה פעילה להיום'
                        : (error.message || 'שגיאה בביצוע הפעולה. אנא נסה שוב.');
                    setErrorMessage(msg);
                    if (error.message && error.message.includes('already has an active clock-in')) {
                        try {
                            const latestRecords = await mongoService.getAttendanceRecords();
                            setRecords(latestRecords);
                        } catch (err) {
                            console.error('Error refreshing records:', err);
                        }
                    }
                }
            } finally {
                clockInRequestInProgressRef.current = false;
                setIsClocking(false);
                onAttendanceMutationBusy?.(false);
            }
            return;
        }

        // action === 'OUT' — only close records that exist on the server (exclude optimistic ids from pending clock-in)
        const toClose = todaysRecords.filter(r => !r.clockOut && !String(r.id).startsWith('att_opt_'));
        if (toClose.length === 0) {
            // Remove stale optimistic records (ghost entries) and sync with server
            const hasStaleOptimistic = todaysRecords.some(r => !r.clockOut && String(r.id).startsWith('att_opt_'));
            if (hasStaleOptimistic) {
                setRecords(prev => prev.filter(r => !String(r.id).startsWith('att_opt_')));
                try {
                    const updatedRecords = await mongoService.getAttendanceRecords();
                    setRecords(updatedRecords);
                } catch (e) {
                    console.error('Error syncing after filtering optimistic records:', e);
                }
            }
            setErrorMessage('אין כניסה פעילה');
            return;
        }

        setIsClocking(true);
        if (import.meta.env.DEV) console.log('[Attendance] clock-out start', { toCloseCount: toClose.length, ids: toClose.map(r => r.id) });
        const now = new Date();
        const optimisticUpdates = Object.fromEntries(
            toClose.map(r => [
                r.id,
                {
                    ...r,
                    clockOut: now,
                    totalHours: r.clockIn
                        ? Math.max(0, (now.getTime() - new Date(r.clockIn).getTime()) / (1000 * 60 * 60))
                        : 0,
                } as AttendanceRecord,
            ])
        );
        onAttendanceMutationBusy?.(true);
        setRecords(prev =>
            prev.map(rec => (optimisticUpdates[rec.id] ? optimisticUpdates[rec.id] : rec))
        );

        let updatedFromServer: AttendanceRecord[] = [];
        try {
            let needRefetch = false;
            for (const rec of toClose) {
                try {
                    const updatedRecord = await retryWithBackoff(() => mongoService.clockOut(rec.id));
                    const withDates: AttendanceRecord = {
                        ...updatedRecord,
                        clockOut: updatedRecord.clockOut
                            ? (updatedRecord.clockOut instanceof Date ? updatedRecord.clockOut : new Date(updatedRecord.clockOut as unknown as string))
                            : undefined,
                    };
                    updatedFromServer.push(withDates);
                } catch (perRecError: any) {
                    const msg = perRecError?.message ?? '';
                    if (msg.includes('already clocked out') || msg.includes('not found') || msg.includes('record not found')) {
                        needRefetch = true;
                        continue;
                    }
                    throw perRecError;
                }
            }
            if (needRefetch || updatedFromServer.length < toClose.length) {
                if (import.meta.env.DEV) console.log('[Attendance] clock-out refetch', { needRefetch, updatedCount: updatedFromServer.length, toCloseCount: toClose.length });
                const updatedRecords = await mongoService.getAttendanceRecords();
                setRecords(updatedRecords);
                if (toClose.length > 1) setErrorMessage('חלק מהרשומות כבר נחתמו. המערכת עודכנה.');
            } else {
                if (import.meta.env.DEV) console.log('[Attendance] clock-out success', { updatedCount: updatedFromServer.length });
                setRecords(prev =>
                    prev.map(r => {
                        const u = updatedFromServer.find(u => u.id === r.id);
                        return u ?? r;
                    }).filter(r => !String(r.id).startsWith('att_opt_'))
                );
            }
        } catch (error: any) {
            console.error('Error clocking out:', error);
            const msg = error?.message ?? '';
            const isAlreadyOrNotFound = msg.includes('already clocked out') || msg.includes('not found') || msg.includes('record not found');
            if (isAlreadyOrNotFound || updatedFromServer.length > 0) {
                // Sync from server instead of reverting (partial success or record already closed / not found)
                try {
                    const updatedRecords = await mongoService.getAttendanceRecords();
                    setRecords(updatedRecords);
                    setErrorMessage(toClose.length > 1 ? 'חלק מהרשומות כבר נחתמו. המערכת עודכנה.' : 'כבר בוצעה יציאה לרשומה זו.');
                } catch (syncErr) {
                    setRecords(prev =>
                        prev.map(rec => (optimisticUpdates[rec.id] ? toClose.find(r => r.id === rec.id)! : rec))
                    );
                    setErrorMessage('כבר בוצעה יציאה לרשומה זו.');
                }
            } else {
                setRecords(prev =>
                    prev.map(rec => (optimisticUpdates[rec.id] ? toClose.find(r => r.id === rec.id)! : rec))
                );
                const isNetworkError = !navigator.onLine ||
                    (error.message && error.message.includes('fetch')) ||
                    (error.message && error.message.includes('network'));

                if (isNetworkError) {
                    for (const rec of toClose) {
                        saveToOfflineQueue('OUT', { recordId: rec.id });
                    }
                    setErrorMessage('אין חיבור לאינטרנט. הפעולה נשמרה ותתבצע אוטומטית כשהחיבור יחזור.');
                } else {
                    setErrorMessage(error.message || 'שגיאה בביצוע הפעולה. אנא נסה שוב.');
                }
            }
        } finally {
            setIsClocking(false);
            onAttendanceMutationBusy?.(false);
        }
    };

    const openCorrectionModal = (date: Date, record?: AttendanceRecord) => {
        setSelectedDateForCorrection(date);
        setRecordForCorrection(record);
        setCorrectionModalOpen(true);
    };

    const handleCorrectionSubmit = (data: any) => {
        if (!selectedDateForCorrection) return;

        const [startH, startM] = data.start.split(':');
        const [endH, endM] = data.end.split(':');
        const reqIn = new Date(selectedDateForCorrection); 
        reqIn.setHours(parseInt(startH), parseInt(startM), 0, 0);
        const reqOut = new Date(selectedDateForCorrection); 
        reqOut.setHours(parseInt(endH), parseInt(endM), 0, 0);

        const recordStatus: AttendanceStatus = 'PENDING_APPROVAL';
        const isPresence = data.reportType === 'PRESENT' || data.reportType === 'WFH';

        if (recordForCorrection) {
            const updatedRecord: AttendanceRecord = {
                ...recordForCorrection,
                status: recordStatus,
                correctionRequest: {
                    requestedClockIn: reqIn,
                    requestedClockOut: reqOut,
                    requestedStatus: data.reportType,
                    reason: `${data.reportType === 'VACATION' ? 'חופשה' : data.reportType === 'SICK' ? 'מחלה' : data.reportType === 'WFH' ? 'עבודה מהבית' : 'נוכחות'}: ${data.reason}`,
                    certificate: data.certificate
                }
            };
            setRecords(prev => prev.map(r => r.id === recordForCorrection.id ? updatedRecord : r));
        } else {
            const newRecord: AttendanceRecord = {
                id: `att_req_${Date.now()}`,
                employeeId: currentEmployeeId,
                date: selectedDateForCorrection,
                clockIn: isPresence ? reqIn : undefined,
                clockOut: isPresence ? reqOut : undefined,
                totalHours: 0,
                status: recordStatus,
                note: `בקשת ${data.reportType === 'VACATION' ? 'חופשה' : data.reportType === 'SICK' ? 'מחלה' : data.reportType === 'WFH' ? 'עבודה מהבית' : 'נוכחות'}`,
                correctionRequest: {
                    requestedClockIn: reqIn,
                    requestedClockOut: reqOut,
                    requestedStatus: data.reportType,
                    reason: `${data.reportType === 'VACATION' ? 'חופשה' : data.reportType === 'SICK' ? 'מחלה' : data.reportType === 'WFH' ? 'עבודה מהבית' : 'נוכחות'} : ${data.reason}`,
                    certificate: data.certificate
                }
            };
            setRecords(prev => [...prev, newRecord]);
        }
        // Refresh paginated records after correction
        refetchRecords();
        setCorrectionModalOpen(false);
    };

    const getMonthlyStats = (empId: string, month: number, year: number) => {
        const emp = employees.find(e => e.id === empId);
        if (!emp) return { totalHours: 0, baseSalary: 0, bonus: 0, totalGross: 0, workDays: 0, isGlobal: false, vacationDays: 0, sickDays: 0, sickCertificates: [], employerCost: 0 };

        // Always use full records list for monthly stats so manager report and PnL use the same source
        const recordsToUse = records;
        
        const empRecords = recordsToUse.filter(r => {
            const d = new Date(r.date);
            return r.employeeId === empId && d.getMonth() + 1 === month && d.getFullYear() === year;
        });
        
        const uniqueDays = new Set(
            empRecords
                .filter(r => r.status === 'PRESENT' || r.status === 'WFH')
                .map(r => getDateStringForComparison(r.date))
        );
        const workDays = uniqueDays.size;
        
        let hourlyTotalBase = 0;
        let totalHours = 0;

        empRecords.forEach(r => {
            if (r.status === 'PRESENT' || r.status === 'WFH') {
                totalHours += r.totalHours;
                if (emp.salaryType === 'HOURLY') {
                    const historicalSalary = getEmployeeSalaryAtDate(emp, new Date(r.date));
                    hourlyTotalBase += (r.totalHours * historicalSalary.amount);
                }
            }
        });

        const vacationDays = empRecords.filter(r => r.status === 'VACATION').length;
        const sickRecords = empRecords.filter(r => r.status === 'SICK');
        const sickDays = sickRecords.length;
        
        const sickCertificates = sickRecords
            .map(r => r.certificate || r.correctionRequest?.certificate)
            .filter(Boolean) as Attachment[];

        const isGlobal = emp.salaryType === 'GLOBAL';
        const endOfMonthDate = new Date(year, month, 0);
        const effectiveGlobalSalary = getEmployeeSalaryAtDate(emp, endOfMonthDate).amount;
        const baseSalary = isGlobal ? effectiveGlobalSalary : hourlyTotalBase;
        
        let bonus = 0;
        if (emp.hasSalesBonus) {
            const targetIds = emp.bonusBasisEmployeeIds && emp.bonusBasisEmployeeIds.length > 0 ? emp.bonusBasisEmployeeIds : [emp.id];
            const relevantOrders = orders.filter(o => {
                const d = new Date(o.dealStartDate || o.date);
                const isWon = statusConfigs.find(c => c.label === o.orderStatus)?.isActiveDeal; 
                return targetIds.includes(o.employeeId) && d.getMonth() + 1 === month && d.getFullYear() === year && isWon && o.paymentStatus === 'שולם'; 
            });
            const totalSales = relevantOrders.reduce((sum, o) => sum + calculateOrderTotals(o).totalAmount, 0);
            bonus = totalSales * (emp.salesBonusPercentage / 100);
        }
        
        let totalGross = baseSalary + bonus;
        let employerCost = totalGross * (1 + (emp.employerCostPercentage || 0) / 100);

        const override = (payrollOverrides ?? {})[`${empId}_${year}_${month}`];
        if (override) {
            if (override.finalGross !== undefined) {
                totalGross = override.finalGross;
                if (override.finalEmployerCost === undefined) {
                    employerCost = totalGross * (1 + (emp.employerCostPercentage || 0) / 100);
                }
            }
            if (override.finalEmployerCost !== undefined) {
                employerCost = override.finalEmployerCost;
            }
        }
        
        return { 
            totalHours, 
            baseSalary, 
            bonus, 
            totalGross, 
            workDays, 
            isGlobal, 
            vacationDays, 
            sickDays, 
            sickCertificates, 
            employerCost,
            hasGrossOverride: override?.finalGross !== undefined,
            hasCostOverride: override?.finalEmployerCost !== undefined
        };
    };

    const handleOverrideChange = (empId: string, field: 'finalGross' | 'finalEmployerCost', value: string) => {
        const key = `${empId}_${selectedYear}_${selectedMonth}`;
        const numVal = value === '' ? undefined : parseFloat(value);
        
        setPayrollOverrides(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || {}),
                [field]: numVal
            }
        }));
    };

    const handleResetOverride = (empId: string, field: 'finalGross' | 'finalEmployerCost') => {
        const key = `${empId}_${selectedYear}_${selectedMonth}`;
        setPayrollOverrides(prev => {
            const current = prev[key];
            if (!current) return prev;
            
            const updated = { ...current };
            delete updated[field];
            
            if (Object.keys(updated).length === 0) {
                const { [key]: _, ...rest } = prev;
                return rest;
            }
            
            return { ...prev, [key]: updated };
        });
    };

    const handleExportExcel = async () => {
        const emp = currentEmployee;
        if (!emp) return;
        
        const stats = getMonthlyStats(currentEmployeeId, selectedMonth, selectedYear);
        const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
        
        // For export, we need all records of the month, not just paginated
        // So we'll fetch all records for the month
        const allMonthRecords = await mongoService.getAttendanceRecordsPaginated(
            { employeeId: currentEmployeeId, month: selectedMonth, year: selectedYear },
            1,
            10000 // Large limit to get all records
        );
        
        const summaryRows = [
            ["סיכום דוח נוכחות ושכר"],
            ["שם עובד/ת:", emp.name],
            ["ת.ז:", emp.idNumber || "-"],
            ["חודש דיווח:", `${selectedMonth}/${selectedYear}`],
            ["סוג שכר:", emp.salaryType === 'GLOBAL' ? "גלובלי (חודשי)" : "לפי שעה"],
            ["תעריף שעתי (עובד מקבל לשעה):", emp.salaryType === 'GLOBAL' ? "-" : `₪${emp.hourlyWage}`],
            ["שכר בסיס (גלובלי):", emp.monthlyBaseSalary ? `₪${emp.monthlyBaseSalary.toLocaleString()}` : "-"],
            [""],
            ["נתוני נוכחות מצטברים"],
            ["סה\"כ ימי עבודה בפועל:", stats.workDays],
            ["סה\"כ שעות עבודה נטו:", formatDecimalHoursToTime(stats.totalHours)],
            ["ימי חופשה:", stats.vacationDays],
            ["ימי מחלה:", stats.sickDays],
            [""],
            ["תחשיב שכר חודשי (סופי לאישור)"],
            ["שכר בסיס מחושב:", `₪${stats.baseSalary.toLocaleString()}`],
            ["בונוס מכירות:", `₪${stats.bonus.toLocaleString()}`],
            ["סה\"כ ברוטו לתשלום:", `₪${stats.totalGross.toLocaleString()}${stats.hasGrossOverride ? ' (ידני)' : ''}`],
            ["עלות מעביד כוללת:", `₪${stats.employerCost.toLocaleString()}${stats.hasCostOverride ? ' (ידני)' : ''}`],
            [""],
            ["פירוט יומי"],
            ["תאריך", "יום", "כניסה", "יציאה", "סה\"כ שעות", "תעריף שעתי", "לתשלום יומי", "סטטוס", "הערה"]
        ];
        
        const dataRows = daysInMonth.map(date => {
            const dateKey = getDateStringForComparison(date);
            const dayRecords = allMonthRecords.records.filter(r => 
                r.employeeId === currentEmployeeId && 
                getDateStringForComparison(r.date) === dateKey
            );
            
            if (dayRecords.length === 0) {
                return [[date.toLocaleDateString('he-IL'), date.toLocaleDateString('he-IL', { weekday: 'long' }), '-', '-', '0:00', '0', '0', 'חסר', '']];
            }
            
            return dayRecords.map(record => {
                const isPresence = record.status === 'PRESENT' || record.status === 'WFH';
                const effectiveSalary = getEmployeeSalaryAtDate(emp, new Date(record.date));
                const dailyTotal = isPresence && effectiveSalary.type === 'HOURLY' ? (record.totalHours * effectiveSalary.amount).toFixed(2) : '0';
                
                return [
                    date.toLocaleDateString('he-IL'),
                    date.toLocaleDateString('he-IL', { weekday: 'long' }),
                    record.clockIn ? new Date(record.clockIn).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '-',
                    record.clockOut ? new Date(record.clockOut).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : (isPresence ? 'פעיל' : '-'),
                    formatDecimalHoursToTime(record.totalHours),
                    effectiveSalary.type === 'HOURLY' ? effectiveSalary.amount : 'גלובלי',
                    dailyTotal,
                    record.status === 'WFH' ? 'מהבית' : record.status === 'PRESENT' ? 'נוכח' : record.status,
                    record.note || ''
                ];
            });
        }).flat();

        exportToCSV(`payroll_${emp.name}_${selectedMonth}_${selectedYear}.csv`, [...summaryRows, ...dataRows]);
    };

    const renderAdminDashboard = () => {
        const allStats = employees.map(emp => ({
            emp,
            stats: getMonthlyStats(emp.id, selectedMonth, selectedYear)
        }));

        const grandTotals = allStats.reduce((acc, { stats }) => {
            acc.baseSalary += stats.baseSalary;
            acc.bonus += stats.bonus;
            acc.totalGross += stats.totalGross;
            acc.employerCost += stats.employerCost;
            acc.vacationDays += stats.vacationDays;
            acc.sickDays += stats.sickDays;
            acc.totalHours += stats.totalHours;
            return acc;
        }, { baseSalary: 0, bonus: 0, totalGross: 0, employerCost: 0, vacationDays: 0, sickDays: 0, totalHours: 0 });

        const handleExportAll = () => {
            const header = ["עובד", "תפקיד", "סוג שכר", "תעריף / בסיס", "ימי עבודה", "חופשה", "מחלה", "שעות", "שכר בסיס", "בונוס", "סה\"כ ברוטו", "עלות מעביד", "הערה"];
            const rows = allStats.map(item => {
                const endOfMonth = new Date(selectedYear, selectedMonth, 0);
                const salaryAtEnd = getEmployeeSalaryAtDate(item.emp, endOfMonth);
                return [
                    item.emp.name,
                    item.emp.role,
                    salaryAtEnd.type === 'GLOBAL' ? 'גלובלי' : 'שעתי',
                    salaryAtEnd.amount,
                    item.stats.workDays,
                    item.stats.vacationDays,
                    item.stats.sickDays,
                    formatDecimalHoursToTime(item.stats.totalHours),
                    item.stats.baseSalary,
                    item.stats.bonus,
                    item.stats.totalGross,
                    item.stats.employerCost,
                    (item.stats.hasGrossOverride || item.stats.hasCostOverride) ? "כולל תיקון ידני" : ""
                ];
            });
            const footerRow = [ "סה\"כ מצטבר", "", "", "", "-", grandTotals.vacationDays, grandTotals.sickDays, formatDecimalHoursToTime(grandTotals.totalHours), grandTotals.baseSalary, grandTotals.bonus, grandTotals.totalGross, grandTotals.employerCost, "" ];
            exportToCSV(`payroll_summary_${selectedMonth}_${selectedYear}.csv`, [header, ...rows, footerRow]);
        };

        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-end gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">דוח ריכוז שכר ונוכחות</h3>
                        <p className="text-slate-500 text-sm mt-1">סיכום חודשי עבור כלל העובדים</p>
                        <div className="flex items-center gap-3 mt-4">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-bold text-slate-500">שנה:</label>
                                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="text-sm border-slate-300 rounded-md py-1 pe-8">
                                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-bold text-slate-500">חודש:</label>
                                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="text-sm border-slate-300 rounded-md py-1 pe-8">
                                    {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(0, m-1).toLocaleString('he-IL', {month: 'long'})}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                         <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-[11px] text-amber-800 max-w-xs">
                            <strong>שים לב:</strong> ניתן להזין ברוטו ועלות מעביד ידנית מהתלוש לצורך דיוק בדוחות הכספיים.
                        </div>
                        <button onClick={handleExportAll} className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg font-bold shadow-md hover:bg-green-700 transition-all">
                            <DownloadIcon className="w-5 h-5" /> ייצוא דוח מרוכז (Excel)
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-right">
                            <thead className="bg-slate-50 text-slate-600 font-bold">
                                <tr>
                                    <th className="px-6 py-4 border-b">שם עובד</th>
                                    <th className="px-6 py-4 border-b">סוג שכר ותעריף</th>
                                    <th className="px-6 py-4 border-b text-center">ימי עבודה</th>
                                    <th className="px-6 py-4 border-b text-center text-amber-700">חופשה</th>
                                    <th className="px-6 py-4 border-b text-center text-rose-700">מחלה</th>
                                    <th className="px-6 py-4 border-b text-center">סה"כ שעות</th>
                                    <th className="px-6 py-4 border-b">שכר בסיס</th>
                                    <th className="px-6 py-4 border-b">בונוס</th>
                                    <th className="px-6 py-4 border-b font-black text-slate-900 bg-slate-100/30">ברוטו סופי (תלוש)</th>
                                    <th className="px-6 py-4 border-b font-black text-indigo-900 bg-indigo-50/30">עלות מעביד סופית</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {allStats.map(({ emp, stats }) => {
                                    const override = (payrollOverrides ?? {})[`${emp.id}_${selectedYear}_${selectedMonth}`];
                                    const salaryAtEnd = getEmployeeSalaryAtDate(emp, new Date(selectedYear, selectedMonth, 0));
                                    return (
                                        <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-800">{emp.name}</div>
                                                <div className="text-xs text-slate-400">{emp.role}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700">₪{salaryAtEnd.amount.toLocaleString()}</span>
                                                    <span className={`text-[10px] w-fit px-2 py-0.5 rounded font-black ${salaryAtEnd.type === 'GLOBAL' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                                        {salaryAtEnd.type === 'GLOBAL' ? 'גלובלי' : 'שעתי'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center font-medium">{stats.workDays}</td>
                                            <td className="px-6 py-4 text-center font-bold text-amber-600">{stats.vacationDays || '-'}</td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="font-bold text-rose-600">{stats.sickDays || '-'}</span>
                                                    {stats.sickCertificates.length > 0 && (
                                                        <button 
                                                            onClick={() => setViewingCertificate(stats.sickCertificates[0])}
                                                            className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100 font-bold hover:bg-rose-100 transition-colors shadow-sm"
                                                            title="לחץ לצפייה באישור רפואי"
                                                        >📄 אישור</button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-slate-700">{formatDecimalHoursToTime(stats.totalHours)}</td>
                                            <td className="px-6 py-4">₪{stats.baseSalary.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-green-600 font-medium">₪{stats.bonus.toLocaleString()}</td>
                                            <td className={`px-6 py-4 bg-slate-100/20 ${stats.hasGrossOverride ? 'bg-yellow-50/30' : ''}`}>
                                                <div className="flex flex-col gap-1 relative group/field">
                                                    <div className="relative">
                                                        <input 
                                                            type="number"
                                                            value={override?.finalGross ?? ''}
                                                            onChange={(e) => handleOverrideChange(emp.id, 'finalGross', e.target.value)}
                                                            className={`w-full text-sm font-black p-1.5 pe-7 border rounded-md focus:ring-1 focus:ring-primary ${stats.hasGrossOverride ? 'border-amber-400 bg-white text-slate-900 shadow-sm' : 'border-slate-200 text-slate-400'}`}
                                                            placeholder={stats.totalGross.toFixed(0)}
                                                        />
                                                        {stats.hasGrossOverride && (
                                                            <button 
                                                                onClick={() => handleResetOverride(emp.id, 'finalGross')}
                                                                className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-600 transition-colors p-1"
                                                                title="חזור לערך מחושב"
                                                            ><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                                        )}
                                                    </div>
                                                    {!stats.hasGrossOverride && <span className="text-[10px] text-slate-400 italic">משוער: ₪{stats.totalGross.toLocaleString()}</span>}
                                                </div>
                                            </td>
                                            <td className={`px-6 py-4 bg-indigo-50/20 ${stats.hasCostOverride ? 'bg-yellow-50/30' : ''}`}>
                                                <div className="flex flex-col gap-1 relative group/field">
                                                    <div className="relative">
                                                        <input 
                                                            type="number"
                                                            value={override?.finalEmployerCost ?? ''}
                                                            onChange={(e) => handleOverrideChange(emp.id, 'finalEmployerCost', e.target.value)}
                                                            className={`w-full text-sm font-black p-1.5 pe-7 border rounded-md focus:ring-1 focus:ring-primary ${stats.hasCostOverride ? 'border-amber-400 bg-white text-indigo-900 shadow-sm' : 'border-slate-200 text-indigo-400'}`}
                                                            placeholder={stats.employerCost.toFixed(0)}
                                                        />
                                                        {stats.hasCostOverride && (
                                                            <button 
                                                                onClick={() => handleResetOverride(emp.id, 'finalEmployerCost')}
                                                                className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-600 transition-colors p-1"
                                                                title="חזור לערך מחושב"
                                                            ><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                                        )}
                                                    </div>
                                                    {!stats.hasCostOverride && <span className="text-[10px] text-indigo-400 italic">משוער: ₪{stats.employerCost.toLocaleString()}</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-100 font-black border-t-2 border-slate-300 sticky bottom-0 z-10">
                                <tr>
                                    <td className="px-6 py-4" colSpan={2}>סה"כ מצטבר לכל העובדים</td>
                                    <td className="px-6 py-4 text-center text-slate-300">-</td>
                                    <td className="px-6 py-4 text-center text-amber-700">{grandTotals.vacationDays} ימים</td>
                                    <td className="px-6 py-4 text-center text-rose-700">{grandTotals.sickDays} ימים</td>
                                    <td className="px-6 py-4 text-center text-slate-700 font-mono">{formatDecimalHoursToTime(grandTotals.totalHours)}</td>
                                    <td className="px-6 py-4 text-slate-800">₪{grandTotals.baseSalary.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-green-700">₪{grandTotals.bonus.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-slate-900 text-lg bg-slate-200/20">₪{grandTotals.totalGross.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-primary text-xl bg-indigo-100/50">₪{grandTotals.employerCost.toLocaleString()}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const renderMyPortal = () => {
        const stats = getMonthlyStats(currentEmployeeId, selectedMonth, selectedYear);
        const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);

        return (
            <div className="space-y-6 pb-10">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-md border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-8 relative overflow-hidden transition-all hover:shadow-lg">
                        <div className="text-center sm:text-start z-10">
                            <h2 className="text-3xl font-black text-slate-800 mb-1">שלום, {currentEmployee?.name}</h2>
                            <p className="text-slate-500 font-medium">{currentTime.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            <p className="text-5xl font-black text-primary mt-6 tracking-tighter drop-shadow-sm font-mono">
                                {currentTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                            <div className="mt-8 inline-flex items-center px-4 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-700 text-xs font-black uppercase tracking-wide shadow-sm">
                                {stats.isGlobal ? `מצב שכר: גלובלי (₪${currentEmployee?.monthlyBaseSalary?.toLocaleString()})` : `מצב שכר: שעתי (₪${currentEmployee?.hourlyWage}/שעה)`}
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-6 z-10 relative">
                            <div className="p-3 border-2 border-primary/10 rounded-full shadow-inner bg-slate-50/50">
                                {!isClockedIn ? (
                                    <button 
                                        onClick={() => handleClockAction('IN')} 
                                        disabled={isClocking}
                                        className={`w-36 h-36 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 bg-gradient-to-br from-secondary to-green-600 text-white border-4 border-green-100 group relative overflow-hidden ${isClocking ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
                                        <ClockIcon className="w-10 h-10 mb-1 drop-shadow-md" />
                                        <span className="font-black text-xl tracking-tight">
                                            {isClocking ? 'שומר...' : 'כניסה'}
                                        </span>
                                        <div className="absolute top-0 left-0 w-full h-1/2 bg-white/20 blur-xl rounded-full"></div>
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => handleClockAction('OUT')} 
                                        disabled={isClocking}
                                        className={`w-36 h-36 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 bg-gradient-to-br from-rose-500 to-rose-700 text-white border-4 border-rose-100 group relative overflow-hidden ${isClocking ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
                                        <ClockIcon className="w-10 h-10 mb-1" />
                                        <span className="font-black text-xl tracking-tight">
                                            {isClocking ? 'שומר...' : 'יציאה'}
                                        </span>
                                        <div className="mt-1 text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full animate-pulse">במשמרת</div>
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" id="wfhToggle" checked={isWFH} onChange={e => setIsWFH(e.target.checked)} disabled={isClockedIn || isClocking} className="w-5 h-5 text-primary border-slate-300 rounded focus:ring-primary transition-colors cursor-pointer" />
                                    <label htmlFor="wfhToggle" className="text-sm font-black text-slate-600 cursor-pointer select-none flex items-center gap-1">🏠 עבודה מהבית היום</label>
                                </div>
                                {isClockedIn && (
                                    <div className="text-sm font-black text-green-600 bg-green-50 px-3 py-1 rounded-lg border border-green-100 flex items-center gap-2 mt-1 shadow-sm">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>זמן נוכחי: {liveDuration}
                                    </div>
                                )}
                                {errorMessage && (
                                    <div className={`text-xs font-bold px-3 py-2 rounded-lg border mt-1 max-w-xs text-center ${
                                        errorMessage.includes('נשמרה') 
                                            ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                            : 'bg-red-50 text-red-700 border-red-200'
                                    }`}>
                                        {errorMessage}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="absolute -top-10 -left-10 w-40 h-40 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
                        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-green-50 rounded-full blur-3xl opacity-50"></div>
                    </div>
                    <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-100 flex flex-col justify-between transition-all hover:shadow-lg relative">
                        <div className="absolute top-6 left-6"><span className="text-xs bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg font-black shadow-sm ring-1 ring-blue-200">{selectedMonth}/{selectedYear}</span></div>
                        <div className="mt-4"><h3 className="font-black text-xl text-slate-800 mb-6 border-b border-slate-50 pb-2">סיכום חודשי</h3></div>
                        <div className="space-y-5">
                            <div className="flex justify-between items-center group"><span className="font-bold text-xl text-indigo-600 group-hover:scale-110 transition-transform">{stats.workDays}</span><span className="text-slate-500 text-sm font-bold">ימי עבודה</span></div>
                            <div className="flex justify-between items-center group"><span className="font-bold text-xl text-slate-800 group-hover:scale-110 transition-transform font-mono">{formatDecimalHoursToTime(stats.totalHours)}</span><span className="text-slate-500 text-sm font-bold">שעות בפועל נטו</span></div>
                            <div className="flex justify-between items-center group"><span className="font-bold text-lg text-slate-800 group-hover:scale-110 transition-transform">₪{stats.baseSalary.toLocaleString()}</span><span className="text-slate-500 text-sm font-bold">{stats.isGlobal ? 'שכר בסיס (גלובלי)' : 'שכר בסיס (שעתי)'}</span></div>
                            <div className="flex justify-between items-center group"><span className="font-bold text-lg text-green-600 group-hover:scale-110 transition-transform">₪{stats.bonus.toLocaleString()}</span><span className="text-slate-500 text-sm font-bold">בונוס מכירות</span></div>
                            <div className="pt-4 border-t-2 border-slate-50 flex justify-between items-center"><span className="font-black text-2xl text-primary drop-shadow-sm">₪{stats.totalGross.toLocaleString()}</span><span className="text-slate-900 font-black text-base uppercase tracking-tight">סה"כ ברוטו (משוער)</span></div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">שנה</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="text-sm border-slate-200 rounded-lg py-2 px-4 bg-slate-50 font-bold focus:ring-primary">{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">חודש</label>
                            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="text-sm border-slate-200 rounded-lg py-2 px-4 bg-slate-50 font-bold focus:ring-primary">{Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(0, m-1).toLocaleString('he-IL', {month: 'long'})}</option>)}</select>
                        </div>
                    </div>
                    <button onClick={handleExportExcel} className="flex items-center gap-2 px-6 py-2.5 bg-white border-2 border-green-600 text-green-700 rounded-xl text-sm font-black hover:bg-green-50 transition-all w-full sm:w-auto justify-center shadow-sm">
                        <DownloadIcon className="w-5 h-5" /> הורד דוח שכר מלא (Excel)
                    </button>
                </div>

                <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-slate-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-right">
                            <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[10px] tracking-widest">
                                <tr><th className="px-6 py-4 border-b">תאריך</th><th className="px-6 py-4 border-b">יום</th><th className="px-6 py-4 border-b">כניסה</th><th className="px-6 py-4 border-b">יציאה</th><th className="px-6 py-4 border-b">סה"כ שעות</th><th className="px-6 py-4 border-b">סטטוס</th><th className="px-6 py-4 border-b">פעולות</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {daysInMonth.map((date) => {
                                    const dateKey = getDateStringForComparison(date);
                                    const holiday = getJewishHoliday(date);
                                    // All records for this day (one row per clock-in/out pair; allows multiple entries per day)
                                    const dayRecords = records
                                        .filter(r => r.employeeId === currentEmployeeId && getDateStringForComparison(r.date) === dateKey)
                                        .sort((a, b) => new Date(a.clockIn || 0).getTime() - new Date(b.clockIn || 0).getTime());
                                    const isWeekend = date.getDay() === 5 || date.getDay() === 6;
                                    const isFuture = date > new Date();
                                    if (dayRecords.length === 0) {
                                        return (
                                            <tr key={dateKey} className={`hover:bg-slate-50 transition-colors ${holiday ? 'bg-purple-50/50' : isWeekend ? 'bg-slate-50/50' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div>
                                                        <span className="font-bold text-slate-700">{date.toLocaleDateString('he-IL')}</span>
                                                        <span className="block text-[10px] text-slate-400 font-bold">{formatHebrewDate(date)}</span>
                                                        {holiday && <span className="block text-[10px] text-purple-600 font-black mt-0.5">{holiday}</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-slate-500 font-medium">{date.toLocaleDateString('he-IL', { weekday: 'long' })}</td>
                                                <td className="px-6 py-4 text-slate-300">-</td><td className="px-6 py-4 text-slate-300">-</td><td className="px-6 py-4 text-slate-300 font-mono">0:00</td>
                                                <td className="px-6 py-4"><span className="text-[10px] text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full font-black uppercase tracking-tight">{isFuture ? 'עתידי' : 'חסר'}</span></td>
                                                <td className="px-6 py-4"><button onClick={() => openCorrectionModal(date)} className="text-primary hover:text-indigo-800 text-xs font-black flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all hover:shadow-sm"><PlusIcon className="w-3.5 h-3.5"/> {isFuture ? 'תכנון חופשה' : 'דווח ידני'}</button></td>
                                            </tr>
                                        );
                                    }
                                    return dayRecords.map((record, idx) => {
                                        const isRejected = record.status === 'REJECTED';
                                        const isLeave = record.status === 'VACATION' || record.status === 'SICK';
                                        const isWfh = record.status === 'WFH';
                                        const isPresence = record.status === 'PRESENT' || isWfh;
                                        const hasCertificate = !!record.certificate || !!record.correctionRequest?.certificate;
                                        
                                        // Check if this record is from today (to show "פעיל..." only for today's records)
                                        const todayStr = getDateStringIsrael();
                                        const recordDateStr = getDateStringForComparison(record.date);
                                        const isToday = recordDateStr === todayStr;
                                        
                                        return (
                                            <tr key={record.id} className={`hover:bg-slate-50 transition-colors ${record.status === 'PENDING_APPROVAL' ? 'bg-orange-50/60' : isRejected ? 'bg-red-50' : isLeave ? 'bg-amber-50/40' : isWfh ? 'bg-indigo-50/40' : holiday ? 'bg-purple-50/30' : ''}`}>
                                                <td className="px-6 py-4">
                                                    {idx === 0 && (
                                                        <div>
                                                            <span className="font-bold text-slate-700">{date.toLocaleDateString('he-IL')}</span>
                                                            <span className="block text-[10px] text-slate-400 font-bold">{formatHebrewDate(date)}</span>
                                                            {holiday && <span className="block text-[10px] text-purple-600 font-black mt-0.5">{holiday}</span>}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-slate-500 font-medium">{idx === 0 && date.toLocaleDateString('he-IL', { weekday: 'long' })}</td>
                                                <td className={`px-6 py-4 font-mono font-bold ${record.status === 'PENDING_APPROVAL' ? 'text-slate-400 italic' : 'text-slate-700'}`}>{record.clockIn ? new Date(record.clockIn).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : (record.correctionRequest?.requestedClockIn ? new Date(record.correctionRequest.requestedClockIn).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : '-')}</td>
                                                <td className={`px-6 py-4 font-mono font-bold ${record.status === 'PENDING_APPROVAL' ? 'text-slate-400 italic' : 'text-slate-700'}`}>{record.clockOut ? new Date(record.clockOut).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : (record.correctionRequest?.requestedClockOut ? new Date(record.correctionRequest.requestedClockOut).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : (isPresence && isToday ? 'פעיל...' : (isPresence && !isToday ? 'לא הושלם' : '-')))}
                                                </td>
                                                <td className={`px-6 py-4 font-black ${isLeave ? 'text-slate-400 font-medium italic' : 'text-slate-800'}`}>{isPresence ? formatDecimalHoursToTime(record.totalHours) : (isLeave ? 'ללא שעות' : '0:00')}</td>
                                                <td className="px-6 py-4"><div className="flex flex-col gap-1">{record.status === 'PENDING_APPROVAL' ? (<span className="text-[10px] bg-orange-100 text-orange-800 px-2 py-1 rounded-full font-black w-fit uppercase tracking-tight">ממתין לאישור</span>) : isRejected ? (<span className="text-[10px] bg-red-100 text-red-800 px-2 py-1 rounded-full font-black w-fit uppercase tracking-tight">נדחה</span>) : record.status === 'VACATION' ? (<span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-black w-fit uppercase tracking-tight">חופשה</span>) : record.status === 'SICK' ? (<button onClick={() => hasCertificate && setViewingCertificate(record.certificate || record.correctionRequest?.certificate || null)} className={`text-[10px] bg-rose-100 text-rose-800 px-2 py-1 rounded-full font-black w-fit flex items-center gap-1 uppercase tracking-tight ${hasCertificate ? 'hover:bg-rose-200 cursor-pointer shadow-sm' : 'cursor-default'}`} title={hasCertificate ? "לחץ לצפייה באישור" : "מחלה"}>מחלה {hasCertificate && <span>📄</span>}</button>) : record.status === 'WFH' ? (<span className="text-[10px] bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full font-black w-fit flex items-center gap-1 uppercase tracking-tight shadow-sm ring-1 ring-indigo-200">🏠 מהבית</span>) : (<span className="text-[10px] bg-green-100 text-green-800 px-2.5 py-1 rounded-full font-black w-fit uppercase tracking-tight shadow-sm ring-1 ring-green-200">נוכח</span>)}{record.note && <span className="text-[9px] text-slate-400 font-bold max-w-[120px] truncate" title={record.note}>{record.note}</span>}</div></td>
                                                <td className="px-6 py-4">{(record.status !== 'PENDING_APPROVAL' && !isRejected) && (<button onClick={() => openCorrectionModal(date, record)} className="text-primary hover:bg-indigo-100 p-2 rounded-full transition-all" title="בקש תיקון"><EditIcon className="w-4 h-4"/></button>)}</td>
                                            </tr>
                                        );
                                    });
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div>
            {viewingCertificate && <CertificateViewer file={viewingCertificate} onClose={() => setViewingCertificate(null)} />}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div className="flex space-x-1 space-x-reverse w-full sm:auto bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                    <button onClick={() => setActiveTab('MY_PORTAL')} className={`flex-1 sm:flex-none px-8 py-2.5 rounded-lg font-black transition-all text-sm ${activeTab === 'MY_PORTAL' ? 'bg-white text-primary shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>הנוכחות שלי</button>
                    {isManager && (<button onClick={() => setActiveTab('ADMIN_DASHBOARD')} className={`flex-1 sm:flex-none px-8 py-2.5 rounded-lg font-black transition-all text-sm ${activeTab === 'ADMIN_DASHBOARD' ? 'bg-white text-primary shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>דוחות שכר (מנהל)</button>)}
                </div>
                {isUserManager && (
                    <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                        <span className="text-xs font-black text-slate-400 ps-2 uppercase tracking-widest border-l border-slate-100 ml-2">מציג כ:</span>
                        <select value={currentEmployeeId} onChange={(e) => setCurrentEmployeeId(e.target.value)} className="text-sm border-none focus:ring-0 py-1 pe-10 font-black text-slate-700 bg-transparent cursor-pointer">
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.roleType === 'ADMIN' ? 'מנהל' : e.roleType === 'MANAGER' ? 'מנהל' : 'עובד'})</option>)}
                        </select>
                    </div>
                )}
            </div>
            {activeTab === 'MY_PORTAL' ? renderMyPortal() : renderAdminDashboard()}
            {correctionModalOpen && selectedDateForCorrection && (
                <CorrectionRequestModal date={selectedDateForCorrection} record={recordForCorrection} onClose={() => setCorrectionModalOpen(false)} onSubmit={handleCorrectionSubmit} />
            )}
        </div>
    );
};

export default AttendancePage;
