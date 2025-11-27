
import React, { useState } from 'react';
import { Deal, DealStage, Customer } from '../types';
import { DEAL_STAGES_ORDERED } from '../constants';
import Modal from './Modal';
import { PlusIcon } from './icons';

interface DealCardProps {
    deal: Deal;
    customerName: string;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, dealId: string) => void;
}

const DealCard: React.FC<DealCardProps> = ({ deal, customerName, onDragStart }) => (
    <div
        draggable
        onDragStart={(e) => onDragStart(e, deal.id)}
        className="bg-white p-4 mb-3 rounded-lg shadow-sm cursor-grab border border-slate-200 text-start"
    >
        <p className="font-semibold text-slate-800">{deal.name}</p>
        <p className="text-sm text-slate-500">{customerName}</p>
        <p className="text-lg font-bold text-primary mt-2">${deal.value.toLocaleString()}</p>
    </div>
);

interface KanbanColumnProps {
    stage: DealStage;
    deals: Deal[];
    customers: Customer[];
    onDragStart: (e: React.DragEvent<HTMLDivElement>, dealId: string) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, stage: DealStage) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ stage, deals, customers, onDragStart, onDrop }) => {
    const getCustomerName = (customerId: string) => customers.find(c => c.id === customerId)?.name || 'לא ידוע';

    return (
        <div
            className="flex-1 bg-slate-100 rounded-lg p-3 min-w-[280px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, stage)}
        >
            <h3 className="font-semibold text-lg mb-4 text-slate-700 px-2">{stage} ({deals.length})</h3>
            <div className="h-full">
                {deals.map(deal => (
                    <DealCard key={deal.id} deal={deal} customerName={getCustomerName(deal.customerId)} onDragStart={onDragStart} />
                ))}
            </div>
        </div>
    );
};

const DealForm: React.FC<{ deal: Deal | null; customers: Customer[]; onSave: (deal: Deal) => void; onCancel: () => void; }> = ({ deal, customers, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        name: deal?.name || '',
        value: deal?.value || 0,
        customerId: deal?.customerId || (customers.length > 0 ? customers[0].id : ''),
        stage: deal?.stage || DealStage.LEAD,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'value' ? parseFloat(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!formData.customerId) {
            alert("אנא בחר לקוח.");
            return;
        }
        onSave({
            ...formData,
            id: deal?.id || `deal_${Date.now()}`,
            createdAt: deal?.createdAt || new Date(),
        });
    };
    
    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-start">
            <div>
                <label className="block text-sm font-medium text-slate-700">שם העסקה</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">שווי ($)</label>
                <input type="number" name="value" value={formData.value} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">לקוח</label>
                <select name="customerId" value={formData.customerId} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">שלב</label>
                <select name="stage" value={formData.stage} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required>
                    {DEAL_STAGES_ORDERED.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור עסקה</button>
            </div>
        </form>
    );
};


interface DealsPageProps {
    deals: Deal[];
    setDeals: React.Dispatch<React.SetStateAction<Deal[]>>;
    customers: Customer[];
    handleUpdateDealStage: (dealId: string, newStage: DealStage) => void;
    addActivity: (description: string) => void;
}

const DealsPage: React.FC<DealsPageProps> = ({ deals, setDeals, customers, handleUpdateDealStage, addActivity }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, dealId: string) => {
        e.dataTransfer.setData("dealId", dealId);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, newStage: DealStage) => {
        const dealId = e.dataTransfer.getData("dealId");
        handleUpdateDealStage(dealId, newStage);
    };

    const handleSaveDeal = (deal: Deal) => {
        setDeals(prev => {
            const existing = prev.find(d => d.id === deal.id);
            if(existing) {
                addActivity(`עסקה עודכנה: ${deal.name}`);
                return prev.map(d => d.id === deal.id ? deal : d);
            }
            addActivity(`עסקה חדשה נוצרה: ${deal.name}`);
            return [...prev, deal];
        });
        setIsModalOpen(false);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-end mb-4">
                 <button onClick={() => setIsModalOpen(true)} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                    <PlusIcon className="h-5 w-5 me-2" />
                    הוסף עסקה
                </button>
            </div>
            <div className="flex-1 flex gap-4 pb-4">
                {DEAL_STAGES_ORDERED.map(stage => (
                    <KanbanColumn
                        key={stage}
                        stage={stage}
                        deals={deals.filter(d => d.stage === stage)}
                        customers={customers}
                        onDragStart={handleDragStart}
                        onDrop={handleDrop}
                    />
                ))}
            </div>
            {isModalOpen && (
                <Modal title="הוסף עסקה חדשה" onClose={() => setIsModalOpen(false)}>
                    <DealForm deal={null} customers={customers} onSave={handleSaveDeal} onCancel={() => setIsModalOpen(false)} />
                </Modal>
            )}
        </div>
    );
};

export default DealsPage;
