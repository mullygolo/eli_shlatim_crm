
import React, { useState, useMemo, useEffect } from 'react';
import { Customer, Contact, Order, PaymentMethod } from '../types';
import { PlusIcon, EditIcon, DeleteIcon, ImportIcon, WhatsAppIcon, EmailIcon, PhoneIcon } from './icons';
import Modal from './Modal';
import { CUSTOMER_CATEGORIES, PAYMENT_TERMS_OPTIONS } from '../constants';

interface CustomersPageProps {
    customers: Customer[];
    setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    addActivity: (description: string) => void;
    onNavigateToOrder: (orderId: string) => void;
}

// Enhanced form for adding a new customer with all details
const NewCustomerForm: React.FC<{ onSave: (customer: Partial<Customer>, firstContact: Partial<Contact>) => void; onCancel: () => void; }> = ({ onSave, onCancel }) => {
    const [customerData, setCustomerData] = useState({ 
        name: '', 
        category: '',
        website: '',
        address: '',
        notes: '',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentTerms: 'שוטף 30',
        isSpecial: false
    });
    const [contactData, setContactData] = useState({ name: '', email: '', phone: '', role: '' });

    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setCustomerData(prev => ({ ...prev, [name]: val }));
    };
    
    const handleContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setContactData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(customerData, contactData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 text-start">
            {/* Section 1: Company Details */}
            <div>
                <h3 className="font-semibold text-lg text-slate-800 mb-3 border-b pb-1">פרטי החברה</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700">שם החברה <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={customerData.name} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">קטגוריה</label>
                        <select name="category" value={customerData.category} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-white">
                            <option value="">בחר קטגוריה</option>
                            {CUSTOMER_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אמצעי תשלום</label>
                        <select name="paymentMethod" value={customerData.paymentMethod} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-white">
                            {Object.values(PaymentMethod).map(method => (
                                <option key={method} value={method}>{method}</option>
                            ))}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">תנאי תשלום</label>
                        <select name="paymentTerms" value={customerData.paymentTerms} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-white">
                            {PAYMENT_TERMS_OPTIONS.map(term => (
                                <option key={term} value={term}>{term}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">כתובת</label>
                        <input type="text" name="address" value={customerData.address} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אתר אינטרנט</label>
                        <input type="text" name="website" value={customerData.website} onChange={handleCustomerChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                     <div className="md:col-span-2 flex items-center mt-2">
                        <input type="checkbox" id="isSpecial" name="isSpecial" checked={customerData.isSpecial} onChange={handleCustomerChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2" />
                        <label htmlFor="isSpecial" className="text-sm font-medium text-slate-700">לקוח מועדף / VIP</label>
                    </div>
                </div>
            </div>
            
            {/* Section 2: Contact Person */}
            <div>
                <h3 className="font-semibold text-lg text-slate-800 mb-3 border-b pb-1">איש קשר ראשי</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">שם מלא <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={contactData.name} onChange={handleContactChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">תפקיד</label>
                        <input type="text" name="role" value={contactData.role} onChange={handleContactChange} placeholder="לדוג': מנכ''ל, מנהל רכש" className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">אימייל <span className="text-red-500">*</span></label>
                        <input type="email" name="email" value={contactData.email} onChange={handleContactChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">טלפון</label>
                        <input type="tel" name="phone" value={contactData.phone} onChange={handleContactChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    </div>
                </div>
            </div>

            {/* Section 3: Notes */}
            <div>
                <label className="block text-sm font-medium text-slate-700">הערות כלליות</label>
                <textarea name="notes" value={customerData.notes} onChange={handleCustomerChange} rows={3} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
            </div>

            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמירה</button>
            </div>
        </form>
    );
};

// Full detailed view/edit component for a customer
interface CustomerDetailViewProps {
    customer: Customer;
    customerOrders: Order[];
    onSave: (customer: Customer) => void;
    onCancel: () => void;
    onNavigateToOrder: (orderId: string) => void;
}

const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({ customer, customerOrders, onSave, onCancel, onNavigateToOrder }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'contacts' | 'orders'>('details');
    const [editableCustomer, setEditableCustomer] = useState<Customer>(customer);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);

    useEffect(() => {
        setEditableCustomer(customer);
    }, [customer]);

    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setEditableCustomer(prev => ({...prev, [name]: type === 'checkbox' ? checked : value}));
    };
    
    const handleContactChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        
        let newContacts = [...editableCustomer.contacts];
        
        // If it's default contact, ensure only one is default
        if (name === 'isDefault' && checked) {
            newContacts = newContacts.map(c => ({ ...c, isDefault: false }));
        }

        (newContacts[index] as any)[name] = type === 'checkbox' ? checked : value;
        
        setEditableCustomer(prev => ({ ...prev, contacts: newContacts }));
    };

    const addContact = () => {
        const newContact: Contact = {
            id: `cont_${Date.now()}`,
            name: '',
            email: '',
            phone: '',
            role: '',
            isBillingContact: false,
            isDefault: editableCustomer.contacts.length === 0,
        };
        setEditableCustomer(prev => ({...prev, contacts: [...prev.contacts, newContact]}));
    };

    const removeContact = (contactId: string) => {
        setEditableCustomer(prev => ({...prev, contacts: prev.contacts.filter(c => c.id !== contactId)}));
    };

    return (
        <div className="flex flex-col text-start">
             <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-6 space-x-reverse px-1">
                    <button onClick={() => setActiveTab('details')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>פרטים</button>
                    <button onClick={() => setActiveTab('contacts')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'contacts' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>אנשי קשר</button>
                    <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'orders' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>היסטוריית הזמנות</button>
                </nav>
            </div>
            <div className="py-6">
                {activeTab === 'details' && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">שם חברה</label>
                            <input name="name" value={editableCustomer.name} onChange={handleCustomerChange} className="p-2 border rounded w-full"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">אתר אינטרנט</label>
                            <input name="website" value={editableCustomer.website} onChange={handleCustomerChange} className="p-2 border rounded w-full"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">כתובת</label>
                            <input name="address" value={editableCustomer.address} onChange={handleCustomerChange} className="p-2 border rounded w-full"/>
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
                            <select name="category" value={editableCustomer.category} onChange={handleCustomerChange} className="p-2 border rounded w-full bg-white border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                {CUSTOMER_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">אמצעי תשלום</label>
                            <select 
                                name="paymentMethod" 
                                value={editableCustomer.paymentMethod} 
                                onChange={handleCustomerChange} 
                                className="p-2 border rounded w-full bg-white border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                            >
                                {Object.values(PaymentMethod).map(method => (
                                    <option key={method} value={method}>{method}</option>
                                ))}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">תנאי תשלום</label>
                            <select 
                                name="paymentTerms" 
                                value={editableCustomer.paymentTerms || 'שוטף 30'} 
                                onChange={handleCustomerChange} 
                                className="p-2 border rounded w-full bg-white border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                            >
                                {PAYMENT_TERMS_OPTIONS.map(term => (
                                    <option key={term} value={term}>{term}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center pt-6"><input type="checkbox" name="isSpecial" checked={editableCustomer.isSpecial} onChange={handleCustomerChange} className="h-4 w-4 me-2 rounded"/> לקוח מועדף / VIP</div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
                            <textarea name="notes" value={editableCustomer.notes} onChange={handleCustomerChange} className="w-full p-2 border rounded h-24"/>
                        </div>
                    </div>
                )}
                 {activeTab === 'contacts' && (
                    <div className="space-y-4">
                        {editableCustomer.contacts.map((contact, index) => {
                             let whatsappUrl = '';
                             let telUrl = '';
                             let mailtoUrl = '';

                             if (contact.phone) {
                                 let cleanPhone = contact.phone.replace(/[^0-9]/g, '');
                                 telUrl = `tel:${cleanPhone}`;
                                 if (cleanPhone.startsWith('0')) {
                                     cleanPhone = `972${cleanPhone.substring(1)}`;
                                 }
                                 whatsappUrl = `https://wa.me/${cleanPhone}`;
                             }
                             if (contact.email) {
                                 mailtoUrl = `mailto:${contact.email}`;
                             }

                             return (
                                <div key={contact.id} className={`group flex flex-col md:flex-row items-start md:items-center gap-4 p-4 rounded-lg border transition-all duration-200 ${contact.isDefault ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-200' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
                                    
                                    {/* Contact Info Fields */}
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">שם מלא</label>
                                            <input 
                                                value={contact.name} 
                                                onChange={e => handleContactChange(index, e)} 
                                                name="name" 
                                                className={`block w-full text-sm border-0 border-b-2 bg-transparent focus:ring-0 px-0 py-1 transition-colors ${contact.isDefault ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-primary'}`}
                                                placeholder="שם איש הקשר"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">תפקיד</label>
                                            <input 
                                                value={contact.role} 
                                                onChange={e => handleContactChange(index, e)} 
                                                name="role" 
                                                 className={`block w-full text-sm border-0 border-b-2 bg-transparent focus:ring-0 px-0 py-1 transition-colors ${contact.isDefault ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-primary'}`}
                                                placeholder="תפקיד"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">אימייל</label>
                                            <input 
                                                value={contact.email} 
                                                onChange={e => handleContactChange(index, e)} 
                                                name="email" 
                                                 className={`block w-full text-sm border-0 border-b-2 bg-transparent focus:ring-0 px-0 py-1 transition-colors ${contact.isDefault ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-primary'}`}
                                                placeholder="email@company.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">טלפון</label>
                                            <input 
                                                value={contact.phone} 
                                                onChange={e => handleContactChange(index, e)} 
                                                name="phone" 
                                                 className={`block w-full text-sm border-0 border-b-2 bg-transparent focus:ring-0 px-0 py-1 transition-colors ${contact.isDefault ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-primary'}`}
                                                placeholder="050-0000000"
                                            />
                                        </div>
                                    </div>

                                    {/* Actions & Communication */}
                                    <div className="flex items-center gap-2 md:border-r md:border-slate-200 md:pr-4 w-full md:w-auto justify-end md:justify-start">
                                        
                                        {/* Icons Row */}
                                        <div className="flex items-center gap-1">
                                            {whatsappUrl ? (
                                                 <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" title="וואטסאפ" className="p-1.5 rounded-full text-slate-400 hover:text-green-500 hover:bg-green-50 transition-all"><WhatsAppIcon className="h-4 w-4"/></a>
                                            ) : <span className="w-7"></span>}
                                            {mailtoUrl ? (
                                                 <a href={mailtoUrl} title="אימייל" className="p-1.5 rounded-full text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all"><EmailIcon className="h-4 w-4"/></a>
                                            ) : <span className="w-7"></span>}
                                            {telUrl ? (
                                                 <a href={telUrl} title="חיוג" className="p-1.5 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all"><PhoneIcon className="h-4 w-4"/></a>
                                            ) : <span className="w-7"></span>}
                                        </div>

                                        <div className="w-px h-6 bg-slate-200 mx-2"></div>

                                        {/* Default Star Toggle */}
                                         <button
                                            type="button"
                                            onClick={() => {
                                                // Simulate event for handleContactChange
                                                const event = {
                                                    target: {
                                                        name: 'isDefault',
                                                        type: 'checkbox',
                                                        checked: !contact.isDefault
                                                    }
                                                } as any;
                                                handleContactChange(index, event);
                                            }}
                                            className={`p-1.5 rounded-full transition-all ${contact.isDefault ? 'text-amber-500 bg-amber-100' : 'text-slate-300 hover:text-amber-400 hover:bg-slate-100'}`}
                                            title={contact.isDefault ? "איש קשר ראשי" : "הגדר כראשי"}
                                        >
                                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                                            </svg>
                                        </button>

                                        {/* Delete Button - Separated */}
                                         <button 
                                            type="button"
                                            onClick={() => removeContact(contact.id)}
                                            className="p-1.5 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all ms-3"
                                            title="מחק איש קשר"
                                        >
                                            <DeleteIcon className="h-5 w-5"/>
                                        </button>

                                    </div>
                                </div>
                            )
                        })}
                        <button onClick={addContact} className="flex items-center justify-center w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-primary hover:border-primary hover:bg-slate-50 transition-colors">
                            <PlusIcon className="h-5 w-5 me-2" />
                            הוסף איש קשר חדש
                        </button>
                    </div>
                )}
                {activeTab === 'orders' && (
                    customerOrders.length > 0 ? (
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50"><tr><th className="p-2"># הזמנה</th><th>תיאור</th><th>תאריך</th><th>סכום</th><th>סטטוס</th></tr></thead>
                            <tbody>{customerOrders.map(o => <tr key={o.id} className="border-b"><td className="p-2"><button onClick={() => onNavigateToOrder(o.id)} className="text-primary hover:underline font-semibold">{o.orderNumber}</button></td><td>{o.description}</td><td>{o.date.toLocaleDateString('he-IL')}</td><td>{o.lineItems.reduce((s, li) => s + li.unitPrice * li.quantity, 0).toLocaleString()}</td><td>{o.orderStatus}</td></tr>)}</tbody>
                        </table>
                    ) : (
                        <p className="text-slate-500 text-center py-4">לא נמצאו הזמנות עבור לקוח זה.</p>
                    )
                )}
            </div>
             <div className="flex justify-end space-x-2 pt-4 space-x-reverse mt-4 border-t">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="button" onClick={() => onSave(editableCustomer)} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור שינויים</button>
            </div>
        </div>
    )
};

const CustomerImportModal: React.FC<{ onImport: (customers: Customer[]) => void; onCancel: () => void; }> = ({ onImport, onCancel }) => {
    const [pastedData, setPastedData] = useState('');
    const [errors, setErrors] = useState<string[]>([]);
    
    const handleImportClick = () => {
        const lines = pastedData.trim().split('\n');
        const newCustomers: Customer[] = [];
        const parsingErrors: string[] = [];

        if (pastedData.trim() === '') {
            setErrors(["לא נמצאו נתונים לייבוא. אנא הדבק מידע בתיבה."]);
            return;
        }

        lines.forEach((line, index) => {
            const columns = line.split('\t'); // Tab-separated for spreadsheet compatibility
            
            const [companyName, contactName, email, phone = '', category = ''] = columns.map(c => c.trim());

            if (!companyName || !contactName || !email) {
                parsingErrors.push(`שורה ${index + 1}: חסר שם חברה, שם איש קשר או אימייל.`);
                return;
            }

            const newContact: Contact = {
                id: `cont_import_${Date.now()}_${index}`,
                name: contactName,
                email: email,
                phone: phone,
                role: 'איש קשר ראשי',
                isBillingContact: true,
                isDefault: true
            };

            const newCustomer: Customer = {
                id: `cust_import_${Date.now()}_${index}`,
                name: companyName,
                website: '',
                address: '',
                category: category,
                notes: 'לקוח שיובא מהמערכת הישנה',
                isSpecial: false,
                contacts: [newContact],
                createdAt: new Date(),
                paymentMethod: PaymentMethod.BANK_TRANSFER,
                paymentTerms: 'שוטף 30',
            };
            newCustomers.push(newCustomer);
        });

        setErrors(parsingErrors);
        
        if (parsingErrors.length === 0 && newCustomers.length > 0) {
            onImport(newCustomers);
        }
    };

    return (
        <div className="space-y-4 text-start">
            <p className="text-sm text-slate-600">
                כדי לייבא לקוחות, העתק נתונים מטבלת ה-Excel או Google Sheets שלך והדבק אותם כאן.
                <br />
                ודא שהעמודות הן בסדר הבא:
                <strong className="block mt-1">שם חברה, שם איש קשר, אימייל, טלפון (אופציונלי), קטגוריה (אופציונלי)</strong>
            </p>
            <textarea
                value={pastedData}
                onChange={(e) => setPastedData(e.target.value)}
                rows={10}
                className="w-full p-2 border rounded font-mono text-sm border-slate-300 focus:border-primary focus:ring-primary"
                placeholder="הדבק כאן את נתוני הלקוחות שלך..."
                aria-label="אזור להדבקת נתוני לקוחות לייבוא"
            />
            {errors.length > 0 && (
                <div className="bg-red-50 p-3 rounded-md">
                    <h4 className="font-semibold text-red-700">שגיאות בנתונים:</h4>
                    <ul className="list-disc list-inside text-sm text-red-600">
                        {errors.map((error, i) => <li key={i}>{error}</li>)}
                    </ul>
                </div>
            )}
            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="button" onClick={handleImportClick} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">ייבא נתונים</button>
            </div>
        </div>
    );
};


const CustomersPage: React.FC<CustomersPageProps> = ({ customers, setCustomers, orders, setOrders, addActivity, onNavigateToOrder }) => {
    const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredCustomers = useMemo(() => {
        if (!searchTerm) {
            return customers;
        }
        const lowercasedTerm = searchTerm.toLowerCase();
        return customers.filter(customer => {
            const nameMatch = customer.name.toLowerCase().includes(lowercasedTerm);
            if (nameMatch) return true;

            return customer.contacts.some(contact => 
                contact.name.toLowerCase().includes(lowercasedTerm) ||
                contact.email.toLowerCase().includes(lowercasedTerm) ||
                contact.phone.toLowerCase().includes(lowercasedTerm)
            );
        });
    }, [customers, searchTerm]);

    const handleViewCustomer = (customer: Customer) => {
        setViewingCustomer(customer);
        setIsDetailModalOpen(true);
    };

    const handleDeleteCustomer = (customerId: string) => {
        const customerName = customers.find(c => c.id === customerId)?.name;
        if(window.confirm(`האם אתה בטוח שברצונך למחוק את ${customerName}?`)) {
            setCustomers(prev => prev.filter(c => c.id !== customerId));
            addActivity(`לקוח נמחק: ${customerName}`);
        }
    };

    const handleSaveNewCustomer = (customerData: Partial<Customer>, contactData: Partial<Contact>) => {
        const newContact: Contact = {
            id: `cont_${Date.now()}`,
            name: contactData.name || '',
            email: contactData.email || '',
            phone: contactData.phone || '',
            role: contactData.role || 'איש קשר ראשי',
            isBillingContact: true,
            isDefault: true // Default to true for the first contact
        };

        const newCustomer: Customer = {
            id: `cust_${Date.now()}`,
            name: customerData.name || 'לקוח חדש',
            website: customerData.website || '',
            address: customerData.address || '',
            category: customerData.category || '',
            notes: customerData.notes || '',
            isSpecial: !!customerData.isSpecial,
            contacts: [newContact],
            createdAt: new Date(),
            paymentMethod: customerData.paymentMethod || PaymentMethod.BANK_TRANSFER,
            paymentTerms: customerData.paymentTerms || 'שוטף 30',
        };
        
        setCustomers(prev => [...prev, newCustomer]);
        addActivity(`לקוח חדש נוסף: ${newCustomer.name}`);
        setIsNewCustomerModalOpen(false);
    };

    const handleSaveCustomerUpdate = (updatedCustomer: Customer) => {
        // Find previous state to check for changes
        const originalCustomer = customers.find(c => c.id === updatedCustomer.id);
        
        setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
        
        // Automatic cascading update for Payment Terms
        if (originalCustomer && updatedCustomer.paymentTerms && originalCustomer.paymentTerms !== updatedCustomer.paymentTerms) {
            setOrders(prevOrders => prevOrders.map(order => {
                if (order.customerId === updatedCustomer.id) {
                     return { ...order, paymentTerms: updatedCustomer.paymentTerms! };
                }
                return order;
            }));
            addActivity(`לקוח עודכן: ${updatedCustomer.name} (עודכנו תנאי תשלום ב-${orders.filter(o => o.customerId === updatedCustomer.id).length} הזמנות)`);
        } else {
            addActivity(`לקוח עודכן: ${updatedCustomer.name}`);
        }

        setIsDetailModalOpen(false);
        setViewingCustomer(null);
    };

    const handleImportCustomers = (newCustomers: Customer[]) => {
        setCustomers(prev => [...prev, ...newCustomers]);
        addActivity(`${newCustomers.length} לקוחות יובאו בהצלחה`);
        setIsImportModalOpen(false);
    };

    const customerOrders = useMemo(() => {
        if (!viewingCustomer) return [];
        return orders.filter(o => o.customerId === viewingCustomer.id);
    }, [orders, viewingCustomer]);
    

    return (
        <div>
            <div className="flex justify-between items-center mb-6 gap-4">
                <div className="flex-grow">
                    <input
                        type="text"
                        placeholder="חיפוש לפי שם לקוח, איש קשר, טלפון או אימייל..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-primary focus:border-primary transition"
                        aria-label="חיפוש לקוחות"
                    />
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsImportModalOpen(true)} className="flex-shrink-0 flex items-center px-4 py-2 bg-secondary text-white rounded-lg hover:bg-emerald-600 transition-colors">
                        <ImportIcon className="h-5 w-5 me-2" />
                        ייבוא לקוחות
                    </button>
                    <button onClick={() => setIsNewCustomerModalOpen(true)} className="flex-shrink-0 flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        <PlusIcon className="h-5 w-5 me-2" />
                        הוסף לקוח
                    </button>
                </div>
            </div>
            <div className="bg-white shadow-md rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 text-start">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">שם חברה</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">איש קשר ראשי</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">קטגוריה</th>
                            <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תאריך הוספה</th>
                            <th className="relative px-6 py-3"><span className="sr-only">פעולות</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {filteredCustomers.map(customer => {
                            // Logic to find primary contact: Default -> Billing -> First
                            const primaryContact = customer.contacts.find(c => c.isDefault) || customer.contacts.find(c => c.isBillingContact) || customer.contacts[0];
                            let whatsappUrl = '';
                            let telUrl = '';
                            let mailtoUrl = '';

                            if (primaryContact) {
                                if (primaryContact.phone) {
                                    let cleanPhone = primaryContact.phone.replace(/[^0-9]/g, '');
                                    telUrl = `tel:${cleanPhone}`;
                                    if (cleanPhone.startsWith('0')) {
                                        cleanPhone = `972${cleanPhone.substring(1)}`;
                                    }
                                    whatsappUrl = `https://wa.me/${cleanPhone}`;
                                }
                                if (primaryContact.email) {
                                    mailtoUrl = `mailto:${primaryContact.email}`;
                                }
                            }
                            return(
                                <tr key={customer.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button onClick={() => handleViewCustomer(customer)} className="text-primary hover:text-indigo-800 font-semibold">
                                            {customer.name} {customer.isSpecial && <span title="לקוח מיוחד">⭐</span>}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        <div className="flex items-center gap-3">
                                            <span>{primaryContact?.name || '---'}</span>
                                            <div className="flex items-center gap-2">
                                                {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" title={`שלח וואטסאפ ל-${primaryContact.phone}`} className="text-green-500 hover:text-green-700"><WhatsAppIcon className="h-5 w-5"/></a>}
                                                {mailtoUrl && <a href={mailtoUrl} title={`שלח אימייל ל-${primaryContact.email}`} className="text-slate-500 hover:text-primary"><EmailIcon className="h-5 w-5"/></a>}
                                                {telUrl && <a href={telUrl} title={`התקשר ל-${primaryContact.phone}`} className="text-slate-500 hover:text-primary"><PhoneIcon className="h-5 w-5"/></a>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{customer.category || '---'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{customer.createdAt.toLocaleDateString('he-IL')}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium space-x-2 space-x-reverse">
                                        <button onClick={() => handleDeleteCustomer(customer.id)} className="text-red-600 hover:text-red-900 p-1" aria-label={`מחק את ${customer.name}`}>
                                            <DeleteIcon className="h-5 w-5"/>
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                 {filteredCustomers.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="font-semibold text-lg">לא נמצאו לקוחות</p>
                        <p>נסה מונח חיפוש אחר או הוסף לקוח חדש.</p>
                    </div>
                )}
            </div>
            {isNewCustomerModalOpen && (
                <Modal title="הוספת לקוח חדש" onClose={() => setIsNewCustomerModalOpen(false)} size="2xl">
                    <NewCustomerForm onSave={handleSaveNewCustomer} onCancel={() => setIsNewCustomerModalOpen(false)} />
                </Modal>
            )}
             {isDetailModalOpen && viewingCustomer && (
                <Modal title={`כרטיס לקוח: ${viewingCustomer.name}`} onClose={() => setIsDetailModalOpen(false)} size="5xl">
                    <CustomerDetailView 
                        customer={viewingCustomer} 
                        customerOrders={customerOrders}
                        onSave={handleSaveCustomerUpdate}
                        onCancel={() => setIsDetailModalOpen(false)}
                        onNavigateToOrder={onNavigateToOrder}
                    />
                </Modal>
            )}
             {isImportModalOpen && (
                <Modal title="ייבוא לקוחות" onClose={() => setIsImportModalOpen(false)} size="2xl">
                    <CustomerImportModal onImport={handleImportCustomers} onCancel={() => setIsImportModalOpen(false)} />
                </Modal>
            )}
        </div>
    );
};

export default CustomersPage;
