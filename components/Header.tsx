
import React, { useMemo } from 'react';
import { Employee, AttendanceRecord } from '../types';
import { useAuth } from '../contexts/AuthContext';

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

    return (
        <header className="h-20 flex items-center justify-between px-8 bg-white border-b border-slate-200">
            <h1 className="text-2xl font-semibold text-slate-800">{title}</h1>
            
            <div className="flex items-center gap-4">
            {/* Add Order widget - prominent, widget-style */}
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
            {/* User Info & Logout */}
            {user && (
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-xs text-slate-500 font-bold">מחובר כ:</p>
                        <p className="text-sm font-bold text-slate-800">{user.name}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        התנתק
                    </button>
                </div>
            )}
            
            {/* Active Employees Widget */}
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
            </div>
        </header>
    );
};

export default Header;
