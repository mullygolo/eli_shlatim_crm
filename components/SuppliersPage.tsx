
import React, { useState, useMemo } from 'react';
import { Supplier, Order, Contact } from '../types';
import { PlusIcon, DeleteIcon } from './icons';
import Modal from './Modal';
import { calculateOrderTotals } from '../utils/calculations';
import { PAYMENT_TERMS_OPTIONS } from '../constants';

interface SuppliersPageProps {
    suppliers: Supplier[];
    setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
    addActivity: (description: string) => void;
    orders: Order[];
}

const SupplierForm: React.FC<{ supplier: Supplier | null; onSave: (supplier: Supplier) => void; onCancel: () => void; }> = ({ supplier, onSave, onCancel }) => {
    const [formData, setFormData] = useState<{ name: string, paymentTerms: string, contacts: Contact[] }>({
        name: supplier?.name || '',
        paymentTerms: supplier?.paymentTerms || 'שוטף 30',
        contacts: supplier?.contacts || [{
            id: `con_${Date.now()}`,
            name: '',
            email: '',
            phone: '',
            role: 'איש קשר ראשי',
            isBillingContact: false,
            isDefault: true
        }],
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleContactChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const newContacts = [...formData.contacts];
        (newContacts[index] as any)[name] = value;
        setFormData(prev => ({ ...prev, contacts: newContacts }));
    };

    const addContact = () => {
        setFormData(prev => ({
            ...prev,
            contacts: [...prev.contacts, {
                id: `con_${Date.now()}_${Math.random()}`,
                name: '',
                email: '',
                phone: '',
                role: '',
                isBillingContact: false,
                isDefault: false
            }]
        }));
    };

    const removeContact = (index: number) => {
        if (formData.contacts.length > 1) {
            setFormData(prev => ({
                ...prev,
                contacts: prev.contacts.filter((_, i) => i !== index)
            }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            ...formData,
            id: supplier?.id || `supp_${Date.now()}`,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-start">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">שם הספק</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">תנאי תשלום</label>
                    <select name="paymentTerms" value={formData.paymentTerms} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                        {PAYMENT_TERMS_OPTIONS.map(term => <option key={term} value={term}>{term}</option>)}
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-800 mb-2">אנשי קשר</label>
                <div className="space-y-3">
                    {formData.contacts.map((contact, index) => (
                        <div key={contact.id} className="p-3 border rounded-md bg-slate-50 relative">
                            {index > 0 && (
                                <button type="button" onClick={() => removeContact(index)} className="absolute top-2 left-2 text-red-500 hover:text-red-700">
                                    <DeleteIcon className="h-4 w-4"/>
                                </button>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-slate-500">שם</label>
                                    <input type="text" name="name" value={contact.name} onChange={e => handleContactChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary text-xs" required />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500">תפקיד</label>
                                    <input 
                                        type="text" 
                                        name="role" 
                                        value={contact.role} 
                                        onChange={e => handleContactChange(index, e)} 
                                        placeholder="לדוג': הזמנות, הנהח, מנהל"
                                        list="role-suggestions"
                                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary text-xs" 
                                    />
                                    <datalist id="role-suggestions">
                                        <option value="הזמנות"/>
                                        <option value="הנהלת חשבונות"/>
                                        <option value="מנהל"/>
                                        <option value="מחסן"/>
                                        <option value="איש קשר ראשי"/>
                                    </datalist>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500">אימייל</label>
                                    <input type="email" name="email" value={contact.email} onChange={e => handleContactChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary text-xs" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500">טלפון</label>
                                    <input type="tel" name="phone" value={contact.phone} onChange={e => handleContactChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary text-xs" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={addContact} className="mt-2 text-sm text-primary hover:text-indigo-800">+ הוסף איש קשר</button>
            </div>

            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמירה</button>
            </div>
        </form>
    );
};


const SuppliersPage: React.FC<SuppliersPageProps> = ({ suppliers, setSuppliers, addActivity, orders }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const calculateOwedForMonth = (supplierId: string) => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        let totalOwed = 0;

        orders.forEach(order => {
            if (new Date(order.date).getTime() >= startOfMonth.getTime()) {
                // Check main supplier
                if (order.supplierId === supplierId) {
                    const { totalCost } = calculateOrderTotals(order);
                    totalOwed += totalCost;
                } else {
                    // Check line items and additional services for this supplier
                    order.lineItems.forEach(item => {
                        if (item.supplierId === supplierId) {
                            totalOwed += (item.cost || 0) * (item.quantity || 0);
                        }
                    });
                     order.additionalServices.forEach(service => {
                        if (service.supplierId === supplierId) {
                            totalOwed += service.cost || 0;
                        }
                    });
                }
            }
        });
        
        return totalOwed;
    };

    const filteredSuppliers = useMemo(() => {
        if (!searchTerm) {
            return suppliers;
        }
        const lowercasedTerm = searchTerm.toLowerCase();
        return suppliers.filter(supplier =>
            supplier.name.toLowerCase().includes(lowercasedTerm) ||
            supplier.contacts.some(c => 
                c.name.toLowerCase().includes(lowercasedTerm) ||
                c.email.toLowerCase().includes(lowercasedTerm) ||
                c.phone.includes(lowercasedTerm)
            )
        );
    }, [suppliers, searchTerm]);

    const handleAddSupplier = () => {
        setEditingSupplier(null);
        setIsModalOpen(true);
    };

    const handleEditSupplier = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setIsModalOpen(true);
    };

    const handleDeleteSupplier = (supplierId: string) => {
        const supplierName = suppliers.find(c => c.id === supplierId)?.name;
        if(window.confirm(`האם אתה בטוח שברצונך למחוק את הספק ${supplierName}?`)) {
            setSuppliers(prev => prev.filter(c => c.id !== supplierId));
            addActivity(`ספק נמחק: ${supplierName}`);
        }
    };

    const handleSaveSupplier = (supplier: Supplier) => {
        if (editingSupplier) {
            setSuppliers(prev => prev.map(s => s.id === supplier.id ? supplier : s));
            addActivity(`ספק עודכן: ${supplier.name}`);
        } else {
            setSuppliers(prev => [...prev, supplier]);
            addActivity(`ספק חדש נוסף: ${supplier.name}`);
        }
        setIsModalOpen(false);
        setEditingSupplier(null);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6 gap-4">
                <div className="flex-grow">
                     <input
                        type="text"
                        placeholder="חיפוש לפי שם ספק, איש קשר, טלפון או אימייל..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-primary focus:border-primary transition"
                        aria-label="חיפוש ספקים"
                    />
                </div>
                <button onClick={handleAddSupplier} className="flex-shrink-0 flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                    <PlusIcon className="h-5 w-5 me-2" />
                    הוסף ספק
                </button>
            </div>
            <div className="bg-white shadow-md rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 text-start">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">שם הספק</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">אנשי קשר</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תנאי תשלום</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">חוב לחודש הנוכחי</th>
                            <th className="relative px-6 py-3"><span className="sr-only">פעולות</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {filteredSuppliers.map(supplier => (
                            <tr key={supplier.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium align-top">
                                    <button 
                                        onClick={() => handleEditSupplier(supplier)} 
                                        className="text-primary hover:text-indigo-800 font-semibold hover:underline"
                                    >
                                        {supplier.name}
                                    </button>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-500">
                                    <div className="space-y-2">
                                        {supplier.contacts.slice(0, 3).map(contact => (
                                            <div key={contact.id} className="flex flex-col text-xs border-b border-slate-100 pb-1 last:border-0">
                                                <span className="font-medium text-slate-700">{contact.name} {contact.role && <span className="text-slate-400 font-normal">({contact.role})</span>}</span>
                                                <div className="flex gap-2 text-slate-400">
                                                    {contact.phone && <span>{contact.phone}</span>}
                                                    {contact.email && <span>{contact.email}</span>}
                                                </div>
                                            </div>
                                        ))}
                                        {supplier.contacts.length > 3 && <span className="text-xs text-primary italic">+{supplier.contacts.length - 3} נוספים</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 align-top">{supplier.paymentTerms}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600 align-top">
                                    {calculateOwedForMonth(supplier.id).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium space-x-2 space-x-reverse align-top">
                                    <button onClick={() => handleDeleteSupplier(supplier.id)} className="text-red-600 hover:text-red-900 p-1"><DeleteIcon className="h-5 w-5"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredSuppliers.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="font-semibold text-lg">לא נמצאו ספקים</p>
                        <p>נסה מונח חיפוש אחר או הוסף ספק חדש.</p>
                    </div>
                )}
            </div>
            {isModalOpen && (
                <Modal title={editingSupplier ? "עריכת ספק" : "הוספת ספק"} onClose={() => setIsModalOpen(false)}>
                    <SupplierForm supplier={editingSupplier} onSave={handleSaveSupplier} onCancel={() => setIsModalOpen(false)} />
                </Modal>
            )}
        </div>
    );
};

export default SuppliersPage;
