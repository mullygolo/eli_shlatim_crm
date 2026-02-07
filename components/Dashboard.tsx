import React, { useState, useMemo, useEffect } from 'react';
import DOMPurify from 'dompurify';
// Fixed error: Removed 'OrderStatus' which is not exported from '../types'
import { Customer, Order, Activity, Employee, OrderStatusConfiguration, PaymentStatus, ManualEvent, WallPost, PaymentMethod } from '../types';
import { TaskIcon, SettingsIcon, MegaphoneIcon, TruckIcon, CashIcon, CalendarPlusIcon, InstallationIcon, NoteIcon } from './icons'; 
import { calculateOrderTotals, calculateDueDate } from '../utils/calculations';
import { getDateStringIsrael } from '../utils/timezone';
import Modal from './Modal';
import { useAuth } from '../contexts/AuthContext';
import * as mongoService from '../services/mongoService'; 

interface DashboardProps {
    customers: Customer[];
    orders: Order[];
    activities: Activity[];
    monthlyGoal: number;
    setMonthlyGoal: (goal: number) => void;
    employees?: Employee[];
    onNavigateToOrder?: (orderId: string) => void;
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
    systemMessage: string;
    manualEvents: ManualEvent[];
    addManualEvent: (event: ManualEvent) => void;
}

// --- Internal Interfaces for Calendar ---
interface CalendarItem {
    id: string;
    date: Date;
    type: 'LOGISTICS' | 'FINANCE' | 'MANUAL';
    title: string;
    subtitle?: string;
    details?: string; // Address, contact etc. for logistics
    colorClass: string;
    icon: React.ReactNode;
    time?: string;
    refId?: string; // Order ID or Payment ID
}

// --- Monthly Goal Widget ---
const MonthlyGoalWidget: React.FC<{
    current: number;
    target: number;
    onEdit: () => void;
    canEdit?: boolean;
}> = ({ current, target, onEdit, canEdit = false }) => {
    const percentage = Math.min(100, Math.max(0, (current / target) * 100));
    
    let message = "זו רק ההתחלה, יש לנו דרך לעשות!";
    let barColor = "bg-red-500";
    let textColor = "text-red-600";

    if (percentage >= 33 && percentage < 66) {
        message = "אנחנו בכיוון הנכון, להמשיך לדחוף!";
        barColor = "bg-orange-500";
        textColor = "text-orange-600";
    } else if (percentage >= 66 && percentage < 100) {
        message = "אוטוטו שם! מאמץ אחרון.";
        barColor = "bg-blue-500";
        textColor = "text-blue-600";
    } else if (percentage >= 100) {
        message = "כל הכבוד! עמדנו ביעד החודשי! 🚀";
        barColor = "bg-green-500";
        textColor = "text-green-600";
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden h-full flex flex-col justify-between min-h-[180px]">
            <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-slate-800">יעד הכנסות חודשי</h3>
                {canEdit && (
                    <button onClick={onEdit} className="text-slate-400 hover:text-primary transition-colors" title="עריכת יעד (מנהל מערכת)">
                        <SettingsIcon className="w-5 h-5" />
                    </button>
                )}
            </div>
            
            <div className="flex items-end gap-2 mb-4">
                <span className="text-4xl font-black text-indigo-600">₪{current.toLocaleString()}</span>
                <span className="text-sm text-slate-500 mb-2 font-medium">מתוך ₪{target.toLocaleString()}</span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-4 mb-3 overflow-hidden">
                <div 
                    className={`h-4 rounded-full transition-all duration-1000 ease-out ${barColor}`} 
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>

            <p className={`text-sm font-bold ${textColor} flex items-center gap-2`}>
                {message}
                {percentage >= 100 && <span className="text-xl">🏆</span>}
            </p>
        </div>
    );
};

// --- System Message Widget --- (renders HTML from rich editor, sanitized with DOMPurify; plain text wrapped in <p> for backward compatibility)
const SystemMessageWidget: React.FC<{ message: string }> = ({ message }) => {
    const raw = (message || '').trim();
    const isHtml = raw.startsWith('<') && (raw.includes('</') || raw.includes('/>'));
    const toSanitize = isHtml ? raw : `<p>${raw}</p>`;
    const sanitized = DOMPurify.sanitize(toSanitize, { ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'a'] });
    const html = sanitized.trim() || '<p class="text-slate-500">אין הודעות חדשות.</p>';
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full flex flex-col relative overflow-hidden min-h-[180px]">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                <div className="bg-amber-100 p-1.5 rounded-full text-amber-600">
                    <MegaphoneIcon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">הודעות מערכת</h3>
            </div>
            <div
                className="flex-grow overflow-y-auto max-h-[120px] custom-scrollbar text-slate-700 leading-relaxed text-sm md:text-base [&_p]:mb-2 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:mr-4 [&_ol]:mr-4 [&_li]:mr-2 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_a]:text-primary [&_a]:underline"
                dir="rtl"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </div>
    );
};

// --- Smart Operations Calendar Components ---

const AddEventModal: React.FC<{
    onSave: (event: ManualEvent) => void;
    onClose: () => void;
    initialDate?: Date;
}> = ({ onSave, onClose, initialDate }) => {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(initialDate ? initialDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState('09:00');
    const [description, setDescription] = useState('');

    const handleSubmit = () => {
        if (!title || !date) return;
        
        // Construct date object
        const fullDate = new Date(date);
        const [hours, minutes] = time.split(':').map(Number);
        fullDate.setHours(hours || 0, minutes || 0);

        onSave({
            id: `manual_${Date.now()}`,
            title,
            date: fullDate,
            time,
            description
        });
        onClose();
    };

    return (
        <Modal title="הוספת אירוע ליומן" onClose={onClose} size="lg">
            <div className="space-y-4 text-start">
                <div>
                    <label className="block text-sm font-medium text-slate-700">כותרת אירוע</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" placeholder="לדוג': פגישה עם ספק, הרמת כוסית..." autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">תאריך</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">שעה</label>
                        <input type="time" value={time} onChange={e => setTime(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">תיאור / הערות</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                </div>
                <div className="flex justify-end pt-4">
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 shadow-sm">הוסף ליומן</button>
                </div>
            </div>
        </Modal>
    );
};

const OperationsCalendarWidget: React.FC<{
    orders: Order[];
    manualEvents: ManualEvent[];
    addManualEvent: (event: ManualEvent) => void;
    onNavigateToOrder?: (orderId: string) => void;
}> = ({ orders, manualEvents, addManualEvent, onNavigateToOrder }) => {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);

    // 1. Aggregate Data
    const calendarItems = useMemo(() => {
        const items: CalendarItem[] = [];

        // Logistics (from line items with serviceType + scheduledDate, and legacy additionalServices)
        orders.forEach(order => {
            (order.lineItems || []).filter(li => (li.serviceType === 'DELIVERY' || li.serviceType === 'INSTALLATION') && li.serviceDetails?.scheduledDate).forEach(li => {
                const d = new Date(li.serviceDetails!.scheduledDate!);
                const sd = li.serviceDetails!;
                const detailsParts = [sd.address, sd.siteContactName, sd.siteContactDetails].filter(Boolean);
                const details = detailsParts.length > 0 ? detailsParts.join(' | ') : undefined;
                const isDelivery = li.serviceType === 'DELIVERY';
                items.push({
                    id: li.id,
                    date: d,
                    type: 'LOGISTICS',
                    title: li.description || (isDelivery ? 'משלוח' : 'התקנה'),
                    subtitle: `${order.orderNumber} - ${order.description}`,
                    details,
                    colorClass: isDelivery ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200',
                    icon: isDelivery ? <TruckIcon className="w-4 h-4" /> : <InstallationIcon className="w-4 h-4" />,
                    time: d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
                    refId: order.id
                });
            });
            order.additionalServices.forEach(service => {
                if (service.scheduledDate) {
                    items.push({
                        id: service.id,
                        date: new Date(service.scheduledDate),
                        type: 'LOGISTICS',
                        title: service.description || 'שירות/התקנה',
                        subtitle: `${order.orderNumber} - ${order.description}`,
                        details: [service.address, service.siteContactName, service.siteContactDetails].filter(Boolean).join(' | ') || undefined,
                        colorClass: 'bg-blue-100 text-blue-700 border-blue-200',
                        icon: <TruckIcon className="w-4 h-4" />,
                        time: new Date(service.scheduledDate).toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'}),
                        refId: order.id
                    });
                }
            });

            // Finance (Check Repayment)
            order.payments.forEach(payment => {
                if (payment.method === PaymentMethod.CHECK && payment.repaymentDate) {
                    items.push({
                        id: payment.id,
                        date: new Date(payment.repaymentDate),
                        type: 'FINANCE',
                        title: `פירעון צ'ק`,
                        subtitle: `ע"ס ₪${payment.amount.toLocaleString()} (הזמנה ${order.orderNumber})`,
                        colorClass: 'bg-red-100 text-red-700 border-red-200',
                        icon: <CashIcon className="w-4 h-4" />,
                        refId: order.id
                    });
                }
            });
        });

        // Manual Events
        manualEvents.forEach(evt => {
            items.push({
                id: evt.id,
                date: new Date(evt.date),
                type: 'MANUAL',
                title: evt.title,
                subtitle: evt.description,
                colorClass: 'bg-purple-100 text-purple-700 border-purple-200',
                icon: <CalendarPlusIcon className="w-4 h-4" />,
                time: evt.time
            });
        });

        return items;
    }, [orders, manualEvents]);

    // 2. Calendar Logic
    const getDaysInMonth = (month: number, year: number) => {
        const date = new Date(year, month, 1);
        const days = [];
        while (date.getMonth() === month) {
            days.push(new Date(date));
            date.setDate(date.getDate() + 1);
        }
        return days;
    };

    const days = getDaysInMonth(currentMonth, currentYear);
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday
    const blanks = Array.from({ length: firstDayIndex });

    const handlePrevMonth = () => {
        if (currentMonth === 0) {
            setCurrentMonth(11);
            setCurrentYear(currentYear - 1);
        } else {
            setCurrentMonth(currentMonth - 1);
        }
    };

    const handleNextMonth = () => {
        if (currentMonth === 11) {
            setCurrentMonth(0);
            setCurrentYear(currentYear + 1);
        } else {
            setCurrentMonth(currentMonth + 1);
        }
    };

    const getItemsForDay = (date: Date) => {
        return calendarItems.filter(item => 
            item.date.getDate() === date.getDate() &&
            item.date.getMonth() === date.getMonth() &&
            item.date.getFullYear() === date.getFullYear()
        );
    };

    const selectedDayItems = useMemo(() => getItemsForDay(selectedDate), [selectedDate, calendarItems]);

    return (
        <div className="bg-white rounded-lg shadow-md border border-slate-200 h-[500px] flex flex-col md:flex-row overflow-hidden">
            {/* Left Side: Calendar Grid */}
            <div className="md:w-7/12 p-4 flex flex-col border-b md:border-b-0 md:border-l border-slate-200">
                <div className="flex justify-between items-center mb-4 px-2">
                    <button onClick={handlePrevMonth} className="text-slate-400 hover:text-primary text-xl font-bold px-2">&lt;</button>
                    <h3 className="font-bold text-slate-800 text-lg">
                        {new Date(currentYear, currentMonth).toLocaleString('he-IL', { month: 'long', year: 'numeric' })}
                    </h3>
                    <button onClick={handleNextMonth} className="text-slate-400 hover:text-primary text-xl font-bold px-2">&gt;</button>
                </div>
                
                <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500 mb-2">
                    <div>א'</div><div>ב'</div><div>ג'</div><div>ד'</div><div>ה'</div><div>ו'</div><div>ש'</div>
                </div>
                
                <div className="grid grid-cols-7 gap-1 flex-1">
                    {blanks.map((_, i) => <div key={`blank-${i}`} className="h-full"></div>)}
                    {days.map(day => {
                        const isToday = day.toDateString() === new Date().toDateString();
                        const isSelected = day.toDateString() === selectedDate.toDateString();
                        const items = getItemsForDay(day);
                        const hasLogistics = items.some(i => i.type === 'LOGISTICS');
                        const hasFinance = items.some(i => i.type === 'FINANCE');
                        const hasManual = items.some(i => i.type === 'MANUAL');

                        return (
                            <div 
                                key={day.toISOString()} 
                                onClick={() => setSelectedDate(day)}
                                className={`relative flex flex-col items-center justify-start pt-1 rounded-lg cursor-pointer transition-all hover:bg-slate-50 ${isSelected ? 'bg-indigo-50 ring-2 ring-indigo-200' : ''}`}
                            >
                                <span className={`text-sm w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-white font-bold shadow-sm' : 'text-slate-700'}`}>
                                    {day.getDate()}
                                </span>
                                <div className="flex gap-0.5 mt-1">
                                    {hasLogistics && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                                    {hasFinance && <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>}
                                    {hasManual && <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right Side: Agenda / List */}
            <div className="md:w-5/12 p-4 bg-slate-50 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h4 className="font-bold text-slate-800">
                            {selectedDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </h4>
                        <p className="text-xs text-slate-500">
                            {selectedDayItems.length} אירועים היום
                        </p>
                    </div>
                    <button 
                        onClick={() => setIsAddEventModalOpen(true)}
                        className="p-2 bg-white border border-slate-200 rounded-full shadow-sm text-primary hover:bg-indigo-50 transition-colors"
                        title="הוסף אירוע ידני"
                    >
                        <CalendarPlusIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pe-1">
                    {selectedDayItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-3">
                                <span className="text-3xl">📅</span>
                            </div>
                            <p className="text-sm">אין אירועים ליום זה</p>
                        </div>
                    ) : (
                        selectedDayItems.map((item, idx) => (
                            <div 
                                key={`${item.id}_${idx}`} 
                                className={`p-3 rounded-lg border shadow-sm bg-white ${item.colorClass} border-l-4 cursor-pointer hover:shadow-md transition-all`}
                                onClick={() => item.refId && onNavigateToOrder && onNavigateToOrder(item.refId)}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2 mb-1">
                                        {item.icon}
                                        <span className="font-bold text-sm text-slate-800">{item.title}</span>
                                    </div>
                                    {item.time && <span className="text-xs font-mono bg-white/50 px-1 rounded">{item.time}</span>}
                                </div>
                                {item.subtitle && <p className="text-xs text-slate-600 line-clamp-2">{item.subtitle}</p>}
                                {item.details && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2" title={item.details}>{item.details}</p>}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {isAddEventModalOpen && (
                <AddEventModal 
                    onSave={addManualEvent} 
                    onClose={() => setIsAddEventModalOpen(false)} 
                    initialDate={selectedDate}
                />
            )}
        </div>
    );
};

// --- Strong Number Widget Components ---

interface FinancialMetric {
    revenueExclVat: number;
    revenueInclVat: number;
    profit: number;
    margin: number;
    count: number;
}

type LostDealsPeriod = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3';

const StrongNumberCard: React.FC<{ 
    orders: Order[]; 
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
    roleType?: string;
    onNavigateToOrder?: (orderId: string) => void;
}> = ({ orders, statusConfigs, vatRate, roleType, onNavigateToOrder }) => {
    const isEmployee = roleType === 'EMPLOYEE';
    const [lostDealsPeriod, setLostDealsPeriod] = useState<LostDealsPeriod>('THIS_MONTH');
    const [lostDealsModalOpen, setLostDealsModalOpen] = useState(false);
    const [dailyModalOpen, setDailyModalOpen] = useState(false);
    const [monthlyModalOpen, setMonthlyModalOpen] = useState(false);
    const [yearlyModalOpen, setYearlyModalOpen] = useState(false);
    const [collectionModalOpen, setCollectionModalOpen] = useState(false);
    const [leadsModalOpen, setLeadsModalOpen] = useState(false);
    const [quotesModalOpen, setQuotesModalOpen] = useState(false);
    useEffect(() => {
        if (!lostDealsModalOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLostDealsModalOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lostDealsModalOpen]);
    // Helper to calculate metrics for a filtered list of orders (same logic as Orders page: profit % = רווח מהעלות)
    const calculateMetrics = (filteredOrders: Order[]): FinancialMetric => {
        const result = filteredOrders.reduce((acc, order) => {
            const { totalAmount, profit, totalCost } = calculateOrderTotals(order);
            acc.revenueExclVat += totalAmount;
            acc.profit += profit;
            acc.totalCost += totalCost;
            return acc;
        }, { revenueExclVat: 0, profit: 0, totalCost: 0 });

        const revenueInclVat = result.revenueExclVat * (1 + vatRate / 100);
        // אחוז רווח מהעלות (כמו בעמוד הזמנות): (רווח / עלות) × 100
        const margin = result.totalCost > 0
            ? (result.profit / result.totalCost) * 100
            : (result.revenueExclVat > 0 ? 100 : 0);

        return {
            revenueExclVat: result.revenueExclVat,
            revenueInclVat: revenueInclVat,
            profit: result.profit,
            margin: margin,
            count: filteredOrders.length
        };
    };

    const stats = useMemo(() => {
        const now = new Date();
        const todayStr = getDateStringIsrael(now);
        const monthStr = todayStr.slice(0, 7);
        const yearStr = todayStr.slice(0, 4);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        // Active deals for collection/leads/quotes/lost (all isActiveDeal)
        const activeDeals = orders.filter(order => {
             const config = statusConfigs.find(c => c.label === order.orderStatus);
             return config ? config.isActiveDeal === true : false;
        });

        // Strong numbers: כל עסקאות מאושרות (isActiveDeal) – כולל שהסתיימו בהצלחה. חישוב לפי תאריך אישור העסקה (dealStartDate)
        let activeDealsForStrongNumbers = orders.filter(order => {
            const config = statusConfigs.find(c => c.label === order.orderStatus);
            return config ? config.isActiveDeal === true : false;
        });

        // דדופליקציה לפי מספר הזמנה (כמו בשרת כש-dateFilterType=DEAL_DATE): שומרים רשומה אחת לכל מספר – לפי התאריך המאוחר ביותר בתאריך אישור העסקה
        const dateKeyForDedup = (o: Order) => o.dealStartDate || o.date;
        const seenByOrderNumber = new Map<string, Order>();
        for (const order of activeDealsForStrongNumbers) {
            const raw = (order.orderNumber != null && order.orderNumber !== '') ? String(order.orderNumber).trim() : '';
            const key = raw !== '' ? raw.toUpperCase() : (order.id || '');
            if (!key) continue;
            const existing = seenByOrderNumber.get(key);
            if (!existing) {
                seenByOrderNumber.set(key, order);
            } else {
                const dNew = dateKeyForDedup(order) ? new Date(dateKeyForDedup(order) as string | Date).getTime() : 0;
                const dOld = dateKeyForDedup(existing) ? new Date(dateKeyForDedup(existing) as string | Date).getTime() : 0;
                if (dNew >= dOld) seenByOrderNumber.set(key, order);
            }
        }
        activeDealsForStrongNumbers = Array.from(seenByOrderNumber.values());

        // תאריך לחישוב = תאריך אישור העסקה (dealStartDate), או תאריך הזמנה אם אין – לצורכי דוחות והכנסות
        const orderDateStr = (o: Order) => getDateStringIsrael(o.dealStartDate || o.date);

        // רווח יומי = עסקאות מאושרות שאושרו היום (לפי תאריך אישור העסקה)
        const dailyDeals = activeDealsForStrongNumbers.filter(o => orderDateStr(o) === todayStr);
        // רווח חודשי = עסקאות מאושרות שאושרו בחודש הנוכחי (לפי תאריך אישור העסקה)
        const monthlyDeals = activeDealsForStrongNumbers.filter(o => orderDateStr(o).slice(0, 7) === monthStr);
        // רווח שנתי = עסקאות מאושרות שאושרו השנה, מתחילת ינואר עד היום (לפי תאריך אישור העסקה)
        const yearlyDeals = activeDealsForStrongNumbers.filter(o => {
            const d = orderDateStr(o);
            return d.slice(0, 4) === yearStr && d <= todayStr;
        });

        // Use the isLead flag configuration to count new leads
        const leadStatuses = new Set(statusConfigs.filter(c => c.isLead).map(c => c.label));
        const untouchedLeads = orders.filter(o => leadStatuses.has(o.orderStatus));
        
        // Use the isQuote flag configuration to count open quotes (deduplicated by orderNumber, like Orders page)
        const quoteStatuses = new Set(statusConfigs.filter(c => c.isQuote).map(c => c.label));
        const openQuotesRaw = orders.filter(o => quoteStatuses.has(o.orderStatus));
        const quoteDedupMap = new Map<string, Order>();
        for (const order of openQuotesRaw) {
            const raw = (order.orderNumber != null && order.orderNumber !== '') ? String(order.orderNumber).trim() : '';
            const key = raw !== '' ? raw.toUpperCase() : (order.id || '');
            if (!key) continue;
            const existing = quoteDedupMap.get(key);
            if (!existing) {
                quoteDedupMap.set(key, order);
            } else {
                const dNew = dateKeyForDedup(order) ? new Date(dateKeyForDedup(order) as string | Date).getTime() : 0;
                const dOld = dateKeyForDedup(existing) ? new Date(dateKeyForDedup(existing) as string | Date).getTime() : 0;
                if (dNew >= dOld) quoteDedupMap.set(key, order);
            }
        }
        const openQuotes = Array.from(quoteDedupMap.values());

        // Lost Deals: event-based (when order entered "Lost" status). Support multiple periods + previous period for comparison.
        const lostStatuses = new Set(statusConfigs.filter(c => c.isLost).map(c => c.label));
        const getLostEventDate = (o: Order): Date => {
            if (o.statusHistory && o.statusHistory.length > 0) {
                const historyEntry = o.statusHistory.find(h => h.status === o.orderStatus);
                if (historyEntry) return new Date(historyEntry.startDate);
                const sorted = [...o.statusHistory].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
                if (sorted.length > 0) return new Date(sorted[0].startDate);
            }
            return new Date(o.date);
        };
        const getRangeForPeriod = (period: LostDealsPeriod): { start: Date; end: Date } => {
            const y = now.getFullYear(), m = now.getMonth();
            if (period === 'THIS_MONTH') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
            if (period === 'LAST_MONTH') return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) };
            // LAST_3: last 3 full months (e.g. today in Feb -> Nov 1 to Jan 31)
            const end = new Date(y, m, 0, 23, 59, 59, 999);
            const start = new Date(y, m - 3, 1);
            return { start, end };
        };
        const getPreviousRangeForPeriod = (period: LostDealsPeriod): { start: Date; end: Date } => {
            const y = now.getFullYear(), m = now.getMonth();
            if (period === 'THIS_MONTH') return getRangeForPeriod('LAST_MONTH');
            if (period === 'LAST_MONTH') return { start: new Date(y, m - 2, 1), end: new Date(y, m - 1, 0, 23, 59, 59, 999) };
            const end = new Date(y, m - 3, 0, 23, 59, 59, 999);
            const start = new Date(y, m - 6, 1);
            return { start, end };
        };
        const inRange = (d: Date, r: { start: Date; end: Date }) => d.getTime() >= r.start.getTime() && d.getTime() <= r.end.getTime();
        const rangeCurrent = getRangeForPeriod(lostDealsPeriod);
        const rangePrevious = getPreviousRangeForPeriod(lostDealsPeriod);
        const lostRaw = orders.filter(o => lostStatuses.has(o.orderStatus) && inRange(getLostEventDate(o), rangeCurrent));
        const lostPrevRaw = orders.filter(o => lostStatuses.has(o.orderStatus) && inRange(getLostEventDate(o), rangePrevious));
        // Deduplicate by order number so the same logical order (e.g. 030226001) is not shown multiple times; keep the one with latest lost event date
        const dedupeByOrderNumber = (list: Order[]) => {
            const byNumber = new Map<string, Order>();
            for (const o of list) {
                const key = (o.orderNumber != null && String(o.orderNumber).trim() !== '') ? String(o.orderNumber).trim().toUpperCase() : o.id || '';
                if (!key) continue;
                const existing = byNumber.get(key);
                const oDate = getLostEventDate(o);
                if (!existing || getLostEventDate(existing).getTime() < oDate.getTime()) byNumber.set(key, o);
            }
            return Array.from(byNumber.values());
        };
        const lostDealsList = dedupeByOrderNumber(lostRaw);
        const lostDealsPreviousList = dedupeByOrderNumber(lostPrevRaw);

        // Collection: use deduplicated active deals (one per order number, like Today/Month/Year) so modal and counts match Orders page
        const collectionDealsByNumber = new Map<string, Order>();
        for (const order of activeDeals) {
            const raw = (order.orderNumber != null && order.orderNumber !== '') ? String(order.orderNumber).trim() : '';
            const key = raw !== '' ? raw.toUpperCase() : (order.id || '');
            if (!key) continue;
            const existing = collectionDealsByNumber.get(key);
            if (!existing) {
                collectionDealsByNumber.set(key, order);
            } else {
                const dNew = dateKeyForDedup(order) ? new Date(dateKeyForDedup(order) as string | Date).getTime() : 0;
                const dOld = dateKeyForDedup(existing) ? new Date(dateKeyForDedup(existing) as string | Date).getTime() : 0;
                if (dNew >= dOld) collectionDealsByNumber.set(key, order);
            }
        }
        const collectionDeals = Array.from(collectionDealsByNumber.values());

        // Collection Stats Logic (with order lists for modal drill-down)
        let collectionOverdue = { count: 0, amountInclVat: 0 };
        let collectionMonth = { count: 0, amountInclVat: 0 };
        const collectionOverdueOrders: Order[] = [];
        const collectionThisMonthOrders: Order[] = [];

        collectionDeals.forEach(order => {
            if (order.paymentStatus === PaymentStatus.PAID) return;

            // Logic for "Upon Completion"
            if (order.paymentTerms === 'עם סיום העבודה') {
                const config = statusConfigs.find(c => c.label === order.orderStatus);
                // If not completed yet, skip collection stats (it's not due)
                if (!config?.isCompleted) return;
            }

            const { totalAmount, totalPaid } = calculateOrderTotals(order);
            const orderVat = order.vatRate ?? vatRate;
            const totalInclVat = totalAmount * (1 + orderVat / 100);
            const balanceInclVat = Math.max(0, totalInclVat - totalPaid);
            if (balanceInclVat < 0.01) return;

            // LOGIC CHANGE: Use dealStartDate for payment calculation if available
            const calculationBaseDate = order.dealStartDate || order.date;
            const dueDate = calculateDueDate(calculationBaseDate, order.paymentTerms);

            // Normalize dates to midnight for comparison
            const dueDateClean = new Date(dueDate);
            dueDateClean.setHours(0,0,0,0);
            const todayClean = new Date();
            todayClean.setHours(0,0,0,0);

            if (dueDateClean < todayClean) {
                collectionOverdue.count++;
                collectionOverdue.amountInclVat += balanceInclVat;
                collectionOverdueOrders.push(order);
            } else {
                // Check if due date is in current month/year
                if (dueDateClean.getMonth() === todayClean.getMonth() && dueDateClean.getFullYear() === todayClean.getFullYear()) {
                    collectionMonth.count++;
                    collectionMonth.amountInclVat += balanceInclVat;
                    collectionThisMonthOrders.push(order);
                }
            }
        });

        return {
            daily: calculateMetrics(dailyDeals),
            monthly: calculateMetrics(monthlyDeals),
            yearly: calculateMetrics(yearlyDeals),
            dailyDealsList: dailyDeals,
            monthlyDealsList: monthlyDeals,
            yearlyDealsList: yearlyDeals,
            lost: calculateMetrics(lostDealsList),
            lostPrevious: calculateMetrics(lostDealsPreviousList),
            lostDealsList,
            lostPeriodLabel: lostDealsPeriod === 'THIS_MONTH' ? 'החודש' : lostDealsPeriod === 'LAST_MONTH' ? 'חודש שעבר' : '3 חודשים אחרונים',
            leads: untouchedLeads.length,
            untouchedLeadsList: untouchedLeads,
            quotes: {
                count: openQuotes.length,
                ...calculateMetrics(openQuotes),
                list: openQuotes
            },
            collection: {
                overdue: collectionOverdue,
                thisMonth: collectionMonth,
                overdueOrders: collectionOverdueOrders,
                thisMonthOrders: collectionThisMonthOrders
            }
        };
    }, [orders, statusConfigs, vatRate, lostDealsPeriod]);

    const formatCurrency = (val: number) => val.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    
    const TimeFrameBlock = ({ title, data, colorClass, bgClass, hideProfitAndMargin, onCardClick }: { title: string, data: FinancialMetric, colorClass: string, bgClass: string; hideProfitAndMargin?: boolean; onCardClick?: () => void }) => (
            <div
                className={`p-4 rounded-xl border border-slate-100 flex flex-col justify-between min-h-[130px] hover:shadow-md transition-all ${bgClass} ${onCardClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-300' : ''}`}
                {...(onCardClick && {
                    role: 'button',
                    tabIndex: 0,
                    onClick: onCardClick,
                    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(); } },
                })}
            >
                <div className="flex justify-between items-start mb-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h4>
                    <span className="text-xs bg-white/50 px-2 py-0.5 rounded-full text-slate-600 font-medium">{data.count} עסקאות</span>
                </div>
                <div className="flex-grow flex flex-col justify-center mb-2">
                    <div className={`text-2xl font-black ${colorClass}`}>
                        {formatCurrency(data.revenueExclVat)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">לא כולל מע"מ</div>
                </div>
                {!hideProfitAndMargin && (
                    <div className="space-y-1 pt-2 border-t border-slate-200/50">
                        <div className="flex justify-between text-xs items-center">
                            <span className="text-slate-500">רווח:</span>
                            <span className="font-bold text-emerald-600">{formatCurrency(data.profit)}</span>
                        </div>
                        <div className="flex justify-between text-xs items-center">
                            <span className="text-slate-500">אחוז (רווח מהעלות):</span>
                            <span className="font-medium text-slate-700 bg-white px-1.5 rounded">{data.margin.toFixed(1)}%</span>
                        </div>
                    </div>
                )}
            </div>
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-indigo-700">
                <div className="flex items-center text-white">
                    <div className="p-2 bg-white/10 rounded-lg me-3">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-yellow-300">
                            <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576-2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576L8.279 5.044A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold leading-tight">מספר חזק</h2>
                        <p className="text-xs text-indigo-100 opacity-90">תמונת מצב עסקית בזמן אמת</p>
                    </div>
                </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 bg-white">
                <TimeFrameBlock title="היום" data={stats.daily} colorClass="text-indigo-600" bgClass="bg-indigo-50/30" hideProfitAndMargin={isEmployee} onCardClick={() => setDailyModalOpen(true)} />
                <TimeFrameBlock title="החודש" data={stats.monthly} colorClass="text-blue-600" bgClass="bg-blue-50/30" hideProfitAndMargin={isEmployee} onCardClick={() => setMonthlyModalOpen(true)} />
                {!isEmployee && <TimeFrameBlock title="השנה" data={stats.yearly} colorClass="text-sky-700" bgClass="bg-sky-50/30" onCardClick={() => setYearlyModalOpen(true)} />}

                {/* Collection Stats (New) - click opens modal */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCollectionModalOpen(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollectionModalOpen(true); } }}
                    className="bg-rose-50/40 border border-rose-100 p-4 rounded-xl flex flex-col justify-between min-h-[130px] hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-1"
                >
                    <div className="flex justify-between items-start mb-1">
                        <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                <path fillRule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm12 4a3 3 0 11-6 0 3 3 0 016 0zM4 9a1 1 0 100-2 1 1 0 000 2zm13-1a1 1 0 11-2 0 1 1 0 012 0zM1.75 14.5a.75.75 0 000 1.5c4.417 0 8.693.603 12.749 1.73 1.111.309 2.251-.512 2.251-1.696v-.784a.75.75 0 00-1.5 0v.784a2.718 2.718 0 01-.529.134c-4.303 1.256-8.99 1.582-13.676.832H1.75z" clipRule="evenodd" />
                            </svg>
                            גבייה
                        </h4>
                    </div>
                    <div className="space-y-2 flex-grow flex flex-col justify-center">
                        <div className="flex justify-between items-center border-b border-rose-200/50 pb-1">
                            <span className="text-[10px] text-rose-800 font-bold">בחריגה ({stats.collection.overdue.count})</span>
                            <span className="text-xs font-bold text-red-600">{formatCurrency(stats.collection.overdue.amountInclVat)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-600">החודש ({stats.collection.thisMonth.count})</span>
                            <span className="text-xs font-bold text-slate-700">{formatCurrency(stats.collection.thisMonth.amountInclVat)}</span>
                        </div>
                    </div>
                    <div className="text-[9px] text-rose-400 text-center pt-1 mt-1 border-t border-rose-100">כולל מע"מ</div>
                </div>

                {/* Untouched Leads - click opens modal */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setLeadsModalOpen(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLeadsModalOpen(true); } }}
                    className="bg-orange-50/40 border border-orange-100 p-4 rounded-xl flex flex-col justify-center items-center text-center min-h-[130px] hover:shadow-md transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-1"
                >
                    <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                    </div>
                    <div className="text-3xl font-black text-orange-600 mb-1">{stats.leads}</div>
                    <div className="text-sm font-bold text-slate-600">לידים חדשים</div>
                    <div className="text-[10px] text-slate-400 mt-1">ממתינים לטיפול</div>
                </div>

                {/* Open Quotes - click opens modal */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setQuotesModalOpen(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQuotesModalOpen(true); } }}
                    className="bg-purple-50/40 border border-purple-100 p-4 rounded-xl flex flex-col justify-between min-h-[130px] hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-1"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-3xl font-black text-purple-600">{stats.quotes.count}</div>
                            <div className="text-xs font-bold text-slate-600 mt-1">הצעות מחיר</div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-bold text-slate-700">{formatCurrency(stats.quotes.revenueExclVat)}</div>
                            <div className="text-[10px] text-slate-400">פוטנציאל</div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-purple-200/50 mt-2">
                        <span className="text-[10px] font-medium text-slate-500">רווח צפוי:</span>
                        <span className="text-xs font-bold text-purple-700 flex items-center gap-1 bg-purple-100 px-1.5 py-0.5 rounded">
                            {formatCurrency(stats.quotes.profit)}
                            <span className="text-[9px] opacity-80 ml-1">
                                ({stats.quotes.margin.toFixed(0)}%)
                            </span>
                        </span>
                    </div>
                </div>

                {/* Lost Potential (New Card) - click opens detail modal */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setLostDealsModalOpen(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLostDealsModalOpen(true); } }}
                    className="bg-red-50/60 border border-red-200 p-4 rounded-xl flex flex-col justify-between min-h-[130px] hover:shadow-md transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-3xl font-black text-red-600">{stats.lost.count}</div>
                            <div className="text-xs font-bold text-red-800 mt-1">עסקאות אבודות</div>
                            <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                                <select
                                    value={lostDealsPeriod}
                                    onChange={(e) => setLostDealsPeriod(e.target.value as LostDealsPeriod)}
                                    className="text-[10px] text-red-600 bg-white/80 border border-red-100 rounded px-1 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-300"
                                    aria-label="בחירת תקופה לעסקאות אבודות"
                                >
                                    <option value="THIS_MONTH">החודש</option>
                                    <option value="LAST_MONTH">חודש שעבר</option>
                                    <option value="LAST_3">3 חודשים אחרונים</option>
                                </select>
                            </div>
                        </div>
                        <div className="bg-white p-1.5 rounded-full border border-red-100 text-red-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
                            </svg>
                        </div>
                    </div>
                    <div className="border-t border-red-200/50 pt-2 mt-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-medium text-red-500">אובדן הכנסה:</span>
                            <span className="text-xs font-bold text-red-700">{formatCurrency(stats.lost.revenueExclVat)}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-[10px] font-medium text-red-500">אובדן רווח:</span>
                            <span className="text-xs font-bold text-red-800 bg-red-100 px-1.5 py-0.5 rounded">{formatCurrency(stats.lost.profit)}</span>
                        </div>
                        {stats.lostPrevious && (stats.lostPrevious.count > 0 || stats.lost.count > 0) && (
                            <div className="text-[10px] text-slate-500 mt-1.5 pt-1 border-t border-red-100/50">
                                לעומת תקופה קודמת: {stats.lostPrevious.count} עסקאות · {formatCurrency(stats.lostPrevious.revenueExclVat)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Lost Deals Detail Modal */}
                {lostDealsModalOpen && (
                    <Modal
                        title="עסקאות אבודות"
                        onClose={() => setLostDealsModalOpen(false)}
                    >
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-slate-600">תקופה:</span>
                                <select
                                    value={lostDealsPeriod}
                                    onChange={(e) => setLostDealsPeriod(e.target.value as LostDealsPeriod)}
                                    className="text-sm border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary focus:border-primary"
                                >
                                    <option value="THIS_MONTH">החודש</option>
                                    <option value="LAST_MONTH">חודש שעבר</option>
                                    <option value="LAST_3">3 חודשים אחרונים</option>
                                </select>
                                {stats.lostPrevious && (stats.lostPrevious.count > 0 || stats.lost.count > 0) && (
                                    <span className="text-xs text-slate-500">לעומת תקופה קודמת: {stats.lostPrevious.count} עסקאות, {formatCurrency(stats.lostPrevious.revenueExclVat)} אובדן הכנסה</span>
                                )}
                            </div>
                            <div className="overflow-x-auto max-h-[60vh] border border-slate-200 rounded-lg">
                                <table className="min-w-full text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2">הזמנה</th>
                                            <th className="px-3 py-2">תיאור</th>
                                            <th className="px-3 py-2">אובדן הכנסה</th>
                                            <th className="px-3 py-2">אובדן רווח</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {stats.lostDealsList.length === 0 ? (
                                            <tr><td colSpan={4} className="px-3 py-4 text-slate-500 text-center">אין עסקאות אבודות בתקופה הנבחרת</td></tr>
                                        ) : (
                                            stats.lostDealsList.map((order) => {
                                                const { totalAmount, profit } = calculateOrderTotals(order);
                                                return (
                                                    <tr
                                                        key={order.id}
                                                        className="hover:bg-red-50/50 cursor-pointer"
                                                        onClick={() => { onNavigateToOrder?.(order.id); setLostDealsModalOpen(false); }}
                                                    >
                                                        <td className="px-3 py-2 font-medium text-primary">{order.orderNumber}</td>
                                                        <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={order.description}>{order.description || '—'}</td>
                                                        <td className="px-3 py-2 font-medium">{formatCurrency(totalAmount)}</td>
                                                        <td className="px-3 py-2">{formatCurrency(profit)}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Modal>
                )}

                {/* Today's deals modal */}
                {dailyModalOpen && (
                    <Modal title="עסקאות שאושרו היום" onClose={() => setDailyModalOpen(false)}>
                        <div className="overflow-x-auto max-h-[60vh] border border-slate-200 rounded-lg">
                            <table className="min-w-full text-sm text-right">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2">הזמנה</th>
                                        <th className="px-3 py-2">תיאור</th>
                                        <th className="px-3 py-2">הכנסה</th>
                                        <th className="px-3 py-2">רווח</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stats.dailyDealsList.length === 0 ? (
                                        <tr><td colSpan={4} className="px-3 py-4 text-slate-500 text-center">אין עסקאות היום</td></tr>
                                    ) : (
                                        stats.dailyDealsList.map((order) => {
                                            const { totalAmount, profit } = calculateOrderTotals(order);
                                            return (
                                                <tr key={order.id} className="hover:bg-indigo-50/50 cursor-pointer" onClick={() => { onNavigateToOrder?.(order.id); setDailyModalOpen(false); }}>
                                                    <td className="px-3 py-2 font-medium text-primary">{order.orderNumber}</td>
                                                    <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={order.description}>{order.description || '—'}</td>
                                                    <td className="px-3 py-2 font-medium">{formatCurrency(totalAmount)}</td>
                                                    <td className="px-3 py-2">{formatCurrency(profit)}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Modal>
                )}

                {/* Month deals modal */}
                {monthlyModalOpen && (
                    <Modal title="עסקאות החודש" onClose={() => setMonthlyModalOpen(false)}>
                        <div className="overflow-x-auto max-h-[60vh] border border-slate-200 rounded-lg">
                            <table className="min-w-full text-sm text-right">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2">הזמנה</th>
                                        <th className="px-3 py-2">תיאור</th>
                                        <th className="px-3 py-2">הכנסה</th>
                                        <th className="px-3 py-2">רווח</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stats.monthlyDealsList.length === 0 ? (
                                        <tr><td colSpan={4} className="px-3 py-4 text-slate-500 text-center">אין עסקאות בחודש</td></tr>
                                    ) : (
                                        stats.monthlyDealsList.map((order) => {
                                            const { totalAmount, profit } = calculateOrderTotals(order);
                                            return (
                                                <tr key={order.id} className="hover:bg-blue-50/50 cursor-pointer" onClick={() => { onNavigateToOrder?.(order.id); setMonthlyModalOpen(false); }}>
                                                    <td className="px-3 py-2 font-medium text-primary">{order.orderNumber}</td>
                                                    <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={order.description}>{order.description || '—'}</td>
                                                    <td className="px-3 py-2 font-medium">{formatCurrency(totalAmount)}</td>
                                                    <td className="px-3 py-2">{formatCurrency(profit)}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Modal>
                )}

                {/* Year deals modal */}
                {yearlyModalOpen && (
                    <Modal title="עסקאות השנה" onClose={() => setYearlyModalOpen(false)}>
                        <div className="overflow-x-auto max-h-[60vh] border border-slate-200 rounded-lg">
                            <table className="min-w-full text-sm text-right">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2">הזמנה</th>
                                        <th className="px-3 py-2">תיאור</th>
                                        <th className="px-3 py-2">הכנסה</th>
                                        <th className="px-3 py-2">רווח</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stats.yearlyDealsList.length === 0 ? (
                                        <tr><td colSpan={4} className="px-3 py-4 text-slate-500 text-center">אין עסקאות השנה</td></tr>
                                    ) : (
                                        stats.yearlyDealsList.map((order) => {
                                            const { totalAmount, profit } = calculateOrderTotals(order);
                                            return (
                                                <tr key={order.id} className="hover:bg-sky-50/50 cursor-pointer" onClick={() => { onNavigateToOrder?.(order.id); setYearlyModalOpen(false); }}>
                                                    <td className="px-3 py-2 font-medium text-primary">{order.orderNumber}</td>
                                                    <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={order.description}>{order.description || '—'}</td>
                                                    <td className="px-3 py-2 font-medium">{formatCurrency(totalAmount)}</td>
                                                    <td className="px-3 py-2">{formatCurrency(profit)}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Modal>
                )}

                {/* Collection modal - overdue + this month */}
                {collectionModalOpen && (
                    <Modal title="גבייה" onClose={() => setCollectionModalOpen(false)}>
                        <div className="space-y-4">
                            <section>
                                <h4 className="text-sm font-bold text-rose-700 mb-2">בחריגה ({stats.collection.overdueOrders.length})</h4>
                                <div className="overflow-x-auto max-h-[40vh] border border-slate-200 rounded-lg">
                                    <table className="min-w-full text-sm text-right">
                                        <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                            <tr>
                                                <th className="px-3 py-2">הזמנה</th>
                                                <th className="px-3 py-2">תיאור</th>
                                                <th className="px-3 py-2">יתרה לתשלום</th>
                                                <th className="px-3 py-2">מועד תשלום</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {stats.collection.overdueOrders.length === 0 ? (
                                                <tr><td colSpan={4} className="px-3 py-4 text-slate-500 text-center">אין חריגות</td></tr>
                                            ) : (
                                                stats.collection.overdueOrders.map((order) => {
                                                    const { totalAmount, totalPaid } = calculateOrderTotals(order);
                                                    const orderVat = order.vatRate ?? vatRate;
                                                    const dueWithVat = totalAmount * (1 + orderVat / 100);
                                                    const balanceInclVat = Math.max(0, dueWithVat - totalPaid);
                                                    const baseDate = order.dealStartDate || order.date;
                                                    const dueDate = calculateDueDate(baseDate, order.paymentTerms);
                                                    return (
                                                        <tr key={order.id} className="hover:bg-rose-50/50 cursor-pointer" onClick={() => { onNavigateToOrder?.(order.id); setCollectionModalOpen(false); }}>
                                                            <td className="px-3 py-2 font-medium text-primary">{order.orderNumber}</td>
                                                            <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={order.description}>{order.description || '—'}</td>
                                                            <td className="px-3 py-2 font-medium">{formatCurrency(balanceInclVat)}</td>
                                                            <td className="px-3 py-2">{new Date(dueDate).toLocaleDateString('he-IL')}</td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                            <section>
                                <h4 className="text-sm font-bold text-slate-700 mb-2">החודש ({stats.collection.thisMonthOrders.length})</h4>
                                <div className="overflow-x-auto max-h-[40vh] border border-slate-200 rounded-lg">
                                    <table className="min-w-full text-sm text-right">
                                        <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                            <tr>
                                                <th className="px-3 py-2">הזמנה</th>
                                                <th className="px-3 py-2">תיאור</th>
                                                <th className="px-3 py-2">יתרה לתשלום</th>
                                                <th className="px-3 py-2">מועד תשלום</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {stats.collection.thisMonthOrders.length === 0 ? (
                                                <tr><td colSpan={4} className="px-3 py-4 text-slate-500 text-center">אין תשלומים החודש</td></tr>
                                            ) : (
                                                stats.collection.thisMonthOrders.map((order) => {
                                                    const { totalAmount, totalPaid } = calculateOrderTotals(order);
                                                    const orderVat = order.vatRate ?? vatRate;
                                                    const dueWithVat = totalAmount * (1 + orderVat / 100);
                                                    const balanceInclVat = Math.max(0, dueWithVat - totalPaid);
                                                    const baseDate = order.dealStartDate || order.date;
                                                    const dueDate = calculateDueDate(baseDate, order.paymentTerms);
                                                    return (
                                                        <tr key={order.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => { onNavigateToOrder?.(order.id); setCollectionModalOpen(false); }}>
                                                            <td className="px-3 py-2 font-medium text-primary">{order.orderNumber}</td>
                                                            <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={order.description}>{order.description || '—'}</td>
                                                            <td className="px-3 py-2 font-medium">{formatCurrency(balanceInclVat)}</td>
                                                            <td className="px-3 py-2">{new Date(dueDate).toLocaleDateString('he-IL')}</td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    </Modal>
                )}

                {/* Leads modal */}
                {leadsModalOpen && (
                    <Modal title="לידים חדשים – ממתינים לטיפול" onClose={() => setLeadsModalOpen(false)}>
                        <div className="overflow-x-auto max-h-[60vh] border border-slate-200 rounded-lg">
                            <table className="min-w-full text-sm text-right">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2">הזמנה</th>
                                        <th className="px-3 py-2">תיאור</th>
                                        <th className="px-3 py-2">סטטוס</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stats.untouchedLeadsList.length === 0 ? (
                                        <tr><td colSpan={3} className="px-3 py-4 text-slate-500 text-center">אין לידים ממתינים</td></tr>
                                    ) : (
                                        stats.untouchedLeadsList.map((order) => (
                                            <tr key={order.id} className="hover:bg-orange-50/50 cursor-pointer" onClick={() => { onNavigateToOrder?.(order.id); setLeadsModalOpen(false); }}>
                                                <td className="px-3 py-2 font-medium text-primary">{order.orderNumber}</td>
                                                <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={order.description}>{order.description || '—'}</td>
                                                <td className="px-3 py-2">{order.orderStatus || '—'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Modal>
                )}

                {/* Quotes modal */}
                {quotesModalOpen && (
                    <Modal title="הצעות מחיר" onClose={() => setQuotesModalOpen(false)}>
                        <div className="overflow-x-auto max-h-[60vh] border border-slate-200 rounded-lg">
                            <table className="min-w-full text-sm text-right">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2">הזמנה</th>
                                        <th className="px-3 py-2">תיאור</th>
                                        <th className="px-3 py-2">פוטנציאל</th>
                                        <th className="px-3 py-2">רווח צפוי</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stats.quotes.list.length === 0 ? (
                                        <tr><td colSpan={4} className="px-3 py-4 text-slate-500 text-center">אין הצעות מחיר פתוחות</td></tr>
                                    ) : (
                                        stats.quotes.list.map((order) => {
                                            const { totalAmount, profit } = calculateOrderTotals(order);
                                            return (
                                                <tr key={order.id} className="hover:bg-purple-50/50 cursor-pointer" onClick={() => { onNavigateToOrder?.(order.id); setQuotesModalOpen(false); }}>
                                                    <td className="px-3 py-2 font-medium text-primary">{order.orderNumber}</td>
                                                    <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={order.description}>{order.description || '—'}</td>
                                                    <td className="px-3 py-2 font-medium">{formatCurrency(totalAmount)}</td>
                                                    <td className="px-3 py-2">{formatCurrency(profit)}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Modal>
                )}

            </div>
        </div>
    );
};

// --- TaskItem Component ---
const TaskItem: React.FC<{ task: any, onNavigate: (id: string) => void }> = ({ task, onNavigate }) => {
    return (
        <div 
            className="p-3 bg-white border border-slate-200 rounded-lg mb-2 flex items-start gap-3 hover:shadow-md transition-all cursor-pointer group" 
            onClick={() => onNavigate(task.orderId)}
        >
             <div className={`mt-1 p-1.5 rounded-full ${task.isOverdue ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                 <TaskIcon className="w-4 h-4" />
             </div>
             <div className="flex-1">
                 <div className="flex justify-between items-start">
                    <p className="text-sm font-semibold text-slate-800 line-clamp-2 group-hover:text-primary transition-colors">{task.content}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ms-2 ${task.isOverdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        תאריך יעד: {new Date(task.dueDate).toLocaleDateString('he-IL', {day: '2-digit', month: '2-digit', year: '2-digit'})}
                    </span>
                 </div>
                 
                 <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                     <div className="flex items-center gap-1 min-w-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-400">
                            <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
                        </svg>
                        <span className="truncate font-medium">{task.customerName}</span>
                     </div>
                     <div className="w-px h-3 bg-slate-300"></div>
                     <div className="font-mono text-slate-400">#{task.orderNumber}</div>
                 </div>
             </div>
        </div>
    )
}

// --- Dashboard Component ---
const Dashboard: React.FC<DashboardProps> = ({ 
    customers, orders, activities, monthlyGoal, setMonthlyGoal, employees, onNavigateToOrder, statusConfigs, vatRate, systemMessage, manualEvents, addManualEvent
}) => {
    const { user } = useAuth();
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const [newGoal, setNewGoal] = useState(monthlyGoal);
    const [taskFilter, setTaskFilter] = useState<'TODAY' | 'OVERDUE' | 'FUTURE'>('TODAY');
    const [wallPosts, setWallPosts] = useState<WallPost[]>([]);
    const [wallInput, setWallInput] = useState('');
    const [wallSending, setWallSending] = useState(false);

    useEffect(() => {
        let cancelled = false;
        mongoService.getWallPosts().then(data => { if (!cancelled) setWallPosts(data); }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const handleSendWallPost = async () => {
        const content = wallInput.trim();
        if (!content || !user) return;
        setWallSending(true);
        try {
            const post: WallPost = {
                id: `wall_${Date.now()}`,
                authorId: user.id,
                authorName: user.name ?? 'משתמש',
                content,
                createdAt: new Date(),
            };
            const created = await mongoService.createWallPost(post);
            setWallPosts(prev => [created, ...prev]);
            setWallInput('');
        } catch (e) {
            console.error('Failed to create wall post:', e);
        } finally {
            setWallSending(false);
        }
    };

    // Aggregate Tasks
    const allTasks = useMemo(() => {
        const tasks: any[] = [];
        const today = new Date();
        today.setHours(0,0,0,0);

        orders.forEach(order => {
            if (order.timeline) {
                order.timeline.forEach(event => {
                    if (event.type === 'TASK' && !event.isCompleted && event.dueDate) {
                        const dueDate = new Date(event.dueDate);
                        dueDate.setHours(0,0,0,0);
                        
                        const customer = customers.find(c => c.id === order.customerId);

                        tasks.push({
                            id: event.id,
                            content: event.content,
                            dueDate: dueDate,
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            customerName: customer?.name || 'לקוח כללי',
                            isOverdue: dueDate < today,
                            isToday: dueDate.getTime() === today.getTime(),
                            assigneeId: event.assigneeId
                        });
                    }
                });
            }
        });
        return tasks.sort((a,b) => a.dueDate.getTime() - b.dueDate.getTime());
    }, [orders, customers]);

    const taskCounts = useMemo(() => {
        return {
            TODAY: allTasks.filter(t => t.isToday).length,
            OVERDUE: allTasks.filter(t => t.isOverdue).length,
            FUTURE: allTasks.filter(t => !t.isToday && !t.isOverdue).length
        }
    }, [allTasks]);

    const displayedTasks = useMemo(() => {
        if (taskFilter === 'TODAY') return allTasks.filter(t => t.isToday);
        if (taskFilter === 'OVERDUE') return allTasks.filter(t => t.isOverdue);
        if (taskFilter === 'FUTURE') return allTasks.filter(t => !t.isToday && !t.isOverdue);
        return [];
    }, [allTasks, taskFilter]);

    const handleSaveGoal = () => {
        setMonthlyGoal(newGoal);
        setIsGoalModalOpen(false);
    };

    // יעד הכנסות חודשי: כמו המספרים החזקים – עסקאות מאושרות אחרי דדופליקציה לפי מספר הזמנה, לפי תאריך אישור (dealStartDate) בחודש הנוכחי
    const currentMonthlyRevenue = useMemo(() => {
         const now = new Date();
         const monthStr = getDateStringIsrael(now).slice(0, 7);
         const activeDeals = orders.filter(order => {
             const config = statusConfigs.find(c => c.label === order.orderStatus);
             return config ? config.isActiveDeal === true : false;
         });
         const dateKeyForDedup = (o: Order) => o.dealStartDate || o.date;
         const seenByOrderNumber = new Map<string, Order>();
         for (const order of activeDeals) {
             const raw = (order.orderNumber != null && order.orderNumber !== '') ? String(order.orderNumber).trim() : '';
             const key = raw !== '' ? raw.toUpperCase() : (order.id || '');
             if (!key) continue;
             const existing = seenByOrderNumber.get(key);
             if (!existing) {
                 seenByOrderNumber.set(key, order);
             } else {
                 const dNew = dateKeyForDedup(order) ? new Date(dateKeyForDedup(order) as string | Date).getTime() : 0;
                 const dOld = dateKeyForDedup(existing) ? new Date(dateKeyForDedup(existing) as string | Date).getTime() : 0;
                 if (dNew >= dOld) seenByOrderNumber.set(key, order);
             }
         }
         const deduped = Array.from(seenByOrderNumber.values());
         const orderDateStr = (o: Order) => getDateStringIsrael(o.dealStartDate || o.date);
         const monthlyDeals = deduped.filter(o => orderDateStr(o).slice(0, 7) === monthStr);
         const forGoal = monthlyDeals.filter(o => !o.hiddenFromSalesGoal);
         return forGoal.reduce((sum, order) => sum + calculateOrderTotals(order).totalAmount, 0);
    }, [orders, statusConfigs]);

    return (
        <div className="space-y-6 pb-10">
            {/* Top Row: Goal, System Message */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="md:col-span-1 h-full">
                    <MonthlyGoalWidget current={currentMonthlyRevenue} target={monthlyGoal} onEdit={() => setIsGoalModalOpen(true)} canEdit={user?.roleType === 'ADMIN'} />
                </div>
                <div className="md:col-span-2 h-full">
                    <SystemMessageWidget message={systemMessage} />
                </div>
            </div>

            {/* Strong Numbers Row */}
            <StrongNumberCard orders={orders} statusConfigs={statusConfigs} vatRate={vatRate} roleType={user?.roleType} onNavigateToOrder={onNavigateToOrder} />

            {/* Bottom Section: Operations Calendar & Tasks */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 
                 {/* Smart Operations Calendar (New) */}
                 <div className="lg:col-span-2">
                    <OperationsCalendarWidget 
                        orders={orders} 
                        manualEvents={manualEvents}
                        addManualEvent={addManualEvent}
                        onNavigateToOrder={onNavigateToOrder}
                    />
                 </div>

                 {/* Tasks Hub Widget */}
                <div className="bg-white rounded-lg shadow-md flex flex-col h-[500px] border border-slate-100">
                     <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-lg">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center">
                            <TaskIcon className="w-5 h-5 me-2 text-primary"/>
                            מרכז משימות
                        </h2>
                        <div className="flex bg-slate-50 rounded-lg p-1 border border-slate-200">
                            <button 
                                onClick={() => setTaskFilter('TODAY')}
                                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${taskFilter === 'TODAY' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                היום
                                {taskCounts.TODAY > 0 && <span className="bg-emerald-100 text-emerald-800 px-1 rounded-full text-[10px]">{taskCounts.TODAY}</span>}
                            </button>
                             <button 
                                onClick={() => setTaskFilter('OVERDUE')}
                                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${taskFilter === 'OVERDUE' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                איחור
                                {taskCounts.OVERDUE > 0 && <span className="bg-red-100 text-red-800 px-1 rounded-full text-[10px]">{taskCounts.OVERDUE}</span>}
                            </button>
                            <button 
                                onClick={() => setTaskFilter('FUTURE')}
                                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${taskFilter === 'FUTURE' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                עתיד
                                {taskCounts.FUTURE > 0 && <span className="bg-blue-100 text-blue-800 px-1 rounded-full text-[10px]">{taskCounts.FUTURE}</span>}
                            </button>
                        </div>
                     </div>
                     <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
                        {displayedTasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <TaskIcon className="w-12 h-12 mb-3 opacity-10"/>
                                <p>אין משימות בקטגוריה זו</p>
                            </div>
                        ) : (
                            displayedTasks.map(task => (
                                <TaskItem 
                                    key={task.id} 
                                    task={task} 
                                    onNavigate={(id) => onNavigateToOrder && onNavigateToOrder(id)} 
                                />
                            ))
                        )}
                     </div>
                     <div className="p-3 bg-slate-50 text-xs text-center text-slate-400 border-t border-slate-100 rounded-b-lg">
                        מציג {displayedTasks.length} משימות מתוך {allTasks.length} סה"כ
                     </div>
                </div>
            </div>

            {/* Wall - קיר צוות */}
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/50">
                    <div className="bg-primary/10 p-2 rounded-lg">
                        <NoteIcon className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">קיר צוות</h2>
                </div>
                <div className="p-4 border-b border-slate-100">
                    <div className="flex gap-2">
                        <textarea
                            value={wallInput}
                            onChange={e => setWallInput(e.target.value)}
                            placeholder="כתוב הודעה לצוות..."
                            rows={2}
                            className="flex-1 rounded-lg border-2 border-slate-200 bg-white py-2 px-3 text-sm focus:border-primary focus:ring-primary resize-none"
                            dir="rtl"
                        />
                        <button
                            type="button"
                            onClick={handleSendWallPost}
                            disabled={!wallInput.trim() || !user || wallSending}
                            className="px-4 py-2 bg-primary text-white rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 self-end"
                        >
                            {wallSending ? 'שולח...' : 'שלח'}
                        </button>
                    </div>
                </div>
                <div className="min-h-[640px] max-h-[640px] overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {wallPosts.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-6">אין הודעות עדיין. התחל לכתוב.</p>
                    ) : (
                        wallPosts.map(post => {
                            const created = post.createdAt instanceof Date ? post.createdAt : new Date(post.createdAt);
                            const isNew = (Date.now() - created.getTime()) < 24 * 60 * 60 * 1000;
                            return (
                                <div key={post.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50">
                                    <div className="flex justify-between items-start gap-2">
                                        <p className="text-sm text-slate-800 flex-1 whitespace-pre-wrap" dir="rtl">{post.content}</p>
                                        {isNew && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">חדש</span>}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                        <span className="font-medium text-slate-600">{post.authorName}</span>
                                        <span>·</span>
                                        <span>{created.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                        {post.orderId && post.orderNumber && (
                                            <>
                                                <span>·</span>
                                                <button
                                                    type="button"
                                                    onClick={() => onNavigateToOrder && onNavigateToOrder(post.orderId!)}
                                                    className="text-primary hover:underline font-medium"
                                                >
                                                    הזמנה {post.orderNumber}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {isGoalModalOpen && (
                <Modal title="הגדרת יעד הכנסות חודשי" onClose={() => setIsGoalModalOpen(false)} size="lg">
                    <div className="space-y-4 text-start">
                        <div>
                            <label htmlFor="monthlyGoalInput" className="block text-sm font-medium text-slate-700">
                                סכום יעד (בשקלים)
                            </label>
                            <input
                                type="number"
                                id="monthlyGoalInput"
                                value={newGoal}
                                onChange={(e) => setNewGoal(Number(e.target.value))}
                                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-4 py-2 border"
                            />
                            <p className="text-xs text-slate-500 mt-1">היעד מתייחס להכנסות (ללא מע"מ) מעסקאות שאושרו בחודש הקלנדרי הנוכחי.</p>
                        </div>
                        <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                            <button type="button" onClick={() => setIsGoalModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300 transition-colors">ביטול</button>
                            <button type="button" onClick={handleSaveGoal} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 transition-colors">שמירה</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default Dashboard;
