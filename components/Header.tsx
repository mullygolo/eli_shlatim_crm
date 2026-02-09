import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Employee, AttendanceRecord, NotificationItem } from '../types';
import { useAuth } from '../contexts/AuthContext';
import * as mongoService from '../services/mongoService';

function formatHeaderDate(date: Date) {
    const weekday = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(date);
    const gregorian = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    let hebrewDate: string;
    try {
        const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(date);
        const dayStr = parts.find(p => p.type === 'day')?.value ?? '';
        const month = parts.find(p => p.type === 'month')?.value ?? '';
        const yearPart = parts.find(p => p.type === 'year')?.value ?? '';
        const yearNum = parseInt(yearPart, 10);
        let hebrewYear = yearNum >= 5000 ? toHebrewYear(yearNum - 5000) : yearPart;
        if (hebrewYear.length > 1) hebrewYear = hebrewYear.slice(0, -1) + '\u05F3' + hebrewYear.slice(-1);
        const dayNum = parseInt(dayStr, 10);
        const dayHebrew = !isNaN(dayNum) ? toHebrewDay(dayNum) : dayStr;
        hebrewDate = month ? `${dayHebrew} ב${month} ${hebrewYear}` : `${dayHebrew} ${hebrewYear}`;
    } catch {
        hebrewDate = '';
    }
    return { weekday, gregorian, hebrewDate };
}

// 
const __unused = 'אבגדהוזחטיכסעפצקרשת';
const GERESH = '\u05F3';
const HEBREW_NUM: Record<number, string> = { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י', 20: 'כ', 30: 'ל', 40: 'מ', 50: 'נ', 60: 'ס', 70: 'ע', 80: 'פ', 90: 'צ', 100: 'ק', 200: 'ר', 300: 'ש', 400: 'ת' };

/** יום בחודש (1–30) לאותיות עבריות עם גרש, למשל 18 → י"ח */
function toHebrewDay(day: number): string {
    if (day < 1 || day > 30) return String(day);
    if (day <= 9) return HEBREW_NUM[day] ?? '';
    if (day === 10) return 'י';
    if (day <= 19) {
        if (day === 15) return 'ט"ו';
        if (day === 16) return 'ט"ז';
        return 'י' + GERESH + (HEBREW_NUM[day - 10] ?? '');
    }
    if (day === 20) return 'כ';
    if (day <= 29) return 'כ' + GERESH + (HEBREW_NUM[day - 20] ?? '');
    return 'ל';
}

function toHebrewYear(n: number): string {
    if (n <= 0) return '';
    if (n < 10) return HEBREW_NUM[n] ?? '';
    if (n < 100) return (HEBREW_NUM[Math.floor(n / 10) * 10] ?? '') + (n % 10 ? HEBREW_NUM[n % 10] : '');
    const hundreds = Math.floor(n / 100) * 100;
    const rest = n % 100;
    const h = hundreds === 500 ? 'תק' : hundreds === 600 ? 'תר' : hundreds === 700 ? 'תש' : hundreds === 800 ? 'תת' : hundreds === 900 ? 'תתק' : HEBREW_NUM[hundreds];
    return (h ?? '') + toHebrewYear(rest);
}

interface HeaderProps {
    title: string;
    employees?: Employee[];
    attendanceRecords?: AttendanceRecord[];
    showAddOrderWidget?: boolean;
    onAddOrder?: () => void;
}

interface ActiveEmployeeInfo {
    name: string;
    isWFH: boolean;
    clockInTime: string; // Added field
}

const Header: React.FC<HeaderProps> = ({ title, employees = [], attendanceRecords = [], showAddOrderWidget, onAddOrder }) => {
    const { user, logout } = useAuth();
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [bellOpen, setBellOpen] = useState(false);
    const bellRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = () => {
        if (!user?.id) return;
        setNotificationsLoading(true);
        mongoService.getNotifications()
            .then(setNotifications)
            .catch(() => setNotifications([]))
            .finally(() => setNotificationsLoading(false));
    };

    useEffect(() => {
        if (user?.id) fetchNotifications();
    }, [user?.id]);
    useEffect(() => {
        if (bellOpen && user?.id) fetchNotifications();
    }, [bellOpen]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
        }
        if (bellOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [bellOpen]);

    const handleMarkRead = (ids: string[]) => {
        if (ids.length === 0) return;
        mongoService.markNotificationsRead(ids).then(() => {
            setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
        }).catch(() => {});
    };

    const activeEmployees = useMemo((): ActiveEmployeeInfo[] => {
        const todayStr = new Date().toDateString();
        
        // Get all records for today that have a clock-in but NO clock-out
        const activeRecords = attendanceRecords.filter(r => 
            new Date(r.date).toDateString() === todayStr && 
            r.clockIn && 
            !r.clockOut
        );

        // Group by employeeId to avoid duplicates (take the most recent clock-in)
        const employeeMap = new Map<string, AttendanceRecord>();
        activeRecords.forEach(r => {
            const existing = employeeMap.get(r.employeeId);
            if (!existing || (r.clockIn && existing.clockIn && new Date(r.clockIn) > new Date(existing.clockIn))) {
                employeeMap.set(r.employeeId, r);
            }
        });

        // Map to info objects (now unique per employee)
        return Array.from(employeeMap.values()).map(r => {
            const emp = employees.find(e => e.id === r.employeeId);
            const timeStr = r.clockIn 
                ? new Date(r.clockIn).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                : '--:--';

            return {
                name: emp ? emp.name : 'Unknown',
                isWFH: r.status === 'WFH',
                clockInTime: timeStr
            };
        });
    }, [attendanceRecords, employees]);

    const wfhCount = activeEmployees.filter(e => e.isWFH).length;
    const officeCount = activeEmployees.length - wfhCount;

    const handleLogout = async () => {
        if (window.confirm('האם אתה בטוח שברצונך להתנתק?')) {
            await logout();
        }
    };

    const dateDisplay = formatHeaderDate(new Date());

    return (
        <header className="h-20 flex items-center justify-between px-8 bg-white border-b border-slate-200">
            <div className="flex items-center gap-5 min-w-0">
                <h1 className="text-2xl font-semibold text-slate-800 truncate">{title}</h1>
                <div className="hidden sm:flex items-center gap-3 shrink-0 py-2 px-4 rounded-xl bg-slate-50/90 border border-slate-100">
                    <span className="font-bold text-slate-700 text-sm">{dateDisplay.weekday}</span>
                    <span className="text-slate-300" aria-hidden>·</span>
                    <span className="text-sm text-slate-600">{dateDisplay.gregorian}</span>
                    {dateDisplay.hebrewDate && (
                        <>
                            <span className="text-slate-300" aria-hidden>·</span>
                            <span className="text-sm text-slate-600" dir="rtl">{dateDisplay.hebrewDate}</span>
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4">
            {/* התראות (פעמון) */}
            {user && (
                <div className="relative" ref={bellRef}>
                    <button
                        type="button"
                        onClick={() => setBellOpen(!bellOpen)}
                        className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                        title="התראות"
                        aria-label="התראות"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {notifications.length > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                {notifications.length > 99 ? '99+' : notifications.length}
                            </span>
                        )}
                    </button>
                    {bellOpen && (
                        <div className="absolute left-0 top-full mt-2 w-[340px] max-h-[70vh] overflow-hidden bg-white rounded-xl shadow-xl border border-slate-200 z-[9999] flex flex-col">
                            <div className="p-3 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="font-bold text-slate-800">התראות</h3>
                                {notifications.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => handleMarkRead(notifications.map(n => n.id))}
                                        className="text-xs text-primary hover:text-indigo-700 font-medium"
                                    >
                                        סמן הכל כראוי
                                    </button>
                                )}
                            </div>
                            <div className="overflow-y-auto flex-1 p-2">
                                {notificationsLoading ? (
                                    <p className="text-sm text-slate-400 py-4 text-center">טוען...</p>
                                ) : notifications.length === 0 ? (
                                    <p className="text-sm text-slate-400 py-4 text-center">אין התראות חדשות</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {notifications.map((n) => (
                                            <li key={n.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-right">
                                                <p className="font-semibold text-slate-800 text-sm">{n.title}</p>
                                                <p className="text-xs text-slate-600 mt-0.5">{n.description}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMarkRead([n.id])}
                                                    className="text-[10px] text-primary hover:underline mt-1"
                                                >
                                                    סמן כראוי
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {/* Order: הוסף הזמנה → מחוברים כעת → מחובר כ: → התנתק */}
            {showAddOrderWidget && onAddOrder && (
                <button
                    type="button"
                    onClick={onAddOrder}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md border-2 border-primary/80 hover:bg-indigo-700 hover:border-indigo-600 hover:shadow-lg transition-all"
                    title="הוסף הזמנה חדשה"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    הוסף הזמנה
                </button>
            )}
            {/* מחוברים כעת */}
            {activeEmployees.length > 0 && (
                <div className="relative group">
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-200 shadow-sm cursor-help">
                        <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </div>
                        <div className="flex flex-col items-start leading-none">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">מחוברים כעת</span>
                            <span className="text-sm font-bold text-slate-800">{activeEmployees.length} עובדים</span>
                        </div>
                    </div>

                    {/* Tooltip / Dropdown */}
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 transform translate-y-2 group-hover:translate-y-0">
                        <div className="p-3">
                            <p className="text-xs font-semibold text-slate-400 mb-2 border-b border-slate-100 pb-1">
                                מחוברים ({officeCount} במשרד, {wfhCount} מהבית)
                            </p>
                            <ul className="space-y-2">
                                {activeEmployees.map((emp) => (
                                    <li key={emp.name + emp.clockInTime} className="text-sm text-slate-700 flex items-center justify-between gap-2 hover:bg-slate-50 p-1 rounded transition-colors">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                                <span className="font-medium">{emp.name}</span>
                                                {emp.isWFH && <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1 py-0.5 rounded font-bold">🏠</span>}
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-bold ps-3.5 mt-0.5">
                                                מחובר מ-{emp.clockInTime}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
            {user && (
                <div className="text-right">
                    <p className="text-xs text-slate-500 font-bold">מחובר כ:</p>
                    <p className="text-sm font-bold text-slate-800">{user.name}</p>
                </div>
            )}
            {/* התנתק */}
            {user && (
                <button
                    onClick={handleLogout}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    התנתק
                </button>
            )}
            </div>
        </header>
    );
};

export default Header;
