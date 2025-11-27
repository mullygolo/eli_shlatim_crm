
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Order, Customer, Supplier, Employee, OrderStatus, PaymentStatus, LineItem, LineItemUnit, Attachment, Contact, PaymentMethod, AdditionalService, TimelineEvent, AttachmentCategory, OrderType, OrderStatusConfiguration } from '../types';
import { PAYMENT_STATUSES_ORDERED, PAYMENT_TERMS_OPTIONS, CUSTOMER_CATEGORIES } from '../constants';
import { PlusIcon, EditIcon, DeleteIcon, WhatsAppIcon, EmailIcon, PhoneIcon, NoteIcon, TaskIcon, LogIcon, SettingsIcon, LockIcon } from './icons';
import Modal from './Modal';
import { calculateOrderTotals, calculateDueDate } from '../utils/calculations';
import MultiSelectFilter from './MultiSelectFilter';

// Define saveOrderToMongo inline to ensure it works without external dependencies during preview
const saveOrderToMongo = async (order: Order): Promise<void> => {
    console.log('Mock saving order to DB:', order.id);
    await new Promise(resolve => setTimeout(resolve, 500));
};

interface OrdersPageProps {
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    customers: Customer[];
    setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
    suppliers: Supplier[];
    setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
    employees: Employee[];
    addActivity: (description: string) => void;
    initialOpenOrderId?: string | null;
    onOrderOpened?: () => void;
    statusConfigs: OrderStatusConfiguration[];
    getNextOrderNumber: () => string;
    vatRate: number;
}

const getProfitMarginColor = (margin: number): string => {
    if (margin <= 7) return 'text-red-600';
    if (margin <= 20) return 'text-orange-500';
    if (margin <= 49) return 'text-green-600';
    return 'text-emerald-600';
};

// Helper for timeline time diff
const getTimeDiffText = (dateStr: string, isCompleted: boolean = false) => {
    if (!dateStr) return null;
    
    if (isCompleted) {
        return { text: 'הושלם', color: 'text-slate-500' };
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dateStr);
    due.setHours(0,0,0,0);
    
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `(באיחור של ${Math.abs(diffDays)} ימים)`, color: 'text-red-600 font-bold' };
    if (diffDays === 0) return { text: '(היום)', color: 'text-green-600 font-bold' };
    if (diffDays === 1) return { text: '(מחר)', color: 'text-blue-600' };
    return { text: `(בעוד ${diffDays} ימים)`, color: 'text-slate-400' };
};


// --- Smart Search Component ---

const SmartCustomerSearch: React.FC<{
    customers: Customer[];
    selectedCustomerId: string;
    onSelect: (customerId: string) => void;
}> = ({ customers, selectedCustomerId, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync input with selected customer
    useEffect(() => {
        const c = customers.find(c => c.id === selectedCustomerId);
        if (c) {
             setSearchTerm(c.name);
        } else if (!selectedCustomerId) {
             setSearchTerm('');
        }
    }, [selectedCustomerId, customers]);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customers.slice(0, 50); 
        const lower = searchTerm.toLowerCase();
        return customers.filter(c => 
            c.name.toLowerCase().includes(lower) ||
            c.contacts.some(cont => 
                cont.name.toLowerCase().includes(lower) ||
                cont.email.toLowerCase().includes(lower) ||
                cont.phone.includes(lower)
            )
        ).slice(0, 20); 
    }, [customers, searchTerm]);

    const handleSelect = (customer: Customer) => {
        onSelect(customer.id);
        setSearchTerm(customer.name);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <label className="block text-sm font-medium text-slate-700 mb-1">בחר לקוח <span className="text-red-500">*</span></label>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    className="block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border pl-10"
                    placeholder="הקלד שם לקוח, איש קשר, טלפון או אימייל..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                        if (e.target.value === '') onSelect('');
                    }}
                    onFocus={() => setIsOpen(true)}
                    autoComplete="off"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>
            
            {/* Dropdown logic... */}
            {isOpen && (
                <ul className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-slate-200">
                    {filteredCustomers.length === 0 ? (
                        <li className="text-gray-500 select-none relative py-2 pl-3 pr-9 text-center">לא נמצאו תוצאות</li>
                    ) : (
                        filteredCustomers.map(customer => {
                            // Determine what matched to display it
                            let matchLabel = '';
                            const lowerTerm = searchTerm.toLowerCase();
                            const matchedContact = customer.contacts.find(c => 
                                c.name.toLowerCase().includes(lowerTerm) ||
                                c.email.toLowerCase().includes(lowerTerm) ||
                                c.phone.includes(lowerTerm)
                            );

                            if (matchedContact && searchTerm) {
                                matchLabel = `איש קשר: ${matchedContact.name} (${matchedContact.phone || matchedContact.email})`;
                            } else {
                                // Fallback info
                                matchLabel = customer.contacts[0] 
                                    ? `${customer.contacts[0].name} | ${customer.contacts[0].phone}` 
                                    : customer.address;
                            }

                            return (
                                <li 
                                    key={customer.id}
                                    className="text-gray-900 cursor-default select-none relative py-2 pl-3 pr-4 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0"
                                    onClick={() => handleSelect(customer)}
                                >
                                    <div className="flex flex-col text-start">
                                        <span className="font-medium block truncate text-slate-800">
                                            {customer.name}
                                        </span>
                                        <span className="text-xs text-gray-500 truncate">
                                            {matchLabel}
                                        </span>
                                    </div>
                                </li>
                            );
                        })
                    )}
                    <li className="sticky bottom-0 bg-slate-50 border-t border-slate-200 p-2 text-center text-xs text-slate-500">
                         מציג {filteredCustomers.length} תוצאות
                    </li>
                </ul>
            )}
        </div>
    );
};

const NewSupplierForm: React.FC<{ onSave: (supplier: { name: string; contactPerson: string; email: string; phone: string }) => void; onCancel: () => void; }> = ({ onSave, onCancel }) => {
    const [formData, setFormData] = useState({ name: '', contactPerson: '', email: '', phone: '' });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 text-start">
            <div>
                <label className="block text-sm font-medium text-slate-700">שם הספק</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">איש קשר ראשי</label>
                <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">אימייל</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">טלפון</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
            </div>
            <div className="flex justify-end space-x-2 pt-4 space-x-reverse">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור</button>
            </div>
        </form>
    );
};

const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
    GRAPHICS: 'גרפיקה והדמיה',
    SITE_BEFORE: 'תמונות שטח (לפני)',
    SITE_AFTER: 'תמונות שטח (אחרי)',
    DOCUMENTS: 'מסמכים וחוזים',
    GENERAL: 'כללי',
};

const PdfViewer: React.FC<{ dataUrl: string }> = ({ dataUrl }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        let url: string | null = null;
        try {
            const parts = dataUrl.split(',');
            if (parts.length === 2) {
                const mime = 'application/pdf'; 
                const bstr = atob(parts[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                const blob = new Blob([u8arr], { type: mime });
                url = URL.createObjectURL(blob);
                setBlobUrl(url);
            } else {
                setBlobUrl(dataUrl);
            }
        } catch (e) {
            console.error("Failed to create blob from data url", e);
        }

        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [dataUrl]);

    if (!blobUrl) return <div className="flex items-center justify-center h-full text-slate-400">טוען תצוגה מקדימה...</div>;

    return (
        <div className="w-full h-full relative group bg-gray-100">
            <iframe 
                src={blobUrl} 
                className="w-full h-full border-none"
                title="PDF Preview"
            />
            <div className="absolute bottom-6 right-6 z-10">
                <a 
                    href={blobUrl} 
                    download="document.pdf" 
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg shadow-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l0 6m0 0l-3.75-3.75M12 18.75l3.75-3.75M12 3v13.5" />
                    </svg>
                    הורד קובץ
                </a>
            </div>
        </div>
    );
};

const OrderFileManager: React.FC<{ 
    attachments: Attachment[]; 
    onUpdate: (newAttachments: Attachment[]) => void;
}> = ({ attachments, onUpdate }) => {
    const [activeTab, setActiveTab] = useState<AttachmentCategory | 'ALL'>('ALL');
    const [previewFile, setPreviewFile] = useState<Attachment | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files: File[] = Array.from(e.target.files);
            e.target.value = '';
            const filePromises = files.map(file => {
                return new Promise<Attachment>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (event.target?.result) {
                            const category: AttachmentCategory = activeTab === 'ALL' ? 'GENERAL' : activeTab;
                            let fileType = file.type;
                            if (!fileType || fileType === '') {
                                const lowerName = file.name.toLowerCase();
                                if (lowerName.endsWith('.pdf')) fileType = 'application/pdf';
                                else if (lowerName.match(/\.(jpg|jpeg|png|gif|webp)$/)) fileType = 'image/jpeg';
                                else if (lowerName.match(/\.(mp4|mov|avi|webm|mkv)$/)) fileType = 'video/mp4';
                            }
                            resolve({
                                id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                fileName: file.name,
                                dataUrl: event.target.result as string,
                                type: fileType,
                                category: category
                            });
                        } else {
                            reject(new Error("File reading failed"));
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });
            Promise.all(filePromises).then(newAttachments => {
                onUpdate([...attachments, ...newAttachments]);
            });
        }
    };

    const removeAttachment = (id: string) => {
        if (window.confirm("האם למחוק קובץ זה?")) {
            onUpdate(attachments.filter(att => att.id !== id));
        }
    };

    const filteredAttachments = useMemo(() => {
        if (activeTab === 'ALL') return attachments;
        return attachments.filter(a => (a.category || 'GENERAL') === activeTab);
    }, [attachments, activeTab]);

    const downloadFile = (att: Attachment) => {
        const link = document.createElement('a');
        link.href = att.dataUrl;
        link.download = att.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderFileIcon = (att: Attachment) => {
        if (att.type.startsWith('image/')) {
             return <img src={att.dataUrl} alt={att.fileName} className="w-full h-full object-cover transition-transform group-hover:scale-105" />;
        }
        if (att.type.startsWith('video/')) {
             return (
                <div className="flex flex-col items-center justify-center h-full w-full text-purple-600 bg-slate-100 relative">
                     <svg className="w-12 h-12 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                     </svg>
                     <span className="text-[10px] font-bold">VIDEO</span>
                     <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/10 transition-opacity">
                        <svg className="w-8 h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                     </div>
                </div>
             );
        }
        let iconColor = "text-slate-400";
        let iconLabel = "";
        const isPdf = att.type === 'application/pdf' || att.fileName.toLowerCase().endsWith('.pdf');
        if (isPdf) {
            iconColor = "text-red-500";
            iconLabel = "PDF";
        } else if (att.type.includes('word') || att.fileName.endsWith('.doc') || att.fileName.endsWith('.docx')) {
            iconColor = "text-blue-600";
            iconLabel = "DOC";
        } else if (att.type.includes('excel') || att.type.includes('spreadsheet') || att.fileName.endsWith('.xls') || att.fileName.endsWith('.xlsx')) {
            iconColor = "text-green-600";
            iconLabel = "XLS";
        } else {
             iconLabel = att.fileName.split('.').pop()?.toUpperCase().slice(0,3) || "FILE";
        }
        return (
            <div className={`flex flex-col items-center justify-center h-full w-full ${iconColor}`}>
                 <svg className="w-12 h-12 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                 </svg>
                 <span className="text-[10px] font-bold">{iconLabel}</span>
            </div>
        );
    };

    return (
        <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
            {/* Header Tabs */}
            <div className="flex flex-wrap border-b border-slate-200 bg-white px-2 pt-2">
                <button 
                    type="button"
                    onClick={() => setActiveTab('ALL')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'ALL' ? 'bg-slate-50 text-primary border-t border-x border-slate-200 relative -bottom-px' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    הכל
                </button>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <button 
                        type="button"
                        key={key}
                        onClick={() => setActiveTab(key as AttachmentCategory)}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === key ? 'bg-slate-50 text-primary border-t border-x border-slate-200 relative -bottom-px' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="p-4 min-h-[200px]">
                {/* Upload Area */}
                <div className="mb-4">
                     <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <div className="flex items-center gap-2 text-slate-500">
                                <PlusIcon className="w-6 h-6"/>
                                <p className="text-sm font-medium">
                                    לחץ להעלאת קבצים 
                                    {activeTab !== 'ALL' && <span className="font-bold text-primary"> לתיקיית {CATEGORY_LABELS[activeTab]}</span>}
                                </p>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">תומך בתמונות, וידאו, PDF, וורד, אקסל ועוד</p>
                        </div>
                        <input type="file" className="hidden" multiple onChange={handleFileChange} />
                    </label>
                </div>

                {/* Files Grid */}
                {filteredAttachments.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 text-sm">
                        לא נמצאו קבצים בקטגוריה זו.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {filteredAttachments.map(att => {
                            // ... file mapping
                            const isPdf = att.type === 'application/pdf' || att.fileName.toLowerCase().endsWith('.pdf');
                            const isVideo = att.type.startsWith('video/');
                            const isPreviewable = att.type.startsWith('image/') || isPdf || isVideo;
                            const categoryLabel = CATEGORY_LABELS[att.category || 'GENERAL'];
                            
                            return (
                                <div key={att.id} className="group relative bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">
                                    {/* Preview/Icon */}
                                    <div 
                                        className={`h-28 bg-slate-100 flex items-center justify-center overflow-hidden relative ${isPreviewable ? 'cursor-pointer' : ''}`} 
                                        onClick={() => isPreviewable && setPreviewFile(att)}
                                    >
                                        {renderFileIcon(att)}
                                        <div className="absolute top-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                                            {categoryLabel}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="p-2 flex-1 flex flex-col justify-between">
                                        <p className="text-xs font-medium text-slate-700 truncate" title={att.fileName}>{att.fileName}</p>
                                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                                            <button type="button" onClick={() => downloadFile(att)} className="text-primary hover:text-indigo-800 text-xs font-medium">הורד</button>
                                            <button type="button" onClick={() => removeAttachment(att.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">מחק</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* File Preview Modal */}
            {previewFile && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => setPreviewFile(null)}>
                    <div className="relative w-full h-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        
                        <button 
                            type="button"
                            onClick={() => setPreviewFile(null)}
                            className="absolute top-4 right-4 z-20 text-white hover:text-gray-300 bg-black/50 rounded-full p-2"
                        >
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>

                        <div className="w-full max-w-6xl h-[90vh] bg-white rounded-lg overflow-hidden shadow-2xl flex flex-col">
                             <div className="bg-slate-800 text-white p-3 flex justify-between items-center">
                                <span className="truncate font-medium">{previewFile.fileName}</span>
                                <span className="text-xs opacity-70">{CATEGORY_LABELS[previewFile.category || 'GENERAL']}</span>
                             </div>
                             <div className="flex-1 bg-slate-100 overflow-hidden flex items-center justify-center p-0 relative">
                                {previewFile.type.startsWith('image/') ? (
                                     <img src={previewFile.dataUrl} alt={previewFile.fileName} className="max-w-full max-h-full object-contain" />
                                ) : previewFile.type.startsWith('video/') ? (
                                     <video controls src={previewFile.dataUrl} className="max-w-full max-h-full outline-none bg-black" />
                                ) : (previewFile.type === 'application/pdf' || previewFile.fileName.toLowerCase().endsWith('.pdf')) ? (
                                    <PdfViewer dataUrl={previewFile.dataUrl} />
                                ) : (
                                    <div className="text-center text-slate-500">
                                        <p className="mb-4">אין תצוגה מקדימה זמינה לקובץ זה.</p>
                                        <button onClick={() => downloadFile(previewFile)} className="px-4 py-2 bg-primary text-white rounded hover:bg-indigo-700">
                                            הורד קובץ
                                        </button>
                                    </div>
                                )}
                             </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


const OrderForm: React.FC<{
    order: Order | null;
    customers: Customer[];
    setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
    suppliers: Supplier[];
    setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
    employees: Employee[];
    onSave: (order: Order, keepOpen?: boolean) => void;
    onCancel: () => void;
    addActivity: (description: string) => void;
    allOrders?: Order[]; 
    onSwitchOrder: (orderId: string) => void; 
    statusConfigs: OrderStatusConfiguration[];
    getNextOrderNumber: () => string;
}> = ({ order, customers, setCustomers, suppliers, setSuppliers, employees, onSave, onCancel, addActivity, allOrders = [], onSwitchOrder, statusConfigs, getNextOrderNumber }) => {
    // ... (Full OrderForm implementation as before)
    const [customerMode, setCustomerMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
    const [newCustomerData, setNewCustomerData] = useState({
        name: '',
        contactName: '',
        email: '',
        phone: '',
        address: '',
        category: '',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentTerms: 'שוטף 30',
    });

    const isEditMode = !!order;

    const [formData, setFormData] = useState<Omit<Order, 'id' | 'orderNumber'>>(
        order 
        ? { ...order, type: order.type || OrderType.REGULAR }
        : {
            description: '',
            type: OrderType.REGULAR,
            date: new Date(),
            createdAt: new Date(), 
            dealStartDate: undefined,
            customerId: order ? order['customerId'] : '', 
            contactId: '',
            employeeId: employees.length > 0 ? employees[0].id : '',
            orderStatus: OrderStatus.NEW_LEAD,
            paymentStatus: PaymentStatus.UNPAID,
            lineItems: [{ id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, cost: 0, unitType: LineItemUnit.UNIT }],
            paymentTerms: 'שוטף 30',
            invoiceIssued: false,
            receiptIssued: false,
            additionalServices: [],
            attachments: [],
            timeline: [],
            statusHistory: [],
        }
    );
     const [dateString, setDateString] = useState(() => {
        try {
            return formData.date ? new Date(formData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        } catch (e) {
            return new Date().toISOString().split('T')[0];
        }
     });

     const [dealStartDateString, setDealStartDateString] = useState(() => {
         try {
             return formData.dealStartDate ? new Date(formData.dealStartDate).toISOString().split('T')[0] : '';
         } catch (e) {
             return '';
         }
     });

     const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
     const [newServiceSupplierFor, setNewServiceSupplierFor] = useState<number | null>(null);
     const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'HUMAN' | 'SYSTEM'>('HUMAN');
     const [newTimelineEntry, setNewTimelineEntry] = useState({
        type: 'NOTE' as 'NOTE' | 'TASK',
        content: '',
        assigneeId: '',
        dueDate: new Date().toISOString().split('T')[0], 
    });

    useEffect(() => {
        if (order) {
            setFormData({ ...order, type: order.type || OrderType.REGULAR });
            try {
                setDateString(new Date(order.date).toISOString().split('T')[0]);
                const dsd = order.dealStartDate ? new Date(order.dealStartDate) : null;
                setDealStartDateString(dsd && !isNaN(dsd.getTime()) ? dsd.toISOString().split('T')[0] : '');
            } catch (e) {
                console.error("Error parsing order dates", e);
                setDateString(new Date().toISOString().split('T')[0]);
                setDealStartDateString('');
            }
            setCustomerMode('EXISTING'); 
        }
    }, [order]);

    const minDealDate = useMemo(() => {
        try {
            const d = formData.createdAt ? new Date(formData.createdAt) : (formData.date ? new Date(formData.date) : new Date());
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
        } catch (e) {}
        return undefined;
    }, [formData.createdAt, formData.date]);

    const totals = useMemo(() => calculateOrderTotals(formData), [formData]);
    const selectedCustomer = useMemo(() => customers.find(c => c.id === formData.customerId), [customers, formData.customerId]);
    const selectedContact = useMemo(() => selectedCustomer?.contacts.find(c => c.id === formData.contactId), [selectedCustomer, formData.contactId]);
    
    const parentOrder = useMemo(() => formData.parentOrderId ? allOrders.find(o => o.id === formData.parentOrderId) : null, [formData.parentOrderId, allOrders]);
    
    const childOrders = useMemo(() => order ? allOrders.filter(o => o.parentOrderId === order.id) : [], [order, allOrders]);

    const openTasks = useMemo(() => 
        formData.timeline.filter(t => t.type === 'TASK' && !t.isCompleted),
    [formData.timeline]);

    const filteredTimeline = useMemo(() => {
        return formData.timeline.filter(event => {
            if (timelineFilter === 'ALL') return true;
            if (timelineFilter === 'HUMAN') return event.type === 'NOTE' || event.type === 'TASK';
            if (timelineFilter === 'SYSTEM') return event.type === 'LOG';
            return true;
        });
    }, [formData.timeline, timelineFilter]);


    useEffect(() => {
        if (customerMode === 'EXISTING' && selectedCustomer) {
            const currentContactIsValid = selectedCustomer.contacts.some(c => c.id === formData.contactId);
            if (!currentContactIsValid) {
                const primaryContact = 
                    selectedCustomer.contacts.find(c => c.isDefault) || 
                    selectedCustomer.contacts.find(c => c.isBillingContact) || 
                    (selectedCustomer.contacts.length > 0 ? selectedCustomer.contacts[0] : null);
                
                setFormData(prev => ({ ...prev, contactId: primaryContact?.id || '' }));
            }
            const shouldUpdateTerms = !order || (order && order.customerId !== formData.customerId);
            if (shouldUpdateTerms && selectedCustomer.paymentTerms) {
                 setFormData(prev => ({ ...prev, paymentTerms: selectedCustomer.paymentTerms! }));
            }
        }
    }, [formData.customerId, selectedCustomer, customerMode, order]);


    const handleMasterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({...prev, [name]: checked }));
        } else {
             setFormData(prev => ({ ...prev, [name]: value }));
        }
        if (name === 'date') {
            setDateString(value);
        }
        if (name === 'dealStartDate') {
             setDealStartDateString(value);
        }
    };

    const handleNewCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setNewCustomerData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleLineItemChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const newLineItems = [...formData.lineItems];
        const item = { ...newLineItems[index] };

        (item as any)[name] = (name === 'description' || name === 'unitType' || name === 'supplierId') ? value : parseFloat(value) || 0;

        if (item.unitType === LineItemUnit.M2) {
            const width = item.width || 0;
            const height = item.height || 0;
            item.quantity = width * height;
        }

        newLineItems[index] = item;
        setFormData(prev => ({ ...prev, lineItems: newLineItems }));
    };

    const addLineItem = () => {
        setFormData(prev => ({ ...prev, lineItems: [...prev.lineItems, { id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, cost: 0, unitType: LineItemUnit.UNIT }]}));
    };

    const removeLineItem = (index: number) => {
        setFormData(prev => ({ ...prev, lineItems: prev.lineItems.filter((_, i) => i !== index)}));
    };

    const handleAdditionalServiceChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const newServices = [...formData.additionalServices];
        const service = { ...newServices[index] };
        (service as any)[name] = (name === 'cost' || name === 'price') ? parseFloat(value) || 0 : value;
        newServices[index] = service;
        setFormData(prev => ({ ...prev, additionalServices: newServices }));
    };

    const addAdditionalService = () => {
        setFormData(prev => ({
            ...prev,
            additionalServices: [
                ...prev.additionalServices,
                { id: `as_${Date.now()}`, description: '', cost: 0, price: 0 }
            ]
        }));
    };

    const removeAdditionalService = (index: number) => {
        setFormData(prev => ({
            ...prev,
            additionalServices: prev.additionalServices.filter((_, i) => i !== index)
        }));
    };
    
    const handleSaveNewSupplier = (supplierData: { name: string; contactPerson: string; email: string; phone: string }) => {
        const newSupplier: Supplier = {
            id: `supp_${Date.now()}`,
            name: supplierData.name || 'ספק חדש',
            paymentTerms: 'שוטף 30',
            contacts: [{
                id: `sc_${Date.now()}`,
                name: supplierData.contactPerson || '',
                email: supplierData.email || '',
                phone: supplierData.phone || '',
                role: 'איש קשר ראשי',
                isBillingContact: false,
                isDefault: true
            }]
        };
        setSuppliers(prev => [...prev, newSupplier]);
        
        if (newServiceSupplierFor !== null) {
            const newServices = [...formData.additionalServices];
            newServices[newServiceSupplierFor].supplierId = newSupplier.id;
            setFormData(prev => ({ ...prev, additionalServices: newServices }));
        }

        addActivity(`ספק חדש נוסף: ${newSupplier.name}`);
        setIsNewSupplierModalOpen(false);
        setNewServiceSupplierFor(null);
    };

    const handleAddTimelineEvent = () => {
        if (!newTimelineEntry.content.trim()) return;
        const currentUser = employees.find(emp => emp.id === formData.employeeId)?.name || 'מערכת';
        const targetAssigneeId = newTimelineEntry.assigneeId || formData.employeeId;

        const newEvent: TimelineEvent = {
            id: `tl_${Date.now()}`,
            timestamp: new Date(),
            user: currentUser, 
            type: newTimelineEntry.type,
            content: newTimelineEntry.content,
            ...(newTimelineEntry.type === 'TASK' && {
                isCompleted: false,
                assigneeId: targetAssigneeId, 
                dueDate: newTimelineEntry.dueDate || new Date().toISOString().split('T')[0], 
            }),
        };

        setFormData(prev => ({
            ...prev,
            timeline: [newEvent, ...prev.timeline],
        }));

        setNewTimelineEntry({ 
            type: 'NOTE', 
            content: '', 
            assigneeId: '', 
            dueDate: new Date().toISOString().split('T')[0] 
        });
        setTimelineFilter('HUMAN');
    };

    const handleToggleTaskComplete = (eventId: string, currentStatus: boolean) => {
        const currentUser = employees.find(emp => emp.id === formData.employeeId)?.name || 'מערכת';
        let taskContent = '';

        const updatedTimeline = formData.timeline.map(event => {
            if (event.id === eventId) {
                taskContent = event.content;
                const newStatus = !currentStatus;
                return { 
                    ...event, 
                    isCompleted: newStatus,
                    completedAt: newStatus ? new Date() : undefined,
                    completedBy: newStatus ? currentUser : undefined 
                };
            }
            return event;
        });

        const logContent = !currentStatus
            ? `משימה הושלמה ע"י ${currentUser}: "${taskContent}"`
            : `משימה סומנה כלא הושלמה ע"י ${currentUser}: "${taskContent}"`;

        const logEvent: TimelineEvent = {
            id: `tl_log_${Date.now()}`,
            timestamp: new Date(),
            user: currentUser,
            type: 'LOG',
            content: logContent,
        };

        setFormData(prev => ({
            ...prev,
            timeline: [logEvent, ...updatedTimeline],
        }));
    };

    const handleCreateServiceCall = () => {
        if (!order) return;
        
        const serviceOrder: Order = {
            id: `ord_srv_${Date.now()}`,
            orderNumber: `SRV-${order.orderNumber.replace('ORD-', '')}-${childOrders.length + 1}`,
            description: `תיקון/שירות עבור: ${order.description}`,
            type: OrderType.SERVICE_CALL,
            parentOrderId: order.id,
            date: new Date(),
            createdAt: new Date(),
            customerId: order.customerId,
            contactId: order.contactId,
            employeeId: order.employeeId,
            orderStatus: OrderStatus.NEW_LEAD, 
            paymentStatus: PaymentStatus.UNPAID, 
            lineItems: [], 
            paymentTerms: 'תשלום מיידי', 
            invoiceIssued: false,
            receiptIssued: false,
            additionalServices: [],
            attachments: [],
            timeline: [{
                id: `tl_srv_start_${Date.now()}`,
                timestamp: new Date(),
                user: 'מערכת',
                type: 'LOG',
                content: `קריאת שירות נפתחה עבור הזמנה ${order.orderNumber}`
            }],
            statusHistory: [{ status: OrderStatus.NEW_LEAD, startDate: new Date() }],
        };

        onSave(serviceOrder, true);
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let currentCustomerId = formData.customerId;
        let currentContactId = formData.contactId;
        
        if (customerMode === 'NEW') {
             if (!newCustomerData.name) {
                 alert("אנא הזן שם חברה");
                 return;
             }
             const newContact: Contact = {
                id: `cont_${Date.now()}`,
                name: newCustomerData.contactName || 'איש קשר ראשי',
                email: newCustomerData.email || '',
                phone: newCustomerData.phone || '',
                role: 'איש קשר ראשי',
                isBillingContact: true,
                isDefault: true,
            };

            const newCustomer: Customer = {
                id: `cust_${Date.now()}`,
                name: newCustomerData.name,
                website: '',
                address: newCustomerData.address || '',
                category: newCustomerData.category || 'לקוח כללי',
                notes: 'נוצר מתוך טופס הזמנה',
                isSpecial: false,
                contacts: [newContact],
                createdAt: new Date(),
                paymentMethod: newCustomerData.paymentMethod as PaymentMethod,
                paymentTerms: newCustomerData.paymentTerms,
            };

            setCustomers(prev => [...prev, newCustomer]);
            addActivity(`לקוח חדש נוצר מתוך הזמנה: ${newCustomer.name}`);
            
            currentCustomerId = newCustomer.id;
            currentContactId = newContact.id;
        } else {
             if (!currentCustomerId) {
                 alert("אנא בחר לקוח");
                 return;
             }
        }

        const user = employees.find(emp => emp.id === formData.employeeId)?.name || 'מערכת';
        
        let finalDealStartDate = formData.dealStartDate;
        if (dealStartDateString) {
            finalDealStartDate = new Date(dealStartDateString);
        } else {
             const statusConfig = statusConfigs.find(c => c.label === formData.orderStatus);
             if (statusConfig?.isActiveDeal && !finalDealStartDate) {
                 finalDealStartDate = new Date();
             }
        }

        let updatedFormData = { 
            ...formData, 
            customerId: currentCustomerId, 
            contactId: currentContactId,
            dealStartDate: finalDealStartDate,
            paymentTerms: customerMode === 'NEW' ? newCustomerData.paymentTerms : formData.paymentTerms
        };
        
        let finalTimeline = [...updatedFormData.timeline];
        const originalOrder = order;

        const addLogEntry = (content: string) => {
            finalTimeline.unshift({
                id: `log_${Date.now()}_${Math.random()}`,
                timestamp: new Date(),
                content,
                user,
                type: 'LOG'
            });
        };

        if (!originalOrder) {
            addLogEntry('הזמנה נוצרה');
            updatedFormData.statusHistory = [{ status: updatedFormData.orderStatus, startDate: new Date() }];
        } else {
             // ... Diff logic (omitted for brevity, same as previous) ...
             const changes: string[] = [];
             if (originalOrder.description !== updatedFormData.description) changes.push(`כותרת הזמנה שונתה מ: "${originalOrder.description}" ל: "${updatedFormData.description}"`);
             if (originalOrder.orderStatus !== updatedFormData.orderStatus) {
                 changes.push(`סטטוס הזמנה שונה מ: "${originalOrder.orderStatus}" ל: "${updatedFormData.orderStatus}"`);
                 const newStatusHistory = updatedFormData.statusHistory ? [...updatedFormData.statusHistory] : [];
                 newStatusHistory.push({ status: updatedFormData.orderStatus, startDate: new Date() });
                 updatedFormData.statusHistory = newStatusHistory;
             }
             // Simple check for total amount change to log
             const oldTotals = calculateOrderTotals(originalOrder);
             const newTotals = calculateOrderTotals(updatedFormData);
             if (oldTotals.totalAmount !== newTotals.totalAmount) {
                 changes.push(`סה"כ הזמנה עודכן מ-₪${oldTotals.totalAmount.toLocaleString()} ל-₪${newTotals.totalAmount.toLocaleString()}`);
             }
             changes.forEach(c => addLogEntry(c));
        }
        
        const finalOrder = {
            ...updatedFormData,
            id: order?.id || `ord_${Date.now()}`,
            orderNumber: order?.orderNumber || getNextOrderNumber(), 
            date: new Date(dateString),
            dealStartDate: updatedFormData.dealStartDate, 
            timeline: finalTimeline,
        };

        onSave(finalOrder);

        if (!order) {
             await saveOrderToMongo(finalOrder);
        }
    };
    
    const currentStatusConfig = statusConfigs.find(c => c.label === formData.orderStatus);
    const isActiveDeal = currentStatusConfig ? currentStatusConfig.isActiveDeal : false;
    const hasDealDate = !!formData.dealStartDate;
    const isDealActiveAndDated = isActiveDeal && hasDealDate;

    return (
        // ... (JSX remains largely the same)
        <form onSubmit={handleSubmit} className="space-y-8 text-start">
             {isNewSupplierModalOpen && (
                <Modal title="הוספת ספק חדש (שליח/מתקין)" onClose={() => setIsNewSupplierModalOpen(false)}>
                    <NewSupplierForm onSave={handleSaveNewSupplier} onCancel={() => setIsNewSupplierModalOpen(false)} />
                </Modal>
            )}

            {/* ... (Top Actions and Links, Section 1, Section 2 omitted for brevity as they are unchanged) ... */}
            <div className="space-y-2">
                {parentOrder && (
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-md flex items-center gap-2 text-blue-800">
                        <span className="font-bold text-sm">מקושר להזמנת אב:</span>
                        <button type="button" onClick={() => onSwitchOrder(parentOrder.id)} className="text-sm font-mono underline hover:text-blue-600 cursor-pointer">
                            {parentOrder.orderNumber}
                        </button>
                        <span className="text-xs text-blue-600">({parentOrder.description})</span>
                    </div>
                )}
                 {childOrders.length > 0 && (
                    <div className="bg-red-50 border border-red-200 p-3 rounded-md flex flex-col gap-1 text-red-800">
                         <div className="flex items-center gap-2">
                            <SettingsIcon className="h-4 w-4" />
                            <span className="font-bold text-sm">קיימות קריאות שירות להזמנה זו:</span>
                         </div>
                         <div className="flex flex-wrap gap-2 pr-6">
                            {childOrders.map(child => (
                                <button key={child.id} type="button" onClick={() => onSwitchOrder(child.id)} className="text-sm underline hover:text-red-600 cursor-pointer bg-white px-2 py-0.5 rounded border border-red-100 shadow-sm flex items-center gap-1">
                                    <span className="font-mono font-bold">{child.orderNumber}</span>
                                    <span className="text-xs opacity-75">({child.orderStatus})</span>
                                </button>
                            ))}
                         </div>
                    </div>
                )}
            </div>

            {/* Section 1: Order & Customer Details */}
            <div className="space-y-4">
                {/* ... content omitted ... */}
                <div className="flex justify-between items-center border-b pb-2">
                    <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold text-slate-800">פרטי הזמנה ולקוח</h3>
                        {formData.type === OrderType.SERVICE_CALL && (
                            <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-bold flex items-center">
                                <SettingsIcon className="w-3 h-3 me-1" />
                                קריאת שירות
                            </span>
                        )}
                    </div>
                    {!isEditMode && !formData.parentOrderId && (
                        <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-medium">
                            <button type="button" onClick={() => setCustomerMode('EXISTING')} className={`px-3 py-1.5 rounded-md transition-all ${customerMode === 'EXISTING' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>לקוח קיים</button>
                             <button type="button" onClick={() => setCustomerMode('NEW')} className={`px-3 py-1.5 rounded-md transition-all ${customerMode === 'NEW' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>+ לקוח חדש</button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-200/60 flex flex-col relative">
                        <div className="flex items-center gap-1 mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">נוצר בתאריך</span>
                            <div className="text-slate-300"><SettingsIcon className="w-3 h-3"/></div>
                        </div>
                        <div className="font-mono text-sm font-semibold text-slate-600 bg-transparent border-none p-0">
                            {formData.createdAt 
                                ? new Date(formData.createdAt).toLocaleDateString('he-IL') 
                                : (formData.date ? new Date(formData.date).toLocaleDateString('he-IL') : new Date().toLocaleDateString('he-IL'))
                            }
                        </div>
                        <div className="absolute top-2 left-2 text-slate-300 text-xs" title="לקריאה בלבד">🔒</div>
                    </div>

                    <div className={`rounded-lg p-2 border transition-all flex flex-col relative group ${isDealActiveAndDated ? 'bg-green-50 border-green-200' : (hasDealDate ? 'bg-slate-50 border-slate-300' : 'bg-slate-50 border-slate-200 border-dashed')}`}>
                        <div className="flex justify-between items-start mb-1">
                            <label htmlFor="dealStartDate" className={`block text-[10px] font-bold uppercase tracking-wider cursor-pointer ${isDealActiveAndDated ? 'text-green-700' : 'text-slate-500'}`}>
                                {hasDealDate ? 'תאריך אישור עסקה' : 'טרם אושרה עסקה'}
                            </label>
                             <div className={`text-[10px] px-1.5 rounded-full border flex items-center gap-1 ${isActiveDeal ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isActiveDeal ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                {isActiveDeal ? 'פעיל' : 'לא פעיל'}
                            </div>
                        </div>
                        <input type="date" name="dealStartDate" id="dealStartDate" value={dealStartDateString} onChange={handleMasterChange} min={minDealDate} className={`block w-full text-sm font-semibold bg-transparent border-none p-0 focus:ring-0 cursor-pointer ${isDealActiveAndDated ? 'text-green-800' : 'text-slate-500'}`} />
                    </div>
                </div>

                <div className={`p-4 rounded-lg border ${customerMode === 'NEW' ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                    {customerMode === 'EXISTING' ? (
                        <div className="space-y-4">
                            <SmartCustomerSearch customers={customers} selectedCustomerId={formData.customerId} onSelect={(id) => setFormData(prev => ({ ...prev, customerId: id, contactId: '' }))} />
                            <div>
                                <label className="block text-sm font-medium text-slate-700">איש קשר</label>
                                <select name="contactId" value={formData.contactId || ''} onChange={handleMasterChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" disabled={!selectedCustomer}>
                                    <option value="">בחר איש קשר</option>
                                    {selectedCustomer?.contacts.map(c => <option key={c.id} value={c.id}>{c.name} {c.isDefault ? '(★ ברירת מחדל)' : ''}</option>)}
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700">תנאי תשלום</label>
                                <div className="relative">
                                    <input type="text" value={formData.paymentTerms || ''} readOnly className="mt-1 block w-full rounded-md border-slate-300 bg-slate-100 text-slate-500 shadow-sm sm:text-sm cursor-not-allowed pr-8" />
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <LockIcon className="h-4 w-4 text-slate-400" />
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">{selectedCustomer ? `(מוגדר עבור ${selectedCustomer.name})` : 'מוגדר בכרטיס לקוח'}</p>
                            </div>

                            {selectedContact && (
                                <div className="mt-2 text-xs text-slate-500 bg-white p-2 rounded border border-slate-100">
                                    <p><strong>תפקיד:</strong> {selectedContact.role}</p>
                                    <p><strong>טלפון:</strong> {selectedContact.phone}</p>
                                    <p><strong>מייל:</strong> {selectedContact.email}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* ... New Customer Fields ... */}
                            <h4 className="text-sm font-bold text-indigo-800 mb-2 border-b border-indigo-200 pb-1">פרטי לקוח חדש</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-slate-600">שם חברה <span className="text-red-500">*</span></label>
                                    <input type="text" name="name" value={newCustomerData.name} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs" required />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600">קטגוריה</label>
                                    <select name="category" value={newCustomerData.category} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs bg-white">
                                        <option value="">בחר קטגוריה</option>
                                        {CUSTOMER_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                {/* ... other fields ... */}
                                <div>
                                    <label className="block text-xs font-medium text-slate-600">שם איש קשר</label>
                                    <input type="text" name="contactName" value={newCustomerData.contactName} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs" />
                                </div>
                                    <div>
                                    <label className="block text-xs font-medium text-slate-600">טלפון</label>
                                    <input type="text" name="phone" value={newCustomerData.phone} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-slate-600">אימייל</label>
                                    <input type="email" name="email" value={newCustomerData.email} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs" />
                                </div>
                                    <div className="col-span-2">
                                    <label className="block text-xs font-medium text-slate-600">כתובת</label>
                                    <input type="text" name="address" value={newCustomerData.address} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600">אמצעי תשלום</label>
                                        <select name="paymentMethod" value={newCustomerData.paymentMethod} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs bg-white">
                                        {Object.values(PaymentMethod).map(method => <option key={method} value={method}>{method}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600">תנאי תשלום</label>
                                    <select name="paymentTerms" value={newCustomerData.paymentTerms} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs bg-white">
                                        {PAYMENT_TERMS_OPTIONS.map(term => <option key={term} value={term}>{term}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Section 2: Payments & Statuses */}
            <div className="space-y-4">
                <h3 className="text-xl font-semibold text-slate-800 border-b pb-2">תשלומים וסטטוסים</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">סוכן מטפל</label>
                        <select name="employeeId" value={formData.employeeId} onChange={handleMasterChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                            <option value="">בחר עובד</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">סטטוס הזמנה</label>
                        <select name="orderStatus" value={formData.orderStatus} onChange={handleMasterChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                            {statusConfigs.sort((a,b) => a.orderIndex - b.orderIndex).map(config => (
                                <option key={config.id} value={config.label}>{config.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">סטטוס תשלום</label>
                        <select name="paymentStatus" value={formData.paymentStatus} onChange={handleMasterChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                            {PAYMENT_STATUSES_ORDERED.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex space-x-4 space-x-reverse pt-2">
                    <label className="flex items-center"><input type="checkbox" name="invoiceIssued" checked={formData.invoiceIssued} onChange={handleMasterChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2" /> הוצאה חשבונית</label>
                    <label className="flex items-center"><input type="checkbox" name="receiptIssued" checked={formData.receiptIssued} onChange={handleMasterChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2" /> הוצאה קבלה</label>
                </div>
            </div>

            {/* Section 3: Order Details & Costs */}
            <div className="space-y-6">
                <h3 className="text-xl font-semibold text-slate-800 border-b pb-2">פירוט הזמנה ועלויות</h3>

                <div>
                    <label className="block text-sm font-medium text-slate-700">כותרת הזמנה</label>
                    <input type="text" name="description" value={formData.description} onChange={handleMasterChange} required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                </div>
                
                {/* Line Items */}
                <div>
                    <h4 className="text-lg font-medium text-slate-800 mb-2">פריטי הזמנה</h4>
                    {/* Header Row */}
                    <div className="hidden md:grid text-xs grid-cols-12 gap-2 px-2 text-slate-500 font-semibold">
                        <div className="col-span-3">תיאור</div>
                        <div className="col-span-1">סוג יחידה</div>
                        <div className="col-span-1">רוחב</div>
                        <div className="col-span-1">גובה</div>
                        <div className="col-span-1">כמות</div>
                        <div className="col-span-1">מחיר ליח'</div>
                        <div className="col-span-1">עלות ליח'</div>
                        <div className="col-span-1">סה"כ</div>
                        <div className="col-span-2">ספק</div>
                    </div>
                    <div className="space-y-3">
                        {formData.lineItems.map((item, index) => (
                            <div key={item.id} className="p-3 border rounded-lg bg-slate-50 md:p-0 md:border-none md:bg-transparent md:grid md:grid-cols-12 md:gap-2 md:items-center relative">
                                <button type="button" onClick={() => removeLineItem(index)} className="absolute top-2 left-2 text-red-500 hover:text-red-700 p-1 md:hidden"><DeleteIcon className="h-5 w-5"/></button>
                                
                                <div className="md:col-span-3">
                                    <label className="text-xs font-medium text-slate-500 md:hidden">תיאור</label>
                                    <input type="text" placeholder="תיאור" name="description" value={item.description} onChange={e => handleLineItemChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                </div>
                                
                                <div className="md:col-span-1">
                                    <label className="text-xs font-medium text-slate-500 md:hidden mt-2">סוג יחידה</label>
                                    <select name="unitType" value={item.unitType} onChange={e => handleLineItemChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                        {Object.values(LineItemUnit).map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-x-2 mt-2 md:col-span-8 md:contents">
                                    {item.unitType === LineItemUnit.M2 ? (
                                        <>
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-medium text-slate-500 md:hidden">רוחב</label>
                                                <input type="number" placeholder="רוחב" name="width" value={item.width || ''} onChange={e => handleLineItemChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-medium text-slate-500 md:hidden">גובה</label>
                                                <input type="number" placeholder="גובה" name="height" value={item.height || ''} onChange={e => handleLineItemChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="hidden md:block md:col-span-2"></div>
                                    )}
                                    
                                    <div className="md:col-span-1">
                                        <label className="text-xs font-medium text-slate-500 md:hidden">כמות</label>
                                        <input type="number" placeholder="כמות" name="quantity" value={item.quantity} onChange={e => handleLineItemChange(index, e)} disabled={item.unitType === LineItemUnit.M2} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm disabled:bg-slate-100" />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-xs font-medium text-slate-500 md:hidden">מחיר ליח'</label>
                                        <input type="number" placeholder="מחיר" name="unitPrice" value={item.unitPrice} onChange={e => handleLineItemChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-xs font-medium text-slate-500 md:hidden">עלות ליח'</label>
                                        <input type="number" placeholder="עלות" name="cost" value={item.cost} onChange={e => handleLineItemChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>

                                    {/* Calculated Total Column */}
                                    <div className="md:col-span-1 flex items-center md:flex-col md:justify-center md:items-start mt-1 md:mt-0">
                                        <label className="text-xs font-medium text-slate-500 md:hidden w-20">סה"כ</label>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-semibold text-slate-800">₪{(item.quantity * item.unitPrice).toLocaleString()}</span>
                                            {item.cost > 0 && (
                                                <span className="text-[10px] text-slate-500" title="סה״כ עלות">
                                                    (₪{(item.quantity * item.cost).toLocaleString()})
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="col-span-2 md:col-span-2">
                                        <label className="text-xs font-medium text-slate-500 md:hidden">ספק</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            <select name="supplierId" value={item.supplierId || ''} onChange={e => handleLineItemChange(index, e)} className="flex-grow block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" disabled={!item.cost || item.cost <= 0}>
                                                <option value="">בחר ספק</option>
                                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                            <button type="button" onClick={() => removeLineItem(index)} className="hidden md:block text-red-500 hover:text-red-700 p-1"><DeleteIcon className="h-5 w-5"/></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addLineItem} className="mt-2 text-sm text-primary hover:text-indigo-800">+ הוסף פריט</button>
                </div>

                {/* Additional Services */}
                <div>
                    <h4 className="text-lg font-medium text-slate-800 mb-2">שירותים נוספים (שליח / מתקין)</h4>
                    <div className="space-y-4">
                        {formData.additionalServices.map((service, index) => (
                            <div key={service.id} className="p-4 border border-slate-200 rounded-lg relative bg-slate-50">
                                <button type="button" onClick={() => removeAdditionalService(index)} className="absolute top-2 left-2 text-red-500 hover:text-red-700 p-1 bg-white rounded-full">
                                    <DeleteIcon className="h-4 w-4"/>
                                </button>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-slate-600">תיאור שירות</label>
                                        <input type="text" name="description" value={service.description} onChange={e => handleAdditionalServiceChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600">עלות (עבורנו)</label>
                                        <input type="number" name="cost" value={service.cost} onChange={e => handleAdditionalServiceChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600">מחיר (ללקוח)</label>
                                        <input type="number" name="price" value={service.price} onChange={e => handleAdditionalServiceChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-slate-600">ספק שירות</label>
                                        <div className="flex items-center gap-2">
                                            <select name="supplierId" value={service.supplierId || ''} onChange={e => handleAdditionalServiceChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                                <option value="">בחר ספק שירות</option>
                                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                            <button type="button" onClick={() => { setNewServiceSupplierFor(index); setIsNewSupplierModalOpen(true); }} className="mt-1 p-2 bg-primary text-white rounded-md hover:bg-indigo-700"><PlusIcon className="h-5 w-5"/></button>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-slate-600">כתובת למשלוח/התקנה</label>
                                        <input type="text" name="address" value={service.address || ''} onChange={e => handleAdditionalServiceChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600">איש קשר בשטח</label>
                                        <input type="text" name="siteContactName" value={service.siteContactName || ''} onChange={e => handleAdditionalServiceChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600">פרטי התקשרות</label>
                                        <input type="text" name="siteContactDetails" value={service.siteContactDetails || ''} onChange={e => handleAdditionalServiceChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                    <div className="md:col-span-4">
                                        <label className="block text-xs font-medium text-slate-600">הערות לשירות</label>
                                        <textarea name="notes" value={service.notes || ''} onChange={e => handleAdditionalServiceChange(index, e)} rows={2} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addAdditionalService} className="mt-2 text-sm text-primary hover:text-indigo-800">+ הוסף שירות</button>
                </div>

                {/* Financial Summary Box */}
                <div className={`p-4 rounded-md border-2 transition-colors ${formData.paymentStatus === PaymentStatus.PAID ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-200/50">
                        <h4 className="text-lg font-bold text-slate-800">סיכום עסקה</h4>
                        <div className={`px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 ${formData.paymentStatus === PaymentStatus.PAID ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                            {formData.paymentStatus === PaymentStatus.PAID ? (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                    </svg>
                                    העסקה שולמה
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                    </svg>
                                    טרם שולם - יש לגבות תשלום
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="text-center">
                            <h4 className="text-sm text-slate-500">סה"כ הכנסה</h4>
                            <p className="text-lg font-bold text-green-600">{totals.totalAmount.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="text-center">
                            <h4 className="text-sm text-slate-500">סה"כ עלות</h4>
                            <p className="text-lg font-bold text-red-600">{totals.totalCost.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}</p>
                        </div>
                        <div className="text-center">
                            <h4 className="text-sm text-slate-500">רווח</h4>
                            <p className="text-lg font-bold text-slate-800">{totals.profit.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="text-center">
                            <h4 className="text-sm text-slate-500">מרווח</h4>
                            <p className="text-lg font-bold text-slate-800">{totals.margin.toFixed(1)}%</p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 text-center mt-3 font-medium opacity-75">(המחירים המוצגים אינם כוללים מע"מ)</p>
                </div>
            </div>

            {/* Section 4: Attachments / File Manager */}
             <div className="space-y-6">
                <h3 className="text-xl font-semibold text-slate-800 border-b pb-2">קבצים וגלריה</h3>
                <OrderFileManager 
                    attachments={formData.attachments} 
                    onUpdate={(newAttachments) => setFormData(prev => ({ ...prev, attachments: newAttachments }))} 
                />
            </div>

            {/* Section 5: Management & Documentation */}
            <div className="space-y-6">
                 <h3 className="text-xl font-semibold text-slate-800 border-b pb-2">היסטוריה ופעולות</h3>
                
                {openTasks.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                        <h4 className="text-sm font-bold text-yellow-800 mb-3 flex items-center">
                            <TaskIcon className="h-4 w-4 me-2 text-yellow-600"/>
                            משימות פתוחות ({openTasks.length})
                        </h4>
                        <div className="space-y-3">
                            {openTasks.map(task => {
                                const assigneeName = employees.find(e => e.id === task.assigneeId)?.name;
                                const timeDiff = task.dueDate ? getTimeDiffText(task.dueDate, !!task.isCompleted) : null;
                                return (
                                    <div key={task.id} className="flex items-start gap-3 bg-white p-3 rounded border border-yellow-100 shadow-sm">
                                        <input type="checkbox" checked={task.isCompleted} onChange={() => handleToggleTaskComplete(task.id, !!task.isCompleted)} className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary mt-0.5 cursor-pointer" title="סמן כהושלם" />
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-slate-800">{task.content}</p>
                                            <div className="mt-1 text-xs flex flex-col gap-1">
                                                <div className="text-slate-500">
                                                    נוצר ע"י {task.user} ב-{task.timestamp.toLocaleString('he-IL')}
                                                    {assigneeName && <span className="mx-1 text-slate-400">-></span>}
                                                    {assigneeName && <span>שוייך ל: <strong>{assigneeName}</strong></span>}
                                                </div>
                                                {task.dueDate && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-slate-600">יעד: <strong>{new Date(task.dueDate).toLocaleDateString('he-IL')}</strong></span>
                                                        {timeDiff && !task.isCompleted && <span className={`${timeDiff.color}`}>{timeDiff.text}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex items-center border-b border-slate-200 mb-3">
                        <button type="button" onClick={() => setNewTimelineEntry(prev => ({ ...prev, type: 'NOTE' }))} className={`px-4 py-2 text-sm font-medium ${newTimelineEntry.type === 'NOTE' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}>הוסף הערה</button>
                         <button type="button" onClick={() => setNewTimelineEntry(prev => ({ ...prev, type: 'TASK' }))} className={`px-4 py-2 text-sm font-medium ${newTimelineEntry.type === 'TASK' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}>הוסף משימה</button>
                    </div>
                    <textarea value={newTimelineEntry.content} onChange={e => setNewTimelineEntry(prev => ({ ...prev, content: e.target.value }))} rows={3} placeholder={newTimelineEntry.type === 'NOTE' ? 'רשום עדכון...' : 'תיאור המשימה...'} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                    {newTimelineEntry.type === 'TASK' && (
                        <div className="grid grid-cols-2 gap-4 mt-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600">שייך ל</label>
                                <select value={newTimelineEntry.assigneeId} onChange={e => setNewTimelineEntry(prev => ({...prev, assigneeId: e.target.value}))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                    <option value="">בחר עובד (ריק = אני)</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600">תאריך יעד</label>
                                <input type="date" value={newTimelineEntry.dueDate} onChange={e => setNewTimelineEntry(prev => ({...prev, dueDate: e.target.value}))} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end mt-3">
                        <button type="button" onClick={handleAddTimelineEvent} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 text-sm font-semibold">הוסף</button>
                    </div>
                </div>

                <div>
                     <div className="flex gap-2 mb-3 justify-end">
                        <button type="button" onClick={() => setTimelineFilter('ALL')} className={`px-3 py-1 text-xs rounded-full border transition-colors ${timelineFilter === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>הכל</button>
                        <button type="button" onClick={() => setTimelineFilter('HUMAN')} className={`px-3 py-1 text-xs rounded-full border transition-colors ${timelineFilter === 'HUMAN' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>הערות ומשימות</button>
                         <button type="button" onClick={() => setTimelineFilter('SYSTEM')} className={`px-3 py-1 text-xs rounded-full border transition-colors ${timelineFilter === 'SYSTEM' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>יומן מערכת</button>
                    </div>
                    
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                        {filteredTimeline.sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()).map(event => {
                            const getTimelineIcon = () => {
                                switch (event.type) {
                                    case 'NOTE': return <NoteIcon className="h-5 w-5 text-slate-500" />;
                                    case 'TASK': return <TaskIcon className={`h-5 w-5 ${event.isCompleted ? 'text-green-500' : 'text-blue-500'}`} />;
                                    case 'LOG': return <LogIcon className="h-5 w-5 text-gray-500" />;
                                    default: return null;
                                }
                            };
                            const assigneeName = employees.find(e => e.id === event.assigneeId)?.name;
                            const timeDiff = (event.type === 'TASK' && !event.isCompleted && event.dueDate) ? getTimeDiffText(event.dueDate, false) : null;

                            return (
                                <div key={event.id} className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                        {getTimelineIcon()}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm">
                                            <span className="font-semibold text-slate-800">{event.user}</span>
                                            <span className="text-xs text-slate-500 ms-2">{event.timestamp.toLocaleString('he-IL')}</span>
                                        </div>
                                        <div className={`mt-1 text-sm text-slate-700 ${event.type === 'TASK' && event.isCompleted ? 'opacity-80' : ''}`}>
                                            {event.type === 'TASK' ? (
                                                <div className="flex items-start gap-2 bg-slate-50 p-2 rounded border border-slate-200 mt-1">
                                                    <input type="checkbox" checked={event.isCompleted} onChange={() => handleToggleTaskComplete(event.id, !!event.isCompleted)} className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary mt-0.5 cursor-pointer" />
                                                    <div className="flex-1">
                                                        <p className={`font-medium ${event.isCompleted ? 'line-through text-slate-500' : 'text-slate-800'}`}>{event.content}</p>
                                                        <div className="mt-2 text-xs flex flex-col gap-1 border-t border-slate-200 pt-2">
                                                            <div className="text-slate-500 flex flex-wrap items-center gap-1">
                                                                <span>נוצר ע"י {event.user}</span>
                                                                {assigneeName && (
                                                                    <>
                                                                        <span>&rarr;</span>
                                                                        <span className="bg-indigo-50 text-indigo-700 px-1.5 rounded">שוייך ל: {assigneeName}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {event.dueDate && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-slate-600">יעד: <strong>{new Date(event.dueDate).toLocaleDateString('he-IL')}</strong></span>
                                                                    {timeDiff && !event.isCompleted && <span className={`${timeDiff.color}`}>{timeDiff.text}</span>}
                                                                </div>
                                                            )}
                                                            {event.isCompleted && event.completedAt && (
                                                                <div className="text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100 inline-block w-fit mt-1">
                                                                    <strong>בוצע בפועל</strong> ע"י {event.completedBy || 'משתמש'} ב-{new Date(event.completedAt).toLocaleString('he-IL')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p>{event.content}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        {filteredTimeline.length === 0 && (
                            <p className="text-center text-slate-400 text-sm py-4">לא נמצאו רשומות בסינון זה.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 mt-6 border-t">
                {isEditMode && (formData.type === OrderType.REGULAR || !formData.type) && (
                    <button type="button" onClick={handleCreateServiceCall} className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 flex items-center gap-2 text-sm font-medium">
                        <SettingsIcon className="w-4 h-4" />
                        פתח קריאת שירות
                    </button>
                )}
                {(!isEditMode || formData.type === OrderType.SERVICE_CALL) ? <div></div> : null}

                <div className="flex space-x-2 space-x-reverse">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור הזמנה</button>
                </div>
            </div>
        </form>
    );
};

const OrdersPage: React.FC<OrdersPageProps> = ({ orders, setOrders, customers, setCustomers, suppliers, setSuppliers, employees, addActivity, initialOpenOrderId, onOrderOpened, statusConfigs, getNextOrderNumber, vatRate }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Advanced filter states
    const [customerFilter, setCustomerFilter] = useState<string[]>([]);
    const [supplierFilter, setSupplierFilter] = useState<string[]>([]);
    const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatus[]>([]);
    const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatus[]>([]);
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [yearFilter, setYearFilter] = useState<string>('all');
    
    const [isCollectionMode, setIsCollectionMode] = useState(false);

    // Options for multi-select components
    const customerOptions = useMemo(() => customers.map(c => ({ value: c.id, label: c.name })), [customers]);
    const supplierOptions = useMemo(() => suppliers.map(s => ({ value: s.id, label: s.name })), [suppliers]);
    const orderStatusOptions = useMemo(() => (statusConfigs || []).map(s => ({ value: s.label, label: s.label })), [statusConfigs]);
    const paymentStatusOptions = useMemo(() => PAYMENT_STATUSES_ORDERED.map(s => ({ value: s, label: s })), []);

    const availableYears = useMemo(() => {
        const years = new Set(orders.map(o => new Date(o.date).getFullYear()));
        return Array.from(years).sort((a: number, b: number) => b - a);
    }, [orders]);
    
    const availableMonths = [
        { value: 1, name: 'ינואר' }, { value: 2, name: 'פברואר' }, { value: 3, name: 'מרץ' },
        { value: 4, name: 'אפריל' }, { value: 5, name: 'מאי' }, { value: 6, name: 'יוני' },
        { value: 7, name: 'יולי' }, { value: 8, name: 'אוגוסט' }, { value: 9, name: 'ספטמבר' },
        { value: 10, name: 'אוקטובר' }, { value: 11, name: 'נובמבר' }, { value: 12, name: 'דצמבר' },
    ];

    const handleAddOrder = () => {
        setEditingOrder(null);
        setIsModalOpen(true);
    };

    const handleEditOrder = (order: Order) => {
        setEditingOrder(order);
        setIsModalOpen(true);
    };

    const handleStatusChange = (orderId: string, newStatus: string) => {
        setOrders(prevOrders => {
            const orderIndex = prevOrders.findIndex(o => o.id === orderId);
            if (orderIndex === -1) return prevOrders;
            
            const originalOrder = prevOrders[orderIndex];
            if (originalOrder.orderStatus === newStatus) return prevOrders;

            const user = employees.find(emp => emp.id === originalOrder.employeeId)?.name || 'מערכת';
            
            const config = statusConfigs.find(c => c.label === newStatus);
            const isNowActiveDeal = config ? config.isActiveDeal : false;

            let newDealStartDate = originalOrder.dealStartDate;
            if (isNowActiveDeal && !newDealStartDate) {
                newDealStartDate = new Date();
            }

            const logEvent: TimelineEvent = {
                id: `log_${Date.now()}`,
                timestamp: new Date(),
                content: `סטטוס הזמנה שונה מ"${originalOrder.orderStatus}" ל-"${newStatus}"`,
                user: user,
                type: 'LOG'
            };

            const newStatusHistoryEntry = { status: newStatus, startDate: new Date() };

            const updatedOrder: Order = {
                ...originalOrder,
                orderStatus: newStatus,
                dealStartDate: newDealStartDate, 
                timeline: [logEvent, ...originalOrder.timeline],
                statusHistory: [...(originalOrder.statusHistory || []), newStatusHistoryEntry],
            };

            const newOrders = [...prevOrders];
            newOrders[orderIndex] = updatedOrder;
            
            addActivity(`סטטוס הזמנה ${originalOrder.orderNumber} שונה ל: ${newStatus}`);
            
            return newOrders;
        });
    };

    useEffect(() => {
        if (initialOpenOrderId) {
            const orderToOpen = orders.find(o => o.id === initialOpenOrderId);
            if (orderToOpen) {
                handleEditOrder(orderToOpen);
            }
            if (onOrderOpened) {
                onOrderOpened();
            }
        }
    }, [initialOpenOrderId, orders, onOrderOpened]);

    const handleSaveOrder = (order: Order, keepOpen: boolean = false) => {
        setOrders(prevOrders => {
            const exists = prevOrders.some(o => o.id === order.id);
            if (exists) {
                addActivity(`הזמנה עודכנה: ${order.description}`);
                return prevOrders.map(o => o.id === order.id ? order : o);
            } else {
                addActivity(`הזמנה חדשה נוספה: ${order.description}`);
                return [order, ...prevOrders];
            }
        });
        
        if (keepOpen) {
            setEditingOrder(order);
        } else {
            setIsModalOpen(false);
            setEditingOrder(null);
        }
    };

    const getCustomerName = (customerId?: string) => {
        if (!customerId) return '—';
        return customers.find(c => c.id === customerId)?.name || 'לא זמין';
    };

    const getStatusBadge = (status: string) => {
        const config = statusConfigs.find(c => c.label === status);
        return config ? config.color : 'bg-slate-100 text-slate-800';
    };

    const calculateStatusDuration = (order: Order): string | null => {
        if (!order.statusHistory || order.statusHistory.length === 0) return null;
        const currentStatusEntry = order.statusHistory
            .filter(h => h.status === order.orderStatus)
            .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];

        if (!currentStatusEntry) return null;
        
        const config = statusConfigs.find(c => c.label === order.orderStatus);
        if (config && !config.isActiveDeal) return null;

        const diffTime = Math.abs(new Date().getTime() - new Date(currentStatusEntry.startDate).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) return `יום 1`;
        return `${diffDays} ימים`;
    };

    const filteredOrders = useMemo(() => {
        let result = orders;

        if (isCollectionMode) {
             result = result.filter(order => order.paymentStatus === PaymentStatus.UNPAID);
        } else {
             result = result.filter(order => {
                if (paymentStatusFilter.length === 0) return true;
                return paymentStatusFilter.includes(order.paymentStatus);
            });
        }
        
        result = result
            .filter(order => {
                if (orderStatusFilter.length === 0) return true;
                return orderStatusFilter.includes(order.orderStatus as OrderStatus);
            })
            .filter(order => {
                if (customerFilter.length === 0) return true;
                return customerFilter.includes(order.customerId || '');
            })
            .filter(order => {
                if (supplierFilter.length === 0) return true;
                const supplierIdsInOrder = new Set<string>();
                if (order.supplierId) supplierIdsInOrder.add(order.supplierId);
                order.lineItems.forEach(li => li.supplierId && supplierIdsInOrder.add(li.supplierId));
                order.additionalServices.forEach(s => s.supplierId && supplierIdsInOrder.add(s.supplierId));
                return supplierFilter.some(sId => supplierIdsInOrder.has(sId));
            })
            .filter(order => {
                const orderDate = new Date(order.date);
                if (monthFilter !== 'all' && (orderDate.getMonth() + 1) !== parseInt(monthFilter)) return false;
                if (yearFilter !== 'all' && orderDate.getFullYear() !== parseInt(yearFilter)) return false;
                return true;
            })
            .filter(order => {
                if (!searchTerm) return true;
                const lowercasedTerm = searchTerm.toLowerCase();
                const customerName = getCustomerName(order.customerId).toLowerCase();
                
                const isServiceSearch = (lowercasedTerm.includes('שירות') || lowercasedTerm.includes('תיקון') || lowercasedTerm.includes('service')) && order.type === OrderType.SERVICE_CALL;
                
                const parentOrderMatch = order.parentOrderId 
                    ? orders.find(o => o.id === order.parentOrderId)?.orderNumber.toLowerCase().includes(lowercasedTerm)
                    : false;

                return (
                    order.orderNumber.toLowerCase().includes(lowercasedTerm) ||
                    order.description.toLowerCase().includes(lowercasedTerm) ||
                    customerName.includes(lowercasedTerm) ||
                    isServiceSearch ||
                    parentOrderMatch
                );
            });

        if (isCollectionMode) {
            result.sort((a, b) => {
                 const dateA = calculateDueDate(a.date, a.paymentTerms);
                 const dateB = calculateDueDate(b.date, b.paymentTerms);
                 return dateA.getTime() - dateB.getTime();
            });
        } else {
             result.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        return result;

    }, [orders, orderStatusFilter, paymentStatusFilter, customerFilter, supplierFilter, monthFilter, yearFilter, searchTerm, isCollectionMode]);

    const summaryTotals = useMemo(() => {
        return filteredOrders.reduce((acc, order) => {
            const { totalAmount, profit } = calculateOrderTotals(order);
            acc.totalAmount += totalAmount;
            acc.totalProfit += profit;
            const statusConfig = statusConfigs.find(c => c.label === order.orderStatus);
            const isActiveDeal = statusConfig ? statusConfig.isActiveDeal : true; 

            if (isActiveDeal) {
                const balance = order.paymentStatus === PaymentStatus.PAID ? 0 : totalAmount;
                acc.totalBalance += balance;
            }
            return acc;
        }, { totalAmount: 0, totalProfit: 0, totalBalance: 0 });
    }, [filteredOrders, statusConfigs]);
    
    return (
        <div>
            <div className="flex justify-between items-start mb-6 gap-4">
                 <div className="flex-grow bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-start">
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                            {/* Filters */}
                            <div>
                            <MultiSelectFilter label="לקוח" options={customerOptions} selectedValues={customerFilter} onChange={setCustomerFilter} />
                            </div>
                            <div>
                                <MultiSelectFilter label="ספק" options={supplierOptions} selectedValues={supplierFilter} onChange={setSupplierFilter} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">חודש</label>
                                <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-full text-sm p-2 border-slate-300 rounded-md focus:ring-primary focus:border-primary">
                                    <option value="all">כל החודשים</option>
                                    {availableMonths.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">שנה</label>
                                <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="w-full text-sm p-2 border-slate-300 rounded-md focus:ring-primary focus:border-primary">
                                    <option value="all">כל השנים</option>
                                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <div>
                            <MultiSelectFilter label="סטטוס הזמנה" options={orderStatusOptions} selectedValues={orderStatusFilter} onChange={(selected) => setOrderStatusFilter(selected as OrderStatus[])} />
                            </div>
                            <div>
                            <MultiSelectFilter label="סטטוס תשלום" options={paymentStatusOptions} selectedValues={paymentStatusFilter} onChange={(selected) => setPaymentStatusFilter(selected as PaymentStatus[])} />
                            </div>
                            <div className="lg:col-span-1">
                                <label className="block text-xs font-medium text-slate-600 mb-1">חיפוש חופשי</label>
                                <input type="text" placeholder="מספר, לקוח, תיאור..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full text-sm p-2 border-slate-300 rounded-md focus:ring-primary focus:border-primary" />
                            </div>
                        </div>

                         <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
                             <button onClick={() => setIsCollectionMode(!isCollectionMode)} className={`flex items-center px-4 py-2 rounded-md text-sm font-bold transition-colors shadow-sm ${isCollectionMode ? 'bg-red-600 text-white ring-2 ring-red-300' : 'bg-white text-slate-600 border border-slate-300 hover:bg-red-50 hover:text-red-600'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 me-2">
                                    <path fillRule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm12 4a3 3 0 11-6 0 3 3 0 016 0zM4 9a1 1 0 100-2 1 1 0 000 2zm13-1a1 1 0 11-2 0 1 1 0 012 0zM1.75 14.5a.75.75 0 000 1.5c4.417 0 8.693.603 12.749 1.73 1.111.309 2.251-.512 2.251-1.696v-.784a.75.75 0 00-1.5 0v.784a2.718 2.718 0 01-.529.134c-4.303 1.256-8.99 1.582-13.676.832H1.75z" clipRule="evenodd" />
                                </svg>
                                {isCollectionMode ? 'יציאה ממצב גבייה' : 'מצב גבייה (חובות)'}
                             </button>
                             {isCollectionMode && <span className="text-sm text-slate-500 animate-pulse">מציג רק הזמנות לתשלום לפי סדר דחיפות</span>}
                        </div>
                    </div>
                </div>

                <button onClick={handleAddOrder} className="flex-shrink-0 flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors h-fit mt-5">
                    <PlusIcon className="h-5 w-5 me-2" />
                    הוסף הזמנה
                </button>
            </div>

            <div className="bg-white shadow-md rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 text-start">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider"># הזמנה</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תיאור</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">לקוח</th>
                             <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סכום</th>
                             <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">יתרה לתשלום</th>
                             <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">רווח</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תאריך הזמנה</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider bg-yellow-50/50">מועד תשלום</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סטטוס</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תשלום</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {filteredOrders.map(order => {
                            const { totalAmount, profit, margin } = calculateOrderTotals(order);
                            const durationText = calculateStatusDuration(order);
                            const customer = customers.find(c => c.id === order.customerId);
                            const primaryContact = customer?.contacts.find(c => c.isBillingContact) || customer?.contacts[0];
                            const profitColorClass = getProfitMarginColor(margin);
                            
                            const statusConfig = statusConfigs.find(c => c.label === order.orderStatus);
                            const isActiveDeal = statusConfig ? statusConfig.isActiveDeal : true;

                            const balanceDue = isActiveDeal ? (order.paymentStatus === PaymentStatus.PAID ? 0 : totalAmount) : 0;
                            
                            const dueDate = calculateDueDate(order.date, order.paymentTerms);
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            const dueDateTime = dueDate.getTime();
                            const todayTime = today.getTime();
                            const isOverdue = isActiveDeal && order.paymentStatus === PaymentStatus.UNPAID && dueDateTime < todayTime;
                            
                            const diffTime = Math.abs(todayTime - dueDateTime);
                            const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));


                            let whatsappUrl = '';
                            let mailtoUrl = '';
                            let telUrl = '';

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
                            return (
                                <tr key={order.id} className={`hover:bg-slate-50 ${order.type === OrderType.SERVICE_CALL ? 'bg-red-50/50' : ''}`}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                                        <button onClick={() => handleEditOrder(order)} className="text-primary hover:underline font-semibold">{order.orderNumber}</button>
                                        {order.type === OrderType.SERVICE_CALL && <span className="block text-[10px] text-red-600 font-bold">תיקון</span>}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                                        {order.description}
                                        {order.parentOrderId && <div className="text-xs text-slate-400">מקושר להזמנת אב</div>}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                                        <div className="flex items-center gap-2">
                                            <span>{getCustomerName(order.customerId)}</span>
                                            {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" title={`שלח וואטסאפ ל-${primaryContact?.phone}`} className="text-green-500 hover:text-green-700"><WhatsAppIcon className="h-5 w-5"/></a>}
                                            {mailtoUrl && <a href={mailtoUrl} title={`שלח אימייל ל-${primaryContact?.email}`} className="text-slate-500 hover:text-primary"><EmailIcon className="h-5 w-5"/></a>}
                                            {telUrl && <a href={telUrl} title={`התקשר ל-${primaryContact?.phone}`} className="text-slate-500 hover:text-primary"><PhoneIcon className="h-5 w-5"/></a>}
                                        </div>
                                    </td>
                                    <td className='px-4 py-4 whitespace-nowrap text-sm font-semibold text-green-600'>
                                        <div>{totalAmount.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                        <div className="text-[10px] text-slate-400 font-normal">
                                            ({(totalAmount * (1 + vatRate / 100)).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })} כולל מע"מ)
                                        </div>
                                        {!isActiveDeal && <span className="text-[10px] text-slate-400 block">(צפוי)</span>}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-red-600">
                                        {balanceDue > 0 ? (
                                            <>
                                                <div>{balanceDue.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                                <div className="text-[10px] text-red-400 font-normal">
                                                    ({(balanceDue * (1 + vatRate / 100)).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })} כולל מע"מ)
                                                </div>
                                            </>
                                        ) : <span className="text-slate-300">-</span>}
                                    </td>
                                     <td className={`px-4 py-4 whitespace-nowrap text-sm font-semibold text-center ${profitColorClass}`}>
                                        <div>{profit.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                        <div className="text-xs font-normal opacity-80">({margin.toFixed(1)}%)</div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">{new Date(order.date).toLocaleDateString('he-IL')}</td>
                                    
                                    <td className="px-4 py-4 whitespace-nowrap text-sm bg-yellow-50/30">
                                        <div className="flex flex-col">
                                            <span className={`${isOverdue ? 'text-red-700 font-bold' : 'text-slate-600'}`}>
                                                {dueDate.toLocaleDateString('he-IL')}
                                            </span>
                                            {isOverdue && <span className="text-[10px] bg-red-100 text-red-800 px-1 py-0.5 rounded w-fit mt-1 animate-pulse">{overdueDays} ימים באיחור</span>}
                                            {!isOverdue && order.paymentStatus === PaymentStatus.UNPAID && isActiveDeal && <span className="text-[10px] text-slate-400 mt-1">({order.paymentTerms})</span>}
                                        </div>
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <div className="relative">
                                            <select value={order.orderStatus} onChange={(e) => handleStatusChange(order.id, e.target.value)} className={`appearance-none w-full cursor-pointer px-2 py-1 text-xs leading-5 font-semibold rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary text-center ${getStatusBadge(order.orderStatus as string)}`} aria-label={`שנה סטטוס עבור הזמנה ${order.orderNumber}`}>
                                                {statusConfigs.sort((a,b) => a.orderIndex - b.orderIndex).map(config => (
                                                    <option key={config.id} value={config.label}>{config.label}</option>
                                                ))}
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-1 text-inherit">
                                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                                            </div>
                                            {durationText && <p className="text-xs text-slate-500 mt-1 text-center">({durationText})</p>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${order.paymentStatus === PaymentStatus.PAID ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {order.paymentStatus}
                                        </span>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-semibold border-t-2 border-slate-300 sticky bottom-0 z-10">
                        <tr>
                            <td className="px-4 py-3 text-end align-top" colSpan={3}>סה"כ</td>
                            <td className="px-4 py-3 text-start text-green-700 align-top">
                                <div>{summaryTotals.totalAmount.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                <div className="text-[10px] text-slate-500 font-normal">
                                    ({(summaryTotals.totalAmount * (1 + vatRate / 100)).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })} כולל מע"מ)
                                </div>
                            </td>
                            <td className="px-4 py-3 text-start text-red-700 font-bold align-top">
                                <div>{summaryTotals.totalBalance.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                <div className="text-[10px] text-red-500 font-normal">
                                    ({(summaryTotals.totalBalance * (1 + vatRate / 100)).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })} כולל מע"מ)
                                </div>
                            </td>
                            <td className="px-4 py-3 text-start text-slate-800 align-top">
                                <div>{summaryTotals.totalProfit.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                <div className="text-[10px] text-slate-500 font-normal">
                                    ({(summaryTotals.totalProfit * (1 + vatRate / 100)).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 })} כולל מע"מ)
                                </div>
                            </td>
                            <td colSpan={3}></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {isModalOpen && (
                <Modal 
                    title={editingOrder ? `עריכת הזמנה ${editingOrder.orderNumber}` : `הוספת הזמנה חדשה (${getNextOrderNumber()})`}
                    onClose={() => setIsModalOpen(false)}
                    size="5xl"
                >
                    <OrderForm 
                        key={editingOrder ? editingOrder.id : 'new'} 
                        order={editingOrder}
                        customers={customers}
                        setCustomers={setCustomers}
                        suppliers={suppliers}
                        setSuppliers={setSuppliers}
                        employees={employees}
                        onSave={handleSaveOrder} 
                        onCancel={() => setIsModalOpen(false)} 
                        addActivity={addActivity}
                        allOrders={orders}
                        onSwitchOrder={(id) => {
                            const target = orders.find(o => o.id === id);
                            if (target) handleEditOrder(target);
                        }}
                        statusConfigs={statusConfigs}
                        getNextOrderNumber={getNextOrderNumber}
                    />
                </Modal>
            )}
        </div>
    );
};

export default OrdersPage;
