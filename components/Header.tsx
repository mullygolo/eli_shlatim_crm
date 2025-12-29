
import React, { useMemo } from 'react';
import { Employee, AttendanceRecord } from '../types';

interface HeaderProps {
    title: string;
    employees?: Employee[];
    attendanceRecords?: AttendanceRecord[];
}

interface ActiveEmployeeInfo {
    name: string;
    isWFH: boolean;
    clockInTime: string; // Added field
}

const Header: React.FC<HeaderProps> = ({ title, employees = [], attendanceRecords = [] }) => {
    
    const activeEmployees = useMemo((): ActiveEmployeeInfo[] => {
        const todayStr = new Date().toDateString();
        
        // Get all records for today that have a clock-in but NO clock-out
        const activeRecords = attendanceRecords.filter(r => 
            new Date(r.date).toDateString() === todayStr && 
            r.clockIn && 
            !r.clockOut
        );

        // Map to info objects
        return activeRecords.map(r => {
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

    return (
        <header className="h-20 flex items-center justify-between px-8 bg-white border-b border-slate-200">
            <h1 className="text-2xl font-semibold text-slate-800">{title}</h1>
            
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
                                {activeEmployees.map((emp, idx) => (
                                    <li key={idx} className="text-sm text-slate-700 flex items-center justify-between gap-2 hover:bg-slate-50 p-1 rounded transition-colors">
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
        </header>
    );
};

export default Header;
