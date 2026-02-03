
import React, { useState, useMemo, useEffect } from 'react';
import { Supplier, Order, Contact, Transaction } from '../types';
import { PlusIcon, DeleteIcon } from './icons';
import Modal from './Modal';
import { calculateOrderTotals } from '../utils/calculations';
import { PAYMENT_TERMS_OPTIONS } from '../constants';
import * as mongoService from '../services/mongoService';

interface SuppliersPageProps {
    suppliers: Supplier[];
    setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
    addActivity: (description: string, options?: import('../types').AddActivityOptions) => void;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>; // New prop
    transactions?: Transaction[]; // Optional, for completeness if used
    setTransactions?: React.Dispatch<React.SetStateAction<Transaction[]>>; // Optional
}

const findDuplicateSupplier = (suppliers: Supplier[], name: string, contacts: Contact[]) => {
    return suppliers.find(s => {
        if (s.name.toLowerCase() === name.toLowerCase()) return true;
        // Check if any contact matches by email or phone
        return s.contacts.some(c => 
            contacts.some(newC => 
                (newC.email && c.email.toLowerCase() === newC.email.toLowerCase()) || 
                (newC.phone && c.phone.replace(/\D/g, '') === newC.phone.replace(/\D/g, ''))
            )
        );
    });
};

const ManualMergeModal: React.FC<{
    targetSupplier: Supplier;
    allSuppliers: Supplier[];
    onConfirm: (victimId: string) => void;
    onClose: () => void;
}> = ({ targetSupplier, allSuppliers, onConfirm, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVictim, setSelectedVictim] = useState<Supplier | null>(null);

    const candidates = useMemo(() => {
        if (!searchTerm) return [];
        const lower = searchTerm.toLowerCase();
        return allSuppliers.filter(s => 
            s.id !== targetSupplier.id && (
                s.name.toLowerCase().includes(lower) || 
                s.contacts.some(c => c.name.toLowerCase().includes(lower) || c.phone.includes(lower))
            )
        ).slice(0, 10);
    }, [searchTerm, allSuppliers, targetSupplier.id]);

    return (
        <Modal title="מיזוג ספקים ידני" onClose={onClose} size="lg" zIndex={100}>
            <div className="text-start space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg">
                    <h4 className="font-bold text-indigo-900">הספק הראשי: {targetSupplier.name}</h4>
                    <p className="text-sm text-indigo-700">זהו הספק שיישמר. כל הנתונים מהספק שתבחר למטה (הזמנות, פריטים) יועברו אליו.</p>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">בחר ספק למיזוג (ייבלע ויימחק)</label>
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setSelectedVictim(null); }}
                        placeholder="חפש לפי שם ספק או איש קשר..."
                        className="w-full p-2 border border-slate-300 rounded focus:ring-primary focus:border-primary"
                    />
                    
                    {searchTerm && candidates.length > 0 && !selectedVictim && (
                        <div className="mt-2 border rounded max-h-40 overflow-y-auto bg-white shadow-sm">
                            {candidates.map(s => (
                                <div 
                                    key={s.id} 
                                    onClick={() => setSelectedVictim(s)}
                                    className="p-2 hover:bg-slate-50 cursor-pointer border-b last:border-0"
                                >
                                    <div className="font-bold text-sm text-slate-800">{s.name}</div>
                                    <div className="text-xs text-slate-500">אנשי קשר: {s.contacts.length}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {selectedVictim && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg animate-fadeIn">
                        <h4 className="font-bold text-red-900 mb-2">אישור מיזוג</h4>
                        <p className="text-sm text-red-800">
                            האם אתה בטוח שברצונך למזג את <strong>{selectedVictim.name}</strong> לתוך <strong>{targetSupplier.name}</strong>?
                        </p>
                        <ul className="list-disc list-inside text-xs text-red-700 mt-2 space-y-1">
                            <li>כל ההזמנות והפריטים המשויכים ל-{selectedVictim.name} יעודכנו.</li>
                            <li>אנשי הקשר יועברו.</li>
                            <li><strong>{selectedVictim.name} יימחק לצמיתות.</strong></li>
                        </ul>
                        
                        <div className="flex justify-end gap-3 mt-4">
                            <button onClick={onClose} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded hover:bg-slate-50">ביטול</button>
                            <button onClick={() => onConfirm(selectedVictim.id)} className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 shadow-sm">בצע מיזוג</button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

const SupplierForm: React.FC<{ 
    supplier: Supplier | null; 
    onSave: (supplier: Supplier) => void; 
    onCancel: () => void;
    onMergeClick?: () => void; // New prop for triggering merge from form
}> = ({ supplier, onSave, onCancel, onMergeClick }) => {
    const [formData, setFormData] = useState<{ name: string, paymentTerms: string, contacts: Contact[] }>({
        name: supplier?.name || '',
        paymentTerms: supplier?.paymentTerms || 'שוטף 90',
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
        if (formData.contacts.length <= 1) {
            return; // Keep at least one contact
        }
        const contact = formData.contacts[index];
        const contactName = contact?.name || 'איש קשר';
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את איש הקשר "${contactName}"?`)) {
            return;
        }
        setFormData(prev => ({
            ...prev,
            contacts: prev.contacts.filter((_, i) => i !== index)
        }));
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
                                <div>
                                    <label className="block text-xs text-slate-500">שיטת תקשורת מועדפת</label>
                                    <select 
                                        name="contactPreference" 
                                        value={contact.contactPreference || 'EMAIL'} 
                                        onChange={e => handleContactChange(index, e)} 
                                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary text-xs bg-white"
                                    >
                                        <option value="EMAIL">אימייל</option>
                                        <option value="WHATSAPP">WhatsApp</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={addContact} className="mt-2 text-sm text-primary hover:text-indigo-800">+ הוסף איש קשר</button>
            </div>

            <div className="flex justify-between space-x-2 pt-4 space-x-reverse mt-4 border-t">
                {supplier && onMergeClick && (
                    <button type="button" onClick={onMergeClick} className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 flex items-center gap-2 text-sm font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        מיזוג ספקים
                    </button>
                )}
                <div className="flex space-x-2 space-x-reverse flex-1 justify-end">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמירה</button>
                </div>
            </div>
        </form>
    );
};


const SuppliersPage: React.FC<SuppliersPageProps> = ({ suppliers, setSuppliers, addActivity, orders, setOrders, transactions, setTransactions }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Duplicate & Merge State
    const [duplicateFound, setDuplicateFound] = useState<Supplier | null>(null);
    const [pendingNewSupplier, setPendingNewSupplier] = useState<Supplier | null>(null);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    
    // Pagination state
    const [paginatedSuppliers, setPaginatedSuppliers] = useState<Supplier[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [loadingSuppliers, setLoadingSuppliers] = useState(false);
    
    // Refetch function for paginated suppliers
    const refetchSuppliers = async () => {
        try {
            setLoadingSuppliers(true);
            const filters: any = {};
            if (searchTerm) filters.searchTerm = searchTerm;
            
            const result = await mongoService.getSuppliersPaginated(filters, currentPage, pageSize);
            setPaginatedSuppliers(result.suppliers);
            setTotalCount(result.totalCount);
        } catch (error) {
            console.error('Error loading paginated suppliers:', error);
        } finally {
            setLoadingSuppliers(false);
        }
    };
    
    // Load paginated suppliers when filters or pagination change
    useEffect(() => {
        refetchSuppliers();
    }, [searchTerm, currentPage, pageSize]);

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

    // Use paginated suppliers instead of client-side filtering
    const filteredSuppliers = paginatedSuppliers;

    const handleAddSupplier = () => {
        setEditingSupplier(null);
        setIsModalOpen(true);
    };

    const handleEditSupplier = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setIsModalOpen(true);
    };

    // Supplier deletion is disabled - suppliers should not be deleted
    // const handleDeleteSupplier = (supplierId: string) => {
    //     const supplierName = suppliers.find(c => c.id === supplierId)?.name;
    //     if(window.confirm(`האם אתה בטוח שברצונך למחוק את הספק ${supplierName}?`)) {
    //         setSuppliers(prev => prev.filter(c => c.id !== supplierId));
    //         addActivity(`ספק נמחק: ${supplierName}`);
    //     }
    // };

    const performMerge = async (veteranId: string, victimId: string) => {
        const victim = suppliers.find(s => s.id === victimId);
        const veteran = suppliers.find(s => s.id === veteranId);
        if (!victim || !veteran) return;

        // 1. Move Contacts
        const transferredContacts = victim.contacts.map(c => ({
            ...c,
            id: `cont_merged_${c.id}` 
        }));
        
        const updatedVeteran = {
            ...veteran,
            contacts: [...veteran.contacts, ...transferredContacts]
        };

        // 2. Update Orders (Main supplier, line items, services)
        setOrders(prev => prev.map(o => {
            let changed = false;
            let newO = { ...o };

            if (newO.supplierId === victimId) {
                newO.supplierId = veteranId;
                changed = true;
            }
            
            if (newO.lineItems.some(li => li.supplierId === victimId)) {
                newO.lineItems = newO.lineItems.map(li => li.supplierId === victimId ? { ...li, supplierId: veteranId } : li);
                changed = true;
            }

            if (newO.additionalServices.some(as => as.supplierId === victimId)) {
                newO.additionalServices = newO.additionalServices.map(as => as.supplierId === victimId ? { ...as, supplierId: veteranId } : as);
                changed = true;
            }

            return changed ? newO : o;
        }));

        // 3. Update Transactions (if applicable)
        if (transactions && setTransactions) {
            setTransactions(prev => prev.map(t => t.supplierId === victimId ? { ...t, supplierId: veteranId } : t));
        }

        // 4. Update Suppliers List (Remove victim, update veteran)
        setSuppliers(prev => prev
            .filter(s => s.id !== victimId)
            .map(s => s.id === veteranId ? updatedVeteran : s)
        );

        addActivity(`ספק ${victim.name} מוזג לתוך ${veteran.name}`, { entityType: 'supplier', entityId: veteran.id, action: 'merge', metadata: { victimName: victim.name, targetName: veteran.name } });
        setDuplicateFound(null);
        setPendingNewSupplier(null);
        setIsMergeModalOpen(false);
        setIsModalOpen(false);
        // Refresh paginated suppliers after merge
        await refetchSuppliers();
    };

    const handleSaveSupplier = async (supplier: Supplier) => {
        if (editingSupplier) {
            setSuppliers(prev => prev.map(s => s.id === supplier.id ? supplier : s));
            addActivity(`ספק עודכן: ${supplier.name}`, { entityType: 'supplier', entityId: supplier.id, action: 'update', metadata: { name: supplier.name } });
            setIsModalOpen(false);
            setEditingSupplier(null);
            // Refresh paginated suppliers after update
            await refetchSuppliers();
        } else {
            // Duplicate Check on Create - need to check all suppliers (not just paginated)
            // So we'll fetch all suppliers for duplicate check
            const allSuppliers = await mongoService.getSuppliers();
            const duplicate = findDuplicateSupplier(allSuppliers, supplier.name, supplier.contacts);
            if (duplicate) {
                setDuplicateFound(duplicate);
                setPendingNewSupplier(supplier);
                // Do NOT close modal yet, show warning
            } else {
                setSuppliers(prev => [...prev, supplier]);
                addActivity(`ספק חדש נוסף: ${supplier.name}`, { entityType: 'supplier', entityId: supplier.id, action: 'create', metadata: { name: supplier.name } });
                setIsModalOpen(false);
                setEditingSupplier(null);
                // Refresh paginated suppliers after create
                await refetchSuppliers();
            }
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6 gap-4">
                <div className="flex-grow">
                     <input
                        type="text"
                        placeholder="חיפוש לפי שם ספק, איש קשר, טלפון או אימייל..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1); // Reset to first page on search
                        }}
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
                                    {/* Supplier deletion is disabled - suppliers should not be deleted */}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredSuppliers.length === 0 && !loadingSuppliers && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="font-semibold text-lg">לא נמצאו ספקים</p>
                        <p>נסה מונח חיפוש אחר או הוסף ספק חדש.</p>
                    </div>
                )}
                
                {/* Pagination Controls */}
                {totalCount > 0 && (
                    <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 border-t border-slate-200">
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-slate-600">
                                מציג {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} מתוך {totalCount} ספקים
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-slate-600">שורות לעמוד:</label>
                                <select 
                                    value={pageSize} 
                                    onChange={(e) => {
                                        setPageSize(parseInt(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="text-sm border border-slate-300 rounded px-2 py-1 focus:ring-primary focus:border-primary"
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={200}>200</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1 || loadingSuppliers}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ראשון
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1 || loadingSuppliers}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                קודם
                            </button>
                            <span className="px-3 py-1 text-sm text-slate-600">
                                עמוד {currentPage} מתוך {Math.ceil(totalCount / pageSize) || 1}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / pageSize) || 1, prev + 1))}
                                disabled={currentPage >= Math.ceil(totalCount / pageSize) || loadingSuppliers}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                הבא
                            </button>
                            <button
                                onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize) || 1)}
                                disabled={currentPage >= Math.ceil(totalCount / pageSize) || loadingSuppliers}
                                className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                אחרון
                            </button>
                        </div>
                    </div>
                )}
                
                {loadingSuppliers && (
                    <div className="mt-4 text-center text-slate-500 text-sm">טוען...</div>
                )}
            </div>
            
            {isModalOpen && (
                <Modal title={editingSupplier ? "עריכת ספק" : "הוספת ספק"} onClose={() => setIsModalOpen(false)}>
                    <SupplierForm 
                        supplier={editingSupplier} 
                        onSave={handleSaveSupplier} 
                        onCancel={() => setIsModalOpen(false)} 
                        onMergeClick={() => setIsMergeModalOpen(true)}
                    />
                </Modal>
            )}

            {isMergeModalOpen && editingSupplier && (
                <ManualMergeModal
                    targetSupplier={editingSupplier}
                    allSuppliers={suppliers}
                    onClose={() => setIsMergeModalOpen(false)}
                    onConfirm={async (victimId) => {
                        await performMerge(editingSupplier.id, victimId);
                    }}
                />
            )}

            {/* Duplicate Detected Modal (On Create) */}
            {duplicateFound && pendingNewSupplier && (
                <Modal title="נמצא ספק קיים עם פרטים דומים" onClose={() => { setDuplicateFound(null); setPendingNewSupplier(null); }} size="lg" zIndex={100}>
                    <div className="text-start space-y-4">
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
                            <div>
                                <h4 className="font-bold text-amber-800">שים לב, ייתכן והספק כבר קיים!</h4>
                                <p className="text-sm text-amber-700">נמצאה התאמה לספק: <strong>{duplicateFound.name}</strong></p>
                            </div>
                        </div>
                        <p className="text-slate-600 text-sm">האם ברצונך למזג את המידע החדש לתוך הספק הקיים?</p>
                        <div className="flex justify-end gap-3 pt-4">
                            <button 
                                onClick={() => {
                                    setSuppliers(prev => [...prev, pendingNewSupplier]);
                                    addActivity(`ספק חדש נוסף: ${pendingNewSupplier.name} (למרות כפילות)`, { entityType: 'supplier', entityId: pendingNewSupplier.id, action: 'create', metadata: { name: pendingNewSupplier.name } });
                                    setDuplicateFound(null);
                                    setPendingNewSupplier(null);
                                    setIsModalOpen(false);
                                }} 
                                className="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-md text-sm hover:bg-slate-50"
                            >
                                צור כספק חדש בכל זאת
                            </button>
                            <button 
                                onClick={() => {
                                    // Merge Logic: New Contacts to Old Supplier
                                    const updatedVeteran = {
                                        ...duplicateFound,
                                        contacts: [...duplicateFound.contacts, ...pendingNewSupplier.contacts]
                                    };
                                    setSuppliers(prev => prev.map(s => s.id === duplicateFound.id ? updatedVeteran : s));
                                    addActivity(`ספק חדש מוזג לתוך הקיים: ${duplicateFound.name}`, { entityType: 'supplier', entityId: duplicateFound.id, action: 'merge', metadata: { name: duplicateFound.name } });
                                    setDuplicateFound(null);
                                    setPendingNewSupplier(null);
                                    setIsModalOpen(false);
                                }} 
                                className="px-6 py-2 bg-primary text-white rounded-md text-sm font-bold shadow-md hover:bg-indigo-700"
                            >
                                מזג לתוך הקיים
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default SuppliersPage;
