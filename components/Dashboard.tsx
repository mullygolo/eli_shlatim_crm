
import React, { useState, useMemo, useEffect } from 'react';
import { Customer, Order, Activity, OrderStatus, Employee, OrderStatusConfiguration, PaymentStatus } from '../types';
import { TaskIcon, SettingsIcon, MegaphoneIcon } from './icons'; 
import { calculateOrderTotals, calculateDueDate } from '../utils/calculations';
import Modal from './Modal'; 

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
}

// --- Monthly Goal Widget ---
const MonthlyGoalWidget: React.FC<{
    current: number;
    target: number;
    onEdit: () => void;
}> = ({ current, target, onEdit }) => {
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
                <button onClick={onEdit} className="text-slate-400 hover:text-primary transition-colors">
                    <SettingsIcon className="w-5 h-5" />
                </button>
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

// --- System Message Widget ---
const SystemMessageWidget: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full flex flex-col relative overflow-hidden min-h-[180px]">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                <div className="bg-amber-100 p-1.5 rounded-full text-amber-600">
                    <MegaphoneIcon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">הודעות מערכת</h3>
            </div>
            <div className="flex-grow overflow-y-auto max-h-[120px] custom-scrollbar">
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm md:text-base">
                    {message || "אין הודעות חדשות."}
                </p>
            </div>
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

const StrongNumberCard: React.FC<{ 
    orders: Order[]; 
    statusConfigs: OrderStatusConfiguration[];
    vatRate: number;
}> = ({ orders, statusConfigs, vatRate }) => {
    
    // Helper to calculate metrics for a filtered list of orders
    const calculateMetrics = (filteredOrders: Order[]): FinancialMetric => {
        const result = filteredOrders.reduce((acc, order) => {
            const { totalAmount, profit } = calculateOrderTotals(order);
            acc.revenueExclVat += totalAmount;
            acc.profit += profit;
            return acc;
        }, { revenueExclVat: 0, profit: 0 });

        const revenueInclVat = result.revenueExclVat * (1 + vatRate / 100);
        const margin = result.revenueExclVat > 0 ? (result.profit / result.revenueExclVat) * 100 : 0;

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
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        // Filter active deals (Approved transactions)
        const activeDeals = orders.filter(order => {
             const config = statusConfigs.find(c => c.label === order.orderStatus);
             return config ? config.isActiveDeal : false;
        });

        // Helper to check date (uses dealStartDate if available, otherwise createdAt/date)
        const checkDate = (order: Order, startDate: Date) => {
            const dateToCheck = order.dealStartDate ? new Date(order.dealStartDate) : new Date(order.date);
            return dateToCheck.getTime() >= startDate.getTime();
        };

        const dailyDeals = activeDeals.filter(o => checkDate(o, startOfDay));
        const monthlyDeals = activeDeals.filter(o => checkDate(o, startOfMonth));
        const yearlyDeals = activeDeals.filter(o => checkDate(o, startOfYear));

        const untouchedLeads = orders.filter(o => o.orderStatus === OrderStatus.NEW_LEAD);
        const openQuotes = orders.filter(o => o.orderStatus === OrderStatus.QUOTE_SENT);

        // Collection Stats Logic
        let collectionOverdue = { count: 0, amountInclVat: 0 };
        let collectionMonth = { count: 0, amountInclVat: 0 };
        
        activeDeals.forEach(order => {
            if (order.paymentStatus === PaymentStatus.PAID) return;

            const { totalAmount } = calculateOrderTotals(order);
            const totalInclVat = totalAmount * (1 + vatRate / 100);
            
            const dueDate = calculateDueDate(order.date, order.paymentTerms);
            // Normalize dates to midnight for comparison
            const dueDateClean = new Date(dueDate);
            dueDateClean.setHours(0,0,0,0);
            const todayClean = new Date();
            todayClean.setHours(0,0,0,0);

            if (dueDateClean < todayClean) {
                collectionOverdue.count++;
                collectionOverdue.amountInclVat += totalInclVat;
            } else {
                // Check if due date is in current month/year
                if (dueDateClean.getMonth() === todayClean.getMonth() && dueDateClean.getFullYear() === todayClean.getFullYear()) {
                    collectionMonth.count++;
                    collectionMonth.amountInclVat += totalInclVat;
                }
            }
        });

        return {
            daily: calculateMetrics(dailyDeals),
            monthly: calculateMetrics(monthlyDeals),
            yearly: calculateMetrics(yearlyDeals),
            leads: untouchedLeads.length,
            quotes: {
                count: openQuotes.length,
                ...calculateMetrics(openQuotes)
            },
            collection: {
                overdue: collectionOverdue,
                thisMonth: collectionMonth
            }
        };
    }, [orders, statusConfigs, vatRate]);

    const formatCurrency = (val: number) => val.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
    
    const TimeFrameBlock = ({ title, data, colorClass, bgClass }: { title: string, data: FinancialMetric, colorClass: string, bgClass: string }) => (
        <div className={`p-4 rounded-xl border border-slate-100 flex flex-col justify-between min-h-[130px] hover:shadow-md transition-all ${bgClass}`}>
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
            
            <div className="space-y-1 pt-2 border-t border-slate-200/50">
                <div className="flex justify-between text-xs items-center">
                    <span className="text-slate-500">כולל מע"מ:</span>
                    <span className="font-medium text-slate-700">{formatCurrency(data.revenueInclVat)}</span>
                </div>
                <div className="flex justify-between text-xs items-center">
                    <span className="text-slate-500">רווח:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(data.profit)}</span>
                </div>
                <div className="flex justify-between text-xs items-center">
                    <span className="text-slate-500">אחוז:</span>
                    <span className="font-medium text-slate-700 bg-white px-1.5 rounded">{data.margin.toFixed(1)}%</span>
                </div>
            </div>
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
            
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 bg-white">
                <TimeFrameBlock title="היום" data={stats.daily} colorClass="text-indigo-600" bgClass="bg-indigo-50/30" />
                <TimeFrameBlock title="החודש" data={stats.monthly} colorClass="text-blue-600" bgClass="bg-blue-50/30" />
                <TimeFrameBlock title="השנה" data={stats.yearly} colorClass="text-sky-700" bgClass="bg-sky-50/30" />

                {/* Collection Stats (New) */}
                <div className="bg-rose-50/40 border border-rose-100 p-4 rounded-xl flex flex-col justify-between min-h-[130px] hover:shadow-md transition-all">
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

                {/* Untouched Leads */}
                <div className="bg-orange-50/40 border border-orange-100 p-4 rounded-xl flex flex-col justify-center items-center text-center min-h-[130px] hover:shadow-md transition-all group">
                    <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                    </div>
                    <div className="text-3xl font-black text-orange-600 mb-1">{stats.leads}</div>
                    <div className="text-sm font-bold text-slate-600">לידים חדשים</div>
                    <div className="text-[10px] text-slate-400 mt-1">ממתינים לטיפול</div>
                </div>

                {/* Open Quotes */}
                <div className="bg-purple-50/40 border border-purple-100 p-4 rounded-xl flex flex-col justify-between min-h-[130px] hover:shadow-md transition-all">
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
            </div>
        </div>
    );
};

// --- TaskItem Component ---
const TaskItem: React.FC<{ task: any, onNavigate: (id: string) => void }> = ({ task, onNavigate }) => {
    return (
        <div className="p-3 bg-white border border-slate-200 rounded-lg mb-2 flex items-start gap-3 hover:shadow-sm transition-shadow">
             <div className="mt-0.5 text-slate-400">
                 <TaskIcon className="w-5 h-5" />
             </div>
             <div className="flex-1 cursor-pointer" onClick={() => onNavigate(task.orderId)}>
                 <p className="text-sm font-medium text-slate-800 line-clamp-1">{task.content}</p>
                 <div className="flex justify-between items-center mt-1">
                     <span className="text-xs text-slate-500">
                        הזמנה: <span className="font-mono font-bold text-primary">{task.orderNumber}</span>
                     </span>
                     <span className={`text-xs font-bold ${task.isOverdue ? 'text-red-600' : 'text-slate-400'}`}>
                        {new Date(task.dueDate).toLocaleDateString('he-IL')}
                     </span>
                 </div>
             </div>
        </div>
    )
}

// --- Dashboard Component ---
const Dashboard: React.FC<DashboardProps> = ({ 
    customers, orders, activities, monthlyGoal, setMonthlyGoal, employees, onNavigateToOrder, statusConfigs, vatRate, systemMessage 
}) => {
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const [newGoal, setNewGoal] = useState(monthlyGoal);
    const [taskFilter, setTaskFilter] = useState<'TODAY' | 'OVERDUE' | 'FUTURE'>('TODAY');

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
                        
                        tasks.push({
                            id: event.id,
                            content: event.content,
                            dueDate: dueDate,
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            isOverdue: dueDate < today,
                            isToday: dueDate.getTime() === today.getTime(),
                            assigneeId: event.assigneeId
                        });
                    }
                });
            }
        });
        return tasks.sort((a,b) => a.dueDate.getTime() - b.dueDate.getTime());
    }, [orders]);

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

    // Calculate current monthly revenue for the Goal Widget
    const currentMonthlyRevenue = useMemo(() => {
         const now = new Date();
         const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
         return orders.reduce((sum, order) => {
             const dateToCheck = order.dealStartDate ? new Date(order.dealStartDate) : new Date(order.date);
             if (dateToCheck >= startOfMonth) {
                 const config = statusConfigs.find(c => c.label === order.orderStatus);
                 if (config && config.isActiveDeal) {
                     return sum + calculateOrderTotals(order).totalAmount;
                 }
             }
             return sum;
         }, 0);
    }, [orders, statusConfigs]);

    return (
        <div className="space-y-6 pb-10">
            {/* Top Row: Goal, System Message */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="md:col-span-1 h-full">
                    <MonthlyGoalWidget current={currentMonthlyRevenue} target={monthlyGoal} onEdit={() => setIsGoalModalOpen(true)} />
                </div>
                <div className="md:col-span-2 h-full">
                    <SystemMessageWidget message={systemMessage} />
                </div>
            </div>

            {/* Strong Numbers Row */}
            <StrongNumberCard orders={orders} statusConfigs={statusConfigs} vatRate={vatRate} />

            {/* Bottom Section: Tasks & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* Tasks Hub Widget */}
                <div className="lg:col-span-2 bg-white rounded-lg shadow-md flex flex-col h-[500px] border border-slate-100">
                     <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-lg">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center">
                            <TaskIcon className="w-5 h-5 me-2 text-primary"/>
                            מרכז משימות
                        </h2>
                        <div className="flex bg-slate-50 rounded-lg p-1 border border-slate-200">
                            <button 
                                onClick={() => setTaskFilter('TODAY')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${taskFilter === 'TODAY' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                לביצוע היום
                                {taskCounts.TODAY > 0 && <span className="bg-emerald-100 text-emerald-800 px-1.5 rounded-full text-xs">{taskCounts.TODAY}</span>}
                            </button>
                             <button 
                                onClick={() => setTaskFilter('OVERDUE')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${taskFilter === 'OVERDUE' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                בפיגור
                                {taskCounts.OVERDUE > 0 && <span className="bg-red-100 text-red-800 px-1.5 rounded-full text-xs">{taskCounts.OVERDUE}</span>}
                            </button>
                            <button 
                                onClick={() => setTaskFilter('FUTURE')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${taskFilter === 'FUTURE' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                עתידי
                                {taskCounts.FUTURE > 0 && <span className="bg-blue-100 text-blue-800 px-1.5 rounded-full text-xs">{taskCounts.FUTURE}</span>}
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

                {/* Recent Activity */}
                <div className="bg-white p-5 rounded-lg shadow-md h-[500px] flex flex-col border border-slate-100">
                     <h2 className="text-lg font-bold mb-4 pb-2 border-b border-slate-100 text-slate-800">פעילות אחרונה</h2>
                     <div className="flex-1 overflow-y-auto pe-2 custom-scrollbar">
                        <ul className="space-y-0 relative">
                            <div className="absolute top-2 bottom-2 right-1.5 w-px bg-slate-200"></div>
                            {activities.map((activity, idx) => (
                                <li key={activity.id} className="text-sm text-slate-600 py-3 relative pr-6">
                                    <div className="absolute right-0 top-4 w-3 h-3 rounded-full border-2 border-white bg-slate-300 z-10"></div>
                                    <p className="font-medium text-slate-800">{activity.description}</p>
                                    <p className="text-xs text-slate-400 mt-1">{activity.timestamp.toLocaleString('he-IL')}</p>
                                </li>
                            ))}
                        </ul>
                     </div>
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
