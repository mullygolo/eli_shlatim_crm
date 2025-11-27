
import React, { useMemo } from 'react';
import { Employee, AttendanceRecord } from '../types';

interface HeaderProps {
    title: string;
    employees?: Employee[];
    attendanceRecords?: AttendanceRecord[];
}

const Header: React.FC<HeaderProps> = ({ title, employees = [], attendanceRecords = [] }) => {
    
    const activeEmployees = useMemo(() => {
        const todayStr = new Date().toDateString();
        
        // Get all records for today that have a clock-in but NO clock-out
        const activeRecords = attendanceRecords.filter(r => 
            new Date(r.date).toDateString() === todayStr && 
            r.clockIn && 
            !r.clockOut
        );

        // Map to employee objects
        return activeRecords.map(r => {
            const emp = employees.find(e => e.id === r.employeeId);
            return emp ? emp.name : 'Unknown';
        });
    }, [attendanceRecords, employees]);

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
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 transform translate-y-2 group-hover:translate-y-0">
                        <div className="p-3">
                            <p className="text-xs font-semibold text-slate-400 mb-2 border-b border-slate-100 pb-1">רשימת עובדים פעילים</p>
                            <ul className="space-y-1">
                                {activeEmployees.map((name, idx) => (
                                    <li key={idx} className="text-sm text-slate-700 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                        {name}
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
