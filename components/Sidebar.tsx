
import React from 'react';
import { Page } from '../types';
import { DashboardIcon, OrdersIcon, CustomersIcon, SuppliersIcon, ReportsIcon, SettingsIcon, FinanceIcon, ClockIcon, PriceListIcon, PhoneIcon, LightbulbIcon } from './icons';
import { PAGE_TITLES } from '../App';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
    const { user } = useAuth();
    const isEmployee = user?.roleType === 'EMPLOYEE';
    const isAdmin = user?.roleType === 'ADMIN';
    
    const navItems: { page: Page; icon: React.ReactNode; label?: string }[] = [
        { page: 'Dashboard', icon: <DashboardIcon className="h-6 w-6" /> },
        { page: 'Orders', icon: <OrdersIcon className="h-6 w-6" /> },
        { page: 'Customers', icon: <CustomersIcon className="h-6 w-6" /> },
        { page: 'Suppliers', icon: <SuppliersIcon className="h-6 w-6" /> },
        { page: 'PriceList', icon: <PriceListIcon className="h-6 w-6" /> },
        { page: 'Reports', icon: <ReportsIcon className="h-6 w-6" />, label: 'תשלום לספקים' },
        ...(isAdmin ? [{ page: 'Performance' as Page, icon: <ReportsIcon className="h-6 w-6" />, label: 'דוח ביצועים' }] : []),
        { page: 'Finance' as Page, icon: <FinanceIcon className="h-6 w-6" />, label: isAdmin ? 'דוחות כספיים' : 'ניהול צ\'קים נכנסים' },
        { page: 'Attendance', icon: <ClockIcon className="h-6 w-6" />, label: 'נוכחות ושכר' },
        { page: 'CallCenter', icon: <PhoneIcon className="h-6 w-6" />, label: 'מרכזייה' },
        { page: 'ImprovementSuggestions' as Page, icon: <LightbulbIcon className="h-6 w-6" />, label: 'הצעות ייעול' },
    ];

    return (
        <nav className="w-16 md:w-64 bg-dark-bg text-white flex flex-col h-full">
            <div className="flex items-center justify-center md:justify-start md:px-6 h-20 border-b border-dark-border flex-shrink-0">
                <div className="text-2xl font-bold text-white">
                    <span className="md:hidden">המ</span>
                    <span className="hidden md:inline">אלי שלטים</span>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto mt-6">
                <ul className="space-y-1">
                    {navItems.map(({ page, icon, label }) => (
                        <li key={page} className="px-3">
                            <button
                                onClick={() => setCurrentPage(page)}
                                className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 ${
                                    currentPage === page
                                        ? 'bg-primary text-white'
                                        : 'text-slate-400 hover:bg-dark-card hover:text-white'
                                }`}
                            >
                                {icon}
                                <span className="ms-4 hidden md:inline">{label || PAGE_TITLES[page]}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {!isEmployee && (
                <div className="border-t border-dark-border p-3 flex-shrink-0">
                    <button
                        onClick={() => setCurrentPage('Settings')}
                        className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 ${
                            currentPage === 'Settings'
                                ? 'bg-primary text-white'
                                : 'text-slate-400 hover:bg-dark-card hover:text-white'
                        }`}
                    >
                        <SettingsIcon className="h-6 w-6" />
                        <span className="ms-4 hidden md:inline">הגדרות</span>
                    </button>
                </div>
            )}
        </nav>
    );
};

export default Sidebar;
