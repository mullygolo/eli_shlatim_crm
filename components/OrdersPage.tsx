import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Order, Customer, Supplier, Employee, PaymentStatus, LineItem, LineItemUnit, Attachment, Contact, PaymentMethod, AdditionalService, TimelineEvent, AttachmentCategory, OrderType, OrderStatusConfiguration, CustomerPayment, FieldChange, SalesHistoryEntry, AdHocProduct, PriceListProduct } from '../types';
import { PAYMENT_STATUSES_ORDERED, PAYMENT_TERMS_OPTIONS, CUSTOMER_CATEGORIES } from '../constants';
import { PlusIcon, EditIcon, DeleteIcon, WhatsAppIcon, EmailIcon, PhoneIcon, NoteIcon, TaskIcon, LogIcon, SettingsIcon, LockIcon, CashIcon, DownloadIcon } from './icons';
import Modal from './Modal';
import ProductSelectorModal from './ProductSelectorModal';
import { calculateOrderTotals, calculateDueDate } from '../utils/calculations';
import MultiSelectFilter from './MultiSelectFilter';
import * as mongoService from '../services/mongoService';
import { getProducts } from '../services/priceListService';
import { addSalesHistoryEntry, createAdHocProduct } from '../services/priceListService';
import { calculateProductPrice } from '../utils/priceCalculations';

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

const getProfitMarginColor = (markup: number): string => {
    if (markup <= 10) return 'text-red-600';
    if (markup <= 25) return 'text-orange-500';
    if (markup <= 60) return 'text-green-600';
    return 'text-emerald-600';
};

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

const PaymentDocumentsViewer: React.FC<{
    files: Attachment[];
    onClose: () => void;
}> = ({ files, onClose }) => {
    const [selectedFile, setSelectedFile] = useState<Attachment | undefined>(undefined);

    useEffect(() => {
        if (files && files.length > 0) {
            setSelectedFile(files[0]);
        } else {
            setSelectedFile(undefined);
        }
    }, [files]);

    if (!files || files.length === 0 || !selectedFile) return null;

    const isImage = (file: Attachment) => file.type.startsWith('image/');
    const isPdf = (file: Attachment) => file.type === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');

    return (
        <Modal title="מסמכי תשלום וצילום צ'קים" onClose={onClose} size="4xl" zIndex={60}>
            <div className="flex flex-col md:flex-row h-[70vh] gap-4">
                <div className="md:w-1/4 flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto p-2 bg-slate-50 border-l border-slate-200 order-2 md:order-1">
                    {files.map((file) => (
                        <button
                            type="button"
                            key={file.id}
                            onClick={() => setSelectedFile(file)}
                            className={`p-1 border-2 rounded-lg transition-all relative overflow-hidden h-24 shrink-0 md:w-full ${
                                selectedFile.id === file.id ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            {isImage(file) ? (
                                <img src={file.dataUrl} alt={file.fileName} className="w-full h-full object-cover rounded" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-white text-slate-500">
                                    <span className="text-xs font-bold break-all p-1">{file.fileName.split('.').pop()?.toUpperCase()}</span>
                                </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] truncate px-1 py-0.5">
                                {file.fileName}
                            </div>
                        </button>
                    ))}
                </div>

                <div className="md:w-3/4 bg-slate-800 rounded-lg flex flex-col order-1 md:order-2">
                    <div className="flex-1 overflow-hidden relative flex items-center justify-center p-4">
                        {isImage(selectedFile) ? (
                            <img src={selectedFile.dataUrl} alt={selectedFile.fileName} className="max-w-full max-h-full object-contain shadow-lg" />
                        ) : isPdf(selectedFile) ? (
                            <iframe src={selectedFile.dataUrl} className="w-full h-full border-none rounded bg-white" title="PDF Preview" />
                        ) : (
                            <div className="text-white text-center">
                                <p className="mb-4">לא ניתן להציג קובץ זה בתצוגה מקדימה.</p>
                            </div>
                        )}
                    </div>
                    <div className="h-14 bg-slate-900 border-t border-slate-700 flex justify-between items-center px-4 shrink-0 rounded-b-lg">
                        <span className="text-white text-sm font-medium truncate max-w-[50%]">{selectedFile.fileName}</span>
                        <a 
                            href={selectedFile.dataUrl} 
                            download={selectedFile.fileName} 
                            className="flex items-center gap-2 bg-primary hover:bg-indigo-600 text-white px-4 py-1.5 rounded text-sm transition-colors"
                        >
                            <DownloadIcon className="w-4 h-4"/>
                            הורד קובץ
                        </a>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const SmartCustomerSearch: React.FC<{
    customers: Customer[];
    selectedCustomerId: string;
    onSelect: (customerId: string) => void;
}> = ({ customers, selectedCustomerId, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const c = customers.find(c => c.id === selectedCustomerId);
        if (c) {
             setSearchTerm(c.name);
        } else if (!selectedCustomerId) {
             setSearchTerm('');
        }
    }, [selectedCustomerId, customers]);

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
            {isOpen && (
                <ul className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-slate-200">
                    {filteredCustomers.length === 0 ? (
                        <li className="text-gray-500 select-none relative py-2 pl-3 pr-9 text-center">לא נמצאו תוצאות</li>
                    ) : (
                        filteredCustomers.map(customer => {
                            let matchLabel = '';
                            const lowerTerm = searchTerm.toLowerCase();
                            const matchedContact = customer.contacts.find(c => 
                                c.name.toLowerCase().includes(lowerTerm) ||
                                c.email.toLowerCase().includes(lowerTerm) ||
                                c.phone.toLowerCase().includes(lowerTerm)
                            );

                            if (matchedContact && searchTerm) {
                                matchLabel = `איש קשר: ${matchedContact.name} (${matchedContact.phone || matchedContact.email})`;
                            } else {
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

            <div className="p-4 min-h-[200px]">
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

                {filteredAttachments.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 text-sm">
                        לא נמצאו קבצים בקטגוריה זו.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {filteredAttachments.map(att => {
                            const isPdf = att.type === 'application/pdf' || att.fileName.toLowerCase().endsWith('.pdf');
                            const isVideo = att.type.startsWith('video/');
                            const isPreviewable = att.type.startsWith('image/') || isPdf || isVideo;
                            const categoryLabel = CATEGORY_LABELS[att.category || 'GENERAL'];
                            
                            return (
                                <div key={att.id} className="group relative bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">
                                    <div 
                                        className={`h-28 bg-slate-100 flex items-center justify-center overflow-hidden relative ${isPreviewable ? 'cursor-pointer' : ''}`} 
                                        onClick={() => isPreviewable && setPreviewFile(att)}
                                    >
                                        {renderFileIcon(att)}
                                        <div className="absolute top-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                                            {categoryLabel}
                                        </div>
                                    </div>
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
    onDraftCreate: (order: Order) => void;
    onCancel: () => void;
    addActivity: (description: string) => void;
    allOrders?: Order[]; 
    onSwitchOrder: (orderId: string) => void; 
    statusConfigs: OrderStatusConfiguration[];
    getNextOrderNumber: () => string;
    vatRate: number;
}> = ({ order, customers, setCustomers, suppliers, setSuppliers, employees, onSave, onDraftCreate, onCancel, addActivity, allOrders = [], onSwitchOrder, statusConfigs, getNextOrderNumber, vatRate }) => {
    
    // Find Dynamic Initial Status
    const initialStatus = useMemo(() => statusConfigs.find(c => c.isLead)?.label || 'ליד חדש', [statusConfigs]);

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
        ? { ...order, type: order.type || OrderType.REGULAR, payments: order.payments || [], vatRate: order.vatRate ?? vatRate }
        : {
            description: '',
            type: OrderType.REGULAR,
            date: new Date(),
            createdAt: new Date(), 
            dealStartDate: undefined,
            customerId: order ? order['customerId'] : '', 
            contactId: '',
            employeeId: employees.length > 0 ? employees[0].id : '',
            orderStatus: initialStatus,
            paymentStatus: PaymentStatus.UNPAID,
            payments: [], 
            lineItems: [{ id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, cost: 0, unitType: LineItemUnit.UNIT }],
            paymentTerms: 'שוטף 30',
            invoiceIssued: false,
            receiptIssued: false,
            additionalServices: [],
            attachments: [],
            timeline: [],
            statusHistory: [],
            vatRate: vatRate, // Initialize with system default
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
    const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
    const [productSelectorFor, setProductSelectorFor] = useState<{ type: 'lineItem' | 'additionalService'; index: number } | null>(null);
     const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'HUMAN' | 'SYSTEM'>('HUMAN');
     const [newTimelineEntry, setNewTimelineEntry] = useState({
        type: 'NOTE' as 'NOTE' | 'TASK',
        content: '',
        assigneeId: '',
        dueDate: new Date().toISOString().split('T')[0], 
    });

    const [isAddingPayment, setIsAddingPayment] = useState(false);
    const [paymentIdToDelete, setPaymentIdToDelete] = useState<string | null>(null); 
    const [newPaymentData, setNewPaymentData] = useState<Partial<CustomerPayment>>({
        amount: 0,
        date: new Date(),
        method: PaymentMethod.BANK_TRANSFER,
        reference: '',
        repaymentDate: undefined
    });
    const [newPaymentAttachments, setNewPaymentAttachments] = useState<Attachment[]>([]);
    const [viewingPaymentDocuments, setViewingPaymentDocuments] = useState<Attachment[] | null>(null);

    useEffect(() => {
        if (order) {
            setFormData({ ...order, type: order.type || OrderType.REGULAR, payments: order.payments || [], vatRate: order.vatRate ?? vatRate });
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

    // Use order-specific VAT rate for all calculations in the form
    const effectiveVatRate = formData.vatRate ?? vatRate;

    const totals = useMemo(() => calculateOrderTotals(formData), [formData]);
    const totalDueWithVat = useMemo(() => totals.totalAmount * (1 + effectiveVatRate / 100), [totals.totalAmount, effectiveVatRate]);
    const totalPaid = totals.totalPaid;
    const balanceDue = totalDueWithVat - totalPaid;

    const derivedPaymentStatus = useMemo(() => {
        if (totalPaid <= 0) return PaymentStatus.UNPAID;
        if (totalPaid >= totalDueWithVat - 1) return PaymentStatus.PAID; 
        return PaymentStatus.PARTIALLY_PAID;
    }, [totalPaid, totalDueWithVat]);

    useEffect(() => {
        if (formData.paymentStatus !== derivedPaymentStatus) {
            setFormData(prev => ({ ...prev, paymentStatus: derivedPaymentStatus }));
        }
    }, [derivedPaymentStatus, formData.paymentStatus]); 

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
             setFormData(prev => ({ ...prev, [name]: name === 'vatRate' ? (parseFloat(value) || 0) : value }));
        }
        if (name === 'date') {
            setDateString(value);
        }
        if (name === 'dealStartDate') {
             setDealStartDateString(value);
        }
    };

    const handlePaymentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files: File[] = Array.from(e.target.files);
            const filePromises = files.map(file => {
                return new Promise<Attachment>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (event.target?.result) {
                            resolve({
                                id: `pay_att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                fileName: file.name,
                                dataUrl: event.target.result as string,
                                type: file.type,
                                category: 'DOCUMENTS'
                            });
                        }
                    };
                    reader.readAsDataURL(file);
                });
            });
            Promise.all(filePromises).then(attachments => {
                setNewPaymentAttachments(prev => [...prev, ...attachments]);
            });
        }
        e.target.value = ''; 
    };

    const removePaymentAttachment = (id: string) => {
        const attachment = newPaymentAttachments.find(att => att.id === id);
        const fileName = attachment?.fileName || 'קובץ';
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את הקובץ "${fileName}"?`)) {
            return;
        }
        setNewPaymentAttachments(prev => prev.filter(att => att.id !== id));
    };

    const handleAddPayment = () => {
        if (!newPaymentData.amount || newPaymentData.amount <= 0) {
            alert("אנא הזן סכום חיובי");
            return;
        }

        if (newPaymentData.method === PaymentMethod.CHECK) {
            if (!newPaymentData.reference) {
                alert("חובה להזין מספר צ'ק בשדה אסמכתא");
                return;
            }
            if (!newPaymentData.repaymentDate) {
                alert("חובה לבחור תאריך פירעון לצ'ק");
                return;
            }
        }
        
        const payment: CustomerPayment = {
            id: `pay_${Date.now()}`,
            amount: newPaymentData.amount,
            date: new Date(newPaymentData.date || new Date()),
            method: newPaymentData.method || PaymentMethod.BANK_TRANSFER,
            reference: newPaymentData.reference || '',
            repaymentDate: newPaymentData.method === PaymentMethod.CHECK ? new Date(newPaymentData.repaymentDate || new Date()) : undefined,
            status: 'PENDING', 
            attachments: newPaymentAttachments, 
            attachment: newPaymentAttachments.length > 0 ? newPaymentAttachments[0] : undefined
        };

        setFormData(prev => ({
            ...prev,
            payments: [...prev.payments, payment],
        }));

        setIsAddingPayment(false);
        setNewPaymentData({ amount: 0, date: new Date(), method: PaymentMethod.BANK_TRANSFER, reference: '', repaymentDate: undefined });
        setNewPaymentAttachments([]);
        
        const logContent = `התקבל תשלום בסך ₪${payment.amount.toLocaleString()} (${payment.method})`;
        setFormData(prev => ({
            ...prev,
            timeline: [{
                id: `log_pay_${Date.now()}`,
                timestamp: new Date(),
                user: 'מערכת',
                type: 'LOG',
                content: logContent
            }, ...prev.timeline]
        }));
    };

    const confirmDeletePayment = () => {
        if (!paymentIdToDelete) return;
        
        const targetPayment = formData.payments.find(p => p.id === paymentIdToDelete);
        const user = employees.find(emp => emp.id === formData.employeeId)?.name || 'מערכת';

        setFormData(prev => ({
            ...prev,
            payments: prev.payments.filter(p => p.id !== paymentIdToDelete),
            timeline: [{
                id: `log_pay_del_${Date.now()}`,
                timestamp: new Date(),
                user,
                type: 'LOG',
                content: `תשלום הוסר: ₪${targetPayment?.amount.toLocaleString()} (${targetPayment?.method})`
            }, ...prev.timeline]
        }));
        setPaymentIdToDelete(null);
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
        const item = formData.lineItems[index];
        const itemDescription = item?.description || 'פריט';
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את הפריט "${itemDescription}"?`)) {
            return;
        }
        setFormData(prev => ({ ...prev, lineItems: prev.lineItems.filter((_, i) => i !== index)}));
    };

    const handleProductSelect = (
        product: PriceListProduct,
        supplierId: string,
        quantity: number,
        size?: { width?: number; height?: number },
        selectedAddons?: string[]
    ) => {
        if (!productSelectorFor) return;

        try {
            const calculated = calculateProductPrice(product, quantity, size, selectedAddons, supplierId);
            
            if (productSelectorFor.type === 'lineItem') {
                const newLineItems = [...formData.lineItems];
                const item = { ...newLineItems[productSelectorFor.index] };
                
                item.description = product.name;
                item.unitPrice = calculated.unitPrice;
                item.cost = calculated.cost;
                item.supplierId = supplierId;
                item.priceListProductId = product.id;
                item.selectedAddons = selectedAddons;
                item.priceListNotes = product.notes;
                
                if (product.baseUnit === LineItemUnit.M2 && size) {
                    item.unitType = LineItemUnit.M2;
                    item.width = size.width;
                    item.height = size.height;
                    item.quantity = (size.width || 0) * (size.height || 0);
                } else {
                    item.unitType = product.baseUnit;
                    item.quantity = quantity;
                }
                
                newLineItems[productSelectorFor.index] = item;
                setFormData(prev => ({ ...prev, lineItems: newLineItems }));
            } else if (productSelectorFor.type === 'additionalService') {
                const newServices = [...formData.additionalServices];
                const service = { ...newServices[productSelectorFor.index] };
                
                service.description = product.name;
                service.price = calculated.totalPrice;
                service.cost = calculated.totalCost;
                service.supplierId = supplierId;
                service.priceListProductId = product.id;
                service.selectedAddons = selectedAddons;
                service.priceListNotes = product.notes;
                
                newServices[productSelectorFor.index] = service;
                setFormData(prev => ({ ...prev, additionalServices: newServices }));
            }
            
            setIsProductSelectorOpen(false);
            setProductSelectorFor(null);
        } catch (error) {
            console.error('Error selecting product:', error);
            alert('שגיאה בבחירת מוצר');
        }
    };

    const handleAdditionalServiceChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const newServices = [...formData.additionalServices];
        const service = { ...newServices[index] };
        
        if (name === 'scheduledDate') {
             (service as any)[name] = value ? new Date(value) : undefined;
        } else {
             (service as any)[name] = (name === 'cost' || name === 'price') ? parseFloat(value) || 0 : value;
        }
        
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
        const service = formData.additionalServices[index];
        const serviceDescription = service?.description || 'שירות';
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את השירות "${serviceDescription}"?`)) {
            return;
        }
        setFormData(prev => ({
            ...prev,
            additionalServices: prev.additionalServices.filter((_, i) => i !== index)
        }));
    };
    
    const handleSaveNewSupplier = async (supplierData: { name: string; contactPerson: string; email: string; phone: string }) => {
        try {
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
            
            // Save to MongoDB
            const savedSupplier = await mongoService.createSupplier(newSupplier);
            setSuppliers(prev => [...prev, savedSupplier]);
            
            if (newServiceSupplierFor !== null) {
                const newServices = [...formData.additionalServices];
                newServices[newServiceSupplierFor].supplierId = savedSupplier.id;
                setFormData(prev => ({ ...prev, additionalServices: newServices }));
            }

            addActivity(`ספק חדש נוסף: ${savedSupplier.name}`);
            setIsNewSupplierModalOpen(false);
            setNewServiceSupplierFor(null);
        } catch (error) {
            console.error('Error creating supplier:', error);
            alert('שגיאה בשמירת הספק. אנא נסה שוב.');
        }
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
            orderStatus: initialStatus,
            paymentStatus: PaymentStatus.UNPAID,
            payments: [], 
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
            statusHistory: [{ status: initialStatus, startDate: new Date() }],
            vatRate: effectiveVatRate,
        };

        onDraftCreate(serviceOrder);
    };

    const generateDiff = (oldOrder: Order, newOrder: Order): FieldChange[] => {
        const changes: FieldChange[] = [];

        if (oldOrder.description !== newOrder.description) {
            changes.push({ field: 'description', label: 'כותרת', oldValue: oldOrder.description, newValue: newOrder.description, action: 'UPDATED' });
        }
        if (oldOrder.orderStatus !== newOrder.orderStatus) {
            changes.push({ field: 'orderStatus', label: 'סטטוס', oldValue: oldOrder.orderStatus, newValue: newOrder.orderStatus, action: 'UPDATED' });
        }
        if (oldOrder.paymentTerms !== newOrder.paymentTerms) {
            changes.push({ field: 'paymentTerms', label: 'תנאי תשלום', oldValue: oldOrder.paymentTerms, newValue: newOrder.paymentTerms, action: 'UPDATED' });
        }
        if (oldOrder.employeeId !== newOrder.employeeId) {
            const oldEmp = employees.find(e => e.id === oldOrder.employeeId)?.name || 'לא ידוע';
            const newEmp = employees.find(e => e.id === newOrder.employeeId)?.name || 'לא ידוע';
            changes.push({ field: 'employeeId', label: 'סוכן מטפל', oldValue: oldEmp, newValue: newEmp, action: 'UPDATED' });
        }
        if (oldOrder.vatRate !== newOrder.vatRate) {
            changes.push({ field: 'vatRate', label: 'אחוז מע"מ', oldValue: `${oldOrder.vatRate ?? vatRate}%`, newValue: `${newOrder.vatRate}%`, action: 'UPDATED' });
        }
        if (oldOrder.type !== newOrder.type) {
            changes.push({ field: 'type', label: 'סוג הזמנה', oldValue: oldOrder.type || OrderType.REGULAR, newValue: newOrder.type || OrderType.REGULAR, action: 'UPDATED' });
        }
        if (oldOrder.invoiceIssued !== newOrder.invoiceIssued) {
            changes.push({ field: 'invoiceIssued', label: 'חשבונית', oldValue: oldOrder.invoiceIssued ? 'בוצע' : 'טרם', newValue: newOrder.invoiceIssued ? 'בוצע' : 'טרם', action: 'UPDATED' });
        }
        if (oldOrder.receiptIssued !== newOrder.receiptIssued) {
            changes.push({ field: 'receiptIssued', label: 'קבלה', oldValue: oldOrder.receiptIssued ? 'בוצע' : 'טרם', newValue: newOrder.receiptIssued ? 'בוצע' : 'טרם', action: 'UPDATED' });
        }
        if (oldOrder.contactId !== newOrder.contactId) {
            const customer = customers.find(c => c.id === newOrder.customerId);
            const oldContact = customer?.contacts.find(c => c.id === oldOrder.contactId)?.name || 'לא נבחר';
            const newContact = customer?.contacts.find(c => c.id === newOrder.contactId)?.name || 'לא נבחר';
            changes.push({ field: 'contactId', label: 'איש קשר', oldValue: oldContact, newValue: newContact, action: 'UPDATED' });
        }
        
        if (new Date(oldOrder.date).toDateString() !== new Date(newOrder.date).toDateString()) {
            changes.push({ 
                field: 'date', 
                label: 'תאריך הזמנה', 
                oldValue: new Date(oldOrder.date).toLocaleDateString('he-IL'), 
                newValue: new Date(newOrder.date).toLocaleDateString('he-IL'), 
                action: 'UPDATED' 
            });
        }
        if ((oldOrder.dealStartDate || 0) !== (newOrder.dealStartDate || 0)) {
            const oldVal = oldOrder.dealStartDate ? new Date(oldOrder.dealStartDate).toLocaleDateString('he-IL') : 'לא הוגדר';
            const newVal = newOrder.dealStartDate ? new Date(newOrder.dealStartDate).toLocaleDateString('he-IL') : 'לא הוגדר';
            if (oldVal !== newVal) {
                changes.push({ field: 'dealStartDate', label: 'תאריך אישור עסקה', oldValue: oldVal, newValue: newVal, action: 'UPDATED' });
            }
        }

        const oldItemsMap = new Map(oldOrder.lineItems.map(i => [i.id, i]));
        const newItemsMap = new Map(newOrder.lineItems.map(i => [i.id, i]));

        oldOrder.lineItems.forEach(oldItem => {
            const newItem = newItemsMap.get(oldItem.id);
            if (!newItem) {
                const sName = suppliers.find(s => s.id === oldItem.supplierId)?.name || 'לא משויך';
                changes.push({ 
                    field: 'lineItems', 
                    label: 'פריט הוסר', 
                    oldValue: `"${oldItem.description}" (כמות: ${oldItem.quantity}, מחיר: ₪${oldItem.unitPrice.toLocaleString()}, ספק: ${sName})`, 
                    action: 'REMOVED' 
                });
            } else {
                if (oldItem.description !== newItem.description || oldItem.quantity !== newItem.quantity || oldItem.unitPrice !== newItem.unitPrice || oldItem.width !== newItem.width || oldItem.height !== newItem.height || oldItem.supplierId !== newItem.supplierId) {
                    const oldSName = suppliers.find(s => s.id === oldItem.supplierId)?.name || 'לא משויך';
                    const newSName = suppliers.find(s => s.id === newItem.supplierId)?.name || 'לא משויך';
                    
                    changes.push({ 
                        field: 'lineItems', 
                        label: 'פריט עודכן', 
                        subItemLabel: oldItem.description,
                        oldValue: `כמות: ${oldItem.quantity}, מחיר: ₪${oldItem.unitPrice.toLocaleString()}, ספק: ${oldSName}`,
                        newValue: `כמות: ${newItem.quantity}, מחיר: ₪${newItem.unitPrice.toLocaleString()}, ספק: ${newSName}`,
                        action: 'UPDATED' 
                    });
                }
            }
        });

        newOrder.lineItems.forEach(newItem => {
            if (!oldItemsMap.has(newItem.id)) {
                const sName = suppliers.find(s => s.id === newItem.supplierId)?.name || 'לא משויך';
                changes.push({ 
                    field: 'lineItems', 
                    label: 'פריט נוסף', 
                    newValue: `"${newItem.description}" (כמות: ${newItem.quantity}, מחיר: ₪${newItem.unitPrice.toLocaleString()}, ספק: ${sName})`, 
                    action: 'ADDED' 
                });
            }
        });

        const oldServicesMap = new Map(oldOrder.additionalServices.map(s => [s.id, s]));
        const newServicesMap = new Map(newOrder.additionalServices.map(s => [s.id, s]));

        oldOrder.additionalServices.forEach(oldSrv => {
            const newSrv = newServicesMap.get(oldSrv.id);
            if (!newSrv) {
                const sName = suppliers.find(s => s.id === oldSrv.supplierId)?.name || 'לא משויך';
                changes.push({ 
                    field: 'additionalServices', 
                    label: 'שירות הוסר', 
                    oldValue: `"${oldSrv.description}" (מחיר: ₪${oldSrv.price.toLocaleString()}, ספק: ${sName})`, 
                    action: 'REMOVED' 
                });
            } else if (oldSrv.description !== newSrv.description || oldSrv.price !== newSrv.price || oldSrv.supplierId !== newSrv.supplierId) {
                const oldSName = suppliers.find(s => s.id === oldSrv.supplierId)?.name || 'לא משויך';
                const newSName = suppliers.find(s => s.id === newSrv.supplierId)?.name || 'לא משויך';

                changes.push({ 
                    field: 'additionalServices', 
                    label: 'שירות עודכן', 
                    subItemLabel: oldSrv.description,
                    oldValue: `₪${oldSrv.price.toLocaleString()}, ספק: ${oldSName}`, 
                    newValue: `₪${newSrv.price.toLocaleString()}, ספק: ${newSName}`, 
                    action: 'UPDATED' 
                });
            }
        });

        newOrder.additionalServices.forEach(newSrv => {
            if (!oldServicesMap.has(newSrv.id)) {
                const sName = suppliers.find(s => s.id === newSrv.supplierId)?.name || 'לא משויך';
                changes.push({ 
                    field: 'additionalServices', 
                    label: 'שירות נוסף', 
                    newValue: `"${newSrv.description}" (₪${newSrv.price.toLocaleString()}, ספק: ${sName})`, 
                    action: 'ADDED' 
                });
            }
        });

        const oldAttsSet = new Set(oldOrder.attachments.map(a => a.id));
        const newAttsSet = new Set(newOrder.attachments.map(a => a.id));

        newOrder.attachments.forEach(att => {
            if (!oldAttsSet.has(att.id)) {
                changes.push({ field: 'attachments', label: 'קובץ נוסף', newValue: att.fileName, action: 'ADDED' });
            }
        });

        oldOrder.attachments.forEach(att => {
            if (!newAttsSet.has(att.id)) {
                changes.push({ field: 'attachments', label: 'קובץ הוסר', oldValue: att.fileName, action: 'REMOVED' });
            }
        });

        return changes;
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
             try {
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

                // Save to MongoDB
                const savedCustomer = await mongoService.createCustomer(newCustomer);
                
                // Update local state with the saved customer
                setCustomers(prev => [...prev, savedCustomer]);
                addActivity(`לקוח חדש נוצר מתוך הזמנה: ${savedCustomer.name}`);
                
                currentCustomerId = savedCustomer.id;
                currentContactId = newContact.id;
            } catch (error) {
                console.error('Error creating customer:', error);
                alert('שגיאה ביצירת הלקוח. אנא נסה שוב.');
                return;
            }
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
            paymentTerms: customerMode === 'NEW' ? newCustomerData.paymentTerms : formData.paymentTerms,
            vatRate: formData.vatRate ?? vatRate,
        };
        
        let finalTimeline = [...updatedFormData.timeline];
        const originalOrder = order;

        if (!originalOrder) {
            finalTimeline.unshift({
                id: `log_${Date.now()}`,
                timestamp: new Date(),
                content: 'הזמנה נוצרה',
                user,
                type: 'LOG'
            });
            updatedFormData.statusHistory = [{ status: updatedFormData.orderStatus, startDate: new Date() }];
        } else {
             const diff = generateDiff(originalOrder, { ...updatedFormData, id: order.id, orderNumber: order.orderNumber, date: new Date(dateString) } as Order);
             
             if (diff.length > 0) {
                 finalTimeline.unshift({
                     id: `log_audit_${Date.now()}`,
                     timestamp: new Date(),
                     content: 'עדכון פרטי הזמנה',
                     user,
                     type: 'LOG',
                     changes: diff
                 });
             }

             if (originalOrder.orderStatus !== updatedFormData.orderStatus) {
                 const newStatusHistory = updatedFormData.statusHistory ? [...updatedFormData.statusHistory] : [];
                 newStatusHistory.push({ status: updatedFormData.orderStatus, startDate: new Date() });
                 updatedFormData.statusHistory = newStatusHistory;
             }
        }
        
        const finalOrder = {
            ...updatedFormData,
            id: order?.id || `ord_${Date.now()}`,
            orderNumber: order?.orderNumber || getNextOrderNumber(), 
            date: new Date(dateString),
            dealStartDate: updatedFormData.dealStartDate, 
            timeline: finalTimeline,
        };

        // Save sales history and ad-hoc products
        try {
            const allProducts = await getProducts();
            const productMap = new Map(allProducts.map(p => [p.id, p]));
            const selectedCustomer = customers.find(c => c.id === finalOrder.customerId);

            // Process line items
            for (const item of finalOrder.lineItems) {
                if (item.priceListProductId && item.supplierId) {
                    // Save to sales history
                    const product = productMap.get(item.priceListProductId);
                    const supplier = suppliers.find(s => s.id === item.supplierId);
                    
                    if (product && supplier) {
                        const historyEntry: SalesHistoryEntry = {
                            id: `sh_${Date.now()}_${item.id}`,
                            productId: item.priceListProductId,
                            productName: product.name,
                            orderId: finalOrder.id,
                            orderNumber: finalOrder.orderNumber,
                            supplierId: item.supplierId,
                            supplierName: supplier.name,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalPrice: item.quantity * item.unitPrice,
                            cost: item.cost,
                            unitType: item.unitType,
                            size: item.width && item.height ? { width: item.width, height: item.height } : undefined,
                            addons: item.selectedAddons,
                            date: finalOrder.date,
                            customerId: finalOrder.customerId,
                            customerName: selectedCustomer?.name,
                            notes: item.priceListNotes
                        };
                        await addSalesHistoryEntry(historyEntry);
                    }
                } else if (!item.priceListProductId && item.description && item.supplierId) {
                    // Save as ad-hoc product
                    const supplier = suppliers.find(s => s.id === item.supplierId);
                    const adHocProduct: AdHocProduct = {
                        id: `ah_${Date.now()}_${item.id}`,
                        name: item.description,
                        orderId: finalOrder.id,
                        orderNumber: finalOrder.orderNumber,
                        supplierId: item.supplierId,
                        supplierName: supplier?.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        cost: item.cost,
                        unitType: item.unitType,
                        date: finalOrder.date,
                        customerId: finalOrder.customerId,
                        customerName: selectedCustomer?.name,
                        notes: item.priceListNotes
                    };
                    await createAdHocProduct(adHocProduct);
                }
            }

            // Process additional services
            for (const service of finalOrder.additionalServices) {
                if (service.priceListProductId && service.supplierId) {
                    // Save to sales history
                    const product = productMap.get(service.priceListProductId);
                    const supplier = suppliers.find(s => s.id === service.supplierId);
                    
                    if (product && supplier) {
                        const historyEntry: SalesHistoryEntry = {
                            id: `sh_${Date.now()}_${service.id}`,
                            productId: service.priceListProductId,
                            productName: product.name,
                            orderId: finalOrder.id,
                            orderNumber: finalOrder.orderNumber,
                            supplierId: service.supplierId,
                            supplierName: supplier.name,
                            quantity: 1,
                            unitPrice: service.price,
                            totalPrice: service.price,
                            cost: service.cost,
                            unitType: LineItemUnit.UNIT,
                            addons: service.selectedAddons,
                            date: finalOrder.date,
                            customerId: finalOrder.customerId,
                            customerName: selectedCustomer?.name,
                            notes: service.priceListNotes
                        };
                        await addSalesHistoryEntry(historyEntry);
                    }
                } else if (!service.priceListProductId && service.description && service.supplierId) {
                    // Save as ad-hoc product
                    const supplier = suppliers.find(s => s.id === service.supplierId);
                    const adHocProduct: AdHocProduct = {
                        id: `ah_${Date.now()}_${service.id}`,
                        name: service.description,
                        orderId: finalOrder.id,
                        orderNumber: finalOrder.orderNumber,
                        supplierId: service.supplierId,
                        supplierName: supplier?.name,
                        quantity: 1,
                        unitPrice: service.price,
                        cost: service.cost,
                        unitType: LineItemUnit.UNIT,
                        date: finalOrder.date,
                        customerId: finalOrder.customerId,
                        customerName: selectedCustomer?.name,
                        notes: service.priceListNotes
                    };
                    await createAdHocProduct(adHocProduct);
                }
            }
        } catch (error) {
            console.error('Error saving sales history:', error);
            // Don't block order save if history save fails
        }

        onSave(finalOrder);
    };
    
    const currentStatusConfig = statusConfigs.find(c => c.label === formData.orderStatus);
    const isActiveDeal = currentStatusConfig ? currentStatusConfig.isActiveDeal : false;
    const hasDealDate = !!formData.dealStartDate;
    const iDealActiveAndDated = isActiveDeal && hasDealDate;

    return (
        <>
        <form onSubmit={handleSubmit} className="space-y-8 text-start">
             {isNewSupplierModalOpen && (
                <Modal title="הוספת ספק חדש (שליח/מתקין)" onClose={() => setIsNewSupplierModalOpen(false)}>
                    <NewSupplierForm onSave={handleSaveNewSupplier} onCancel={() => setIsNewSupplierModalOpen(false)} />
                </Modal>
            )}

            {viewingPaymentDocuments && (
                <PaymentDocumentsViewer 
                    files={viewingPaymentDocuments} 
                    onClose={() => setViewingPaymentDocuments(null)} 
                />
            )}

            {paymentIdToDelete && (
                <Modal title="אישור מחיקת תשלום" onClose={() => setPaymentIdToDelete(null)} size="lg" zIndex={70}>
                    <div className="text-start">
                        <p className="text-slate-700 mb-6">האם אתה בטוח שברצונך למחוק את רישום התשלום הזה? פעולה זו תעדכן את היתרה לתשלום.</p>
                        <div className="flex justify-end gap-3">
                            <button 
                                type="button" 
                                onClick={() => setPaymentIdToDelete(null)} 
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300"
                            >
                                ביטול
                            </button>
                            <button 
                                type="button" 
                                onClick={confirmDeletePayment} 
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                            >
                                מחק תשלום
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

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

            <div className="space-y-4">
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

                    <div className={`rounded-lg p-2 border transition-all flex flex-col relative group ${iDealActiveAndDated ? 'bg-green-50 border-green-200' : (hasDealDate ? 'bg-slate-50 border-slate-300' : 'bg-slate-50 border-slate-200 border-dashed')}`}>
                        <div className="flex justify-between items-start mb-1">
                            <label htmlFor="dealStartDate" className={`block text-[10px] font-bold uppercase tracking-wider cursor-pointer ${iDealActiveAndDated ? 'text-green-700' : 'text-slate-500'}`}>
                                {hasDealDate ? 'תאריך אישור עסקה' : 'טרם אושרה עסקה'}
                                <span className="text-xs text-slate-400 font-normal mr-1">(קובע תנאי תשלום)</span>
                            </label>
                             <div className={`text-[10px] px-1.5 rounded-full border flex items-center gap-1 ${isActiveDeal ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isActiveDeal ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                {isActiveDeal ? 'פעיל' : 'לא פעיל'}
                            </div>
                        </div>
                        <input type="date" name="dealStartDate" id="dealStartDate" value={dealStartDateString} onChange={handleMasterChange} min={minDealDate} className={`block w-full text-sm font-semibold bg-transparent border-none p-0 focus:ring-0 cursor-pointer ${iDealActiveAndDated ? 'text-green-800' : 'text-slate-500'}`} />
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
                                    <input type="email" name="email" value={newCustomerData.email} onChange={handleNewCustomerChange} className="mt-1 block w-full rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs" required />
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

            <div className="space-y-4">
                <h3 className="text-xl font-semibold text-slate-800 border-b pb-2">סטטוסים ותהליך</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>
                <div className="flex space-x-4 space-x-reverse pt-2">
                    <label className="flex items-center"><input type="checkbox" name="invoiceIssued" checked={formData.invoiceIssued} onChange={handleMasterChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2" /> הוצאה חשבונית</label>
                    <label className="flex items-center"><input type="checkbox" name="receiptIssued" checked={formData.receiptIssued} onChange={handleMasterChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary me-2" /> הוצאה קבלה</label>
                </div>
            </div>

            <div className="space-y-6">
                <h3 className="text-xl font-semibold text-slate-800 border-b pb-2">פירוט הזמנה ועלויות</h3>
                <div>
                    <label className="block text-sm font-medium text-slate-700">כותרת הזמנה</label>
                    <input type="text" name="description" value={formData.description} onChange={handleMasterChange} required className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                </div>
                <div>
                    <h4 className="text-lg font-medium text-slate-800 mb-2">פריטי הזמנה</h4>
                    <div className="hidden md:grid text-[11px] grid-cols-12 gap-2 px-2 text-slate-500 font-bold uppercase tracking-tight">
                        <div className="col-span-2">תיאור</div>
                        <div className="col-span-1">סוג יח'</div>
                        <div className="col-span-1">רוחב</div>
                        <div className="col-span-1">גובה</div>
                        <div className="col-span-1 text-center">כמות</div>
                        <div className="col-span-1 text-center">מחיר</div>
                        <div className="col-span-1 text-center">עלות</div>
                        <div className="col-span-1 text-center bg-indigo-50 rounded-t py-0.5 border-x border-t border-indigo-100 text-indigo-700">רווח %</div>
                        <div className="col-span-1 text-center">סה"כ</div>
                        <div className="col-span-2">ספק</div>
                    </div>
                    <div className="space-y-3">
                        {formData.lineItems.map((item, index) => {
                            const itemMarkup = item.cost > 0 ? ((item.unitPrice - item.cost) / item.cost) * 100 : (item.unitPrice > 0 ? 100 : 0);
                            const markupColorClass = getProfitMarginColor(itemMarkup);
                            return (
                                <div key={item.id} className="p-3 border rounded-lg bg-slate-50 md:p-0 md:border-none md:bg-transparent md:grid md:grid-cols-12 md:gap-2 md:items-center relative">
                                    <button type="button" onClick={() => removeLineItem(index)} className="absolute top-2 left-2 text-red-500 hover:text-red-700 p-1 md:hidden"><DeleteIcon className="h-5 w-5"/></button>
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-medium text-slate-500 md:hidden">תיאור</label>
                                        <div className="flex gap-2">
                                            <input type="text" placeholder="תיאור" name="description" value={item.description} onChange={e => handleLineItemChange(index, e)} className="mt-1 block flex-1 rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setProductSelectorFor({ type: 'lineItem', index });
                                                    setIsProductSelectorOpen(true);
                                                }}
                                                className="mt-1 px-3 py-2 text-xs bg-primary text-white rounded-md hover:bg-primary-dark whitespace-nowrap"
                                            >
                                                בחר מהמחירון
                                            </button>
                                        </div>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-xs font-medium text-slate-500 md:hidden mt-2">סוג יחידה</label>
                                        <select name="unitType" value={item.unitType} onChange={e => handleLineItemChange(index, e)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
                                            {Object.values(LineItemUnit).map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-2 mt-2 md:col-span-9 md:contents">
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
                                        <div className="md:col-span-1 flex items-center md:flex-col md:justify-center md:items-center mt-1 md:mt-0 bg-indigo-50/30 md:h-full rounded-b md:rounded-none">
                                            <label className="text-[10px] font-bold text-indigo-500 md:hidden w-20">רווח %</label>
                                            <span className={`text-xs font-black ${markupColorClass} font-mono`}>
                                                {itemMarkup.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="md:col-span-1 flex items-center md:flex-col md:justify-center md:items-start mt-1 md:mt-0">
                                            <label className="text-xs font-medium text-slate-500 md:hidden w-20">סה"כ</label>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold text-slate-800">₪{(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                {item.cost > 0 && (
                                                    <span className="text-[10px] text-slate-500" title="סה״כ עלות">
                                                        (₪{(item.quantity * item.cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
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
                            );
                        })}
                    </div>
                    <button type="button" onClick={addLineItem} className="mt-2 text-sm text-primary hover:text-indigo-800">+ הוסף פריט</button>
                </div>
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
                                        <div className="flex gap-2">
                                            <input type="text" name="description" value={service.description} onChange={e => handleAdditionalServiceChange(index, e)} className="mt-1 block flex-1 rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setProductSelectorFor({ type: 'additionalService', index });
                                                    setIsProductSelectorOpen(true);
                                                }}
                                                className="mt-1 px-3 py-2 text-xs bg-primary text-white rounded-md hover:bg-primary-dark whitespace-nowrap"
                                            >
                                                בחר מהמחירון
                                            </button>
                                        </div>
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
                                        <label className="block text-xs font-medium text-slate-600">מועד ביצוע (תאריך ושעה)</label>
                                        <input 
                                            type="datetime-local" 
                                            name="scheduledDate" 
                                            value={service.scheduledDate ? (() => {
                                                const d = new Date(service.scheduledDate);
                                                const pad = (n: number) => n < 10 ? '0' + n : n;
                                                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                            })() : ''} 
                                            onChange={e => handleAdditionalServiceChange(index, e)} 
                                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm" 
                                        />
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
                <div className={`p-4 rounded-md border-2 transition-colors ${derivedPaymentStatus === PaymentStatus.PAID ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-200/50">
                        <h4 className="text-lg font-bold text-slate-800">סיכום עסקה (רווחיות)</h4>
                        <div className="flex items-center gap-2">
                            <label htmlFor="vatOverride" className="text-xs text-slate-500 font-medium">מע"מ (%):</label>
                            <input 
                                id="vatOverride"
                                type="number" 
                                name="vatRate"
                                step="0.1"
                                value={formData.vatRate}
                                onChange={handleMasterChange}
                                className="w-16 text-xs p-1 border rounded bg-white font-bold text-primary focus:ring-primary"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="text-center flex flex-col items-center">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-1">סה"כ הכנסה</h4>
                            <span className="text-lg font-bold text-green-600 leading-none">
                                {totals.totalAmount.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs text-green-700 bg-green-100/50 px-2 py-0.5 rounded mt-1">
                                כולל מע"מ: {(totals.totalAmount * (1 + effectiveVatRate / 100)).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="text-center flex flex-col items-center">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-1">סה"כ עלות</h4>
                            <span className="text-lg font-bold text-red-600 leading-none">
                                {totals.totalCost.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs text-red-700 bg-red-100/50 px-2 py-0.5 rounded mt-1">
                                כולל מע"מ: {(totals.totalCost * (1 + effectiveVatRate / 100)).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="text-center flex flex-col items-center">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-1">רווח</h4>
                            <span className="text-lg font-bold text-slate-800 leading-none">
                                {totals.profit.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs text-slate-600 bg-slate-200/50 px-2 py-0.5 rounded mt-1">
                                כולל מע"מ: {(totals.profit * (1 + effectiveVatRate / 100)).toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="text-center flex flex-col items-center justify-start">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-1">רווח %</h4>
                            <span className="text-lg font-bold text-slate-800 dir-ltr pt-1">
                                {totals.totalCost > 0 ? ((totals.profit / totals.totalCost) * 100).toFixed(1) : (totals.totalAmount > 0 ? '100' : '0')}%
                            </span>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                        <h4 className="font-bold text-slate-800 flex items-center">
                            <CashIcon className="w-5 h-5 me-2 text-emerald-600"/>
                            ניהול גבייה
                        </h4>
                        <div className="text-sm">
                            <span className="text-slate-500">סטטוס נוכחי: </span>
                            <span className={`font-bold ${derivedPaymentStatus === PaymentStatus.PAID ? 'text-green-600' : derivedPaymentStatus === PaymentStatus.PARTIALLY_PAID ? 'text-orange-500' : 'text-red-500'}`}>
                                {derivedPaymentStatus}
                            </span>
                        </div>
                    </div>
                    <div className="p-4">
                        <div className="mb-6">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-green-700">שולם: ₪{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="font-medium text-red-600">יתרה לתשלום: ₪{balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="w-full bg-red-100 rounded-full h-3 overflow-hidden relative">
                                <div 
                                    className="bg-green-500 h-full transition-all duration-500" 
                                    style={{ width: `${Math.min(100, (totalPaid / (totalDueWithVat || 1)) * 100)}%` }}
                                ></div>
                                <div className="absolute top-0 right-0 h-full w-px bg-white opacity-50"></div>
                            </div>
                            <div className="text-xs text-slate-400 mt-1 text-center">סה"כ לתשלום (כולל מע"מ): ₪{totalDueWithVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                        {(formData.payments || []).length > 0 ? (
                            <div className="mb-4 overflow-x-auto">
                                <table className="min-w-full text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-600 font-medium">
                                        <tr>
                                            <th className="px-3 py-2 border-b">תאריך</th>
                                            <th className="px-3 py-2 border-b">אמצעי תשלום</th>
                                            <th className="px-3 py-2 border-b">פרטים / אסמכתא</th>
                                            <th className="px-3 py-2 border-b">סכום</th>
                                            <th className="px-3 py-2 border-b">סטטוס</th>
                                            <th className="px-3 py-2 border-b">מסמכים</th>
                                            <th className="px-3 py-2 border-b"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {formData.payments.map((payment) => {
                                            const hasDocs = (payment.attachments && payment.attachments.length > 0) || !!payment.attachment;
                                            const docsCount = (payment.attachments && payment.attachments.length > 0) 
                                                ? payment.attachments.length 
                                                : (payment.attachment ? 1 : 0);
                                            return (
                                            <tr key={payment.id} className="hover:bg-slate-50">
                                                <td className="px-3 py-2">{new Date(payment.date).toLocaleDateString('he-IL')}</td>
                                                <td className="px-3 py-2">{payment.method}</td>
                                                <td className="px-3 py-2">
                                                    {payment.method === PaymentMethod.CHECK ? (
                                                        <div className="flex flex-col">
                                                            <span>מס' {payment.reference}</span>
                                                            <span className="text-xs font-bold text-indigo-600">
                                                                פירעון: {payment.repaymentDate ? new Date(payment.repaymentDate).toLocaleDateString('he-IL') : 'לא צוין'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        payment.reference || '-'
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 font-bold text-emerald-600">₪{payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`text-xs px-2 py-1 rounded ${
                                                        ['BOUNCED', 'CANCELED', 'RETURNED'].includes(payment.status || '') 
                                                        ? 'bg-red-100 text-red-800' 
                                                        : 'bg-green-100 text-green-800'
                                                    }`}>
                                                        {payment.status === 'BOUNCED' ? 'חזר' : payment.status === 'CANCELED' ? 'בוטל' : payment.status === 'RETURNED' ? 'הוחזר' : 'תקין'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    {hasDocs ? (
                                                        <button 
                                                            type="button" 
                                                            onClick={() => {
                                                                const docs = payment.attachments && payment.attachments.length > 0 
                                                                    ? payment.attachments 
                                                                    : (payment.attachment ? [payment.attachment] : []);
                                                                setViewingPaymentDocuments(docs);
                                                            }}
                                                            className="text-primary hover:text-indigo-800 flex items-center gap-1 text-xs font-medium"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                <path fillRule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm12 4a3 3 0 11-6 0 3 3 0 016 0zM4 9a1 1 0 100-2 1 1 0 000 2zm13-1a1 1 0 11-2 0 1 1 0 012 0zM1.75 14.5a.75.75 0 000 1.5c4.417 0 8.693.603 12.749 1.73 1.111.309 2.251-.512 2.251-1.696v-.784a.75.75 0 00-1.5 0v.784a2.718 2.718 0 01-.529.134c-4.303 1.256-8.99 1.582-13.676.832H1.75z" clipRule="evenodd" />
                                                            </svg>
                                                            צפה ({docsCount})
                                                        </button>
                                                    ) : '-'}
                                                </td>
                                                <td className="px-3 py-2 text-left">
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.stopPropagation(); setPaymentIdToDelete(payment.id); }} 
                                                        className="text-red-400 hover:text-red-600 p-1"
                                                    >
                                                        <DeleteIcon className="w-4 h-4"/>
                                                    </button>
                                                </td>
                                            </tr>
                                        )})}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-center text-slate-400 text-sm mb-4 bg-slate-50 p-2 rounded">טרם התקבלו תשלומים.</p>
                        )}
                        {!isAddingPayment ? (
                            <button 
                                type="button" 
                                onClick={() => { setIsAddingPayment(true); setNewPaymentData(prev => ({ ...prev, amount: balanceDue })); }}
                                className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4"/>
                                הוסף תשלום חדש
                            </button>
                        ) : (
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn">
                                <h5 className="text-sm font-bold text-slate-700 mb-3">פרטי תשלום חדש</h5>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">סכום</label>
                                        <input type="number" value={newPaymentData.amount} onChange={e => setNewPaymentData({...newPaymentData, amount: parseFloat(e.target.value)})} className="w-full text-sm border-slate-300 rounded focus:ring-emerald-500 focus:border-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">תאריך קבלה</label>
                                        <input type="date" value={newPaymentData.date ? new Date(newPaymentData.date).toISOString().split('T')[0] : ''} onChange={e => setNewPaymentData({...newPaymentData, date: new Date(e.target.value)})} className="w-full text-sm border-slate-300 rounded focus:ring-emerald-500 focus:border-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">אמצעי תשלום</label>
                                        <select value={newPaymentData.method} onChange={e => setNewPaymentData({...newPaymentData, method: e.target.value as PaymentMethod})} className="w-full text-sm border-slate-300 rounded focus:ring-emerald-500 focus:border-emerald-500 bg-white">
                                            {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">
                                            {newPaymentData.method === PaymentMethod.CHECK ? 'מספר צ\'ק' : 'אסמכתא (4 ספרות)'}
                                            {newPaymentData.method === PaymentMethod.CHECK && <span className="text-red-500">*</span>}
                                        </label>
                                        <input type="text" value={newPaymentData.reference} onChange={e => setNewPaymentData({...newPaymentData, reference: e.target.value})} className={`w-full text-sm border-slate-300 rounded focus:ring-emerald-500 focus:border-emerald-500 ${newPaymentData.method === PaymentMethod.CHECK && !newPaymentData.reference ? 'border-red-300' : ''}`} placeholder={newPaymentData.method === PaymentMethod.CHECK ? 'חובה להזין' : ''} />
                                    </div>
                                </div>
                                {newPaymentData.method === PaymentMethod.CHECK && (
                                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                        <label className="block text-xs font-bold text-yellow-800 mb-1">תאריך פירעון הצ'ק (חובה)</label>
                                        <input type="date" value={newPaymentData.repaymentDate ? new Date(newPaymentData.repaymentDate).toISOString().split('T')[0] : ''} onChange={e => setNewPaymentData({...newPaymentData, repaymentDate: new Date(e.target.value)})} className="w-full md:w-1/2 text-sm border-yellow-300 rounded focus:ring-yellow-500 focus:border-yellow-500" required />
                                    </div>
                                )}
                                <div className="mb-4">
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                        {newPaymentData.method === PaymentMethod.CHECK ? 'צילום הצ\'ק (תמונה/PDF)' : 'אסמכתא (תמונה/PDF)'}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 text-slate-600">
                                            <PlusIcon className="w-3 h-3"/>
                                            בחר קבצים
                                            <input type="file" multiple className="hidden" onChange={handlePaymentFileChange} accept="image/*,.pdf" />
                                        </label>
                                        <span className="text-[10px] text-slate-400">ניתן להעלות מספר קבצים</span>
                                    </div>
                                    {newPaymentAttachments.length > 0 && (
                                        <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                                            {newPaymentAttachments.map(file => (
                                                <div key={file.id} className="relative group w-16 h-16 shrink-0 border rounded bg-white overflow-hidden">
                                                    {file.type.startsWith('image/') ? (
                                                        <img src={file.dataUrl} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-slate-100 text-[9px] text-slate-500 font-bold p-1 text-center break-all">
                                                            {file.fileName}
                                                        </div>
                                                    )}
                                                    <button 
                                                        type="button" 
                                                        onClick={(e) => { e.stopPropagation(); removePaymentAttachment(file.id); }}
                                                        className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <DeleteIcon className="w-3 h-3"/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                                    <button type="button" onClick={() => { setIsAddingPayment(false); setNewPaymentAttachments([]); }} className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50">ביטול</button>
                                    <button type="button" onClick={handleAddPayment} className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 shadow-sm">שמור תשלום</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

             <div className="space-y-6">
                <h3 className="text-xl font-semibold text-slate-800 border-b pb-2">קבצים וגלריה</h3>
                <OrderFileManager 
                    attachments={formData.attachments} 
                    onUpdate={(newAttachments) => setFormData(prev => ({ ...prev, attachments: newAttachments }))} 
                />
            </div>

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
                                                    {assigneeName && <span className="mx-1 text-slate-400">→</span>}
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
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
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
                                                                    {/* Fix: changed task.isCompleted to event.isCompleted */}
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
                                                <div>
                                                    <p className="font-medium text-slate-800">{event.content}</p>
                                                    {event.changes && event.changes.length > 0 && (
                                                        <div className="mt-2 space-y-1.5">
                                                            {event.changes.map((change, cIdx) => (
                                                                <div key={cIdx} className="text-xs bg-white/60 p-2 rounded border border-slate-100 flex flex-col gap-1 shadow-sm">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black tracking-tighter ${
                                                                            change.action === 'ADDED' ? 'bg-green-100 text-green-700' :
                                                                            change.action === 'REMOVED' ? 'bg-red-100 text-red-700' :
                                                                            'bg-blue-100 text-blue-700'
                                                                        }`}>
                                                                            {change.action === 'ADDED' ? 'נוסף' : change.action === 'REMOVED' ? 'הוסר' : 'עודכן'}
                                                                        </span>
                                                                        <span className="font-bold text-slate-700">{change.label}</span>
                                                                        {change.subItemLabel && <span className="text-slate-400 font-normal">({change.subItemLabel})</span>}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 pr-2 border-r-2 border-slate-200 ms-2">
                                                                        {change.action === 'UPDATED' && (
                                                                            <>
                                                                                <span className="line-through text-slate-400">{String(change.oldValue)}</span>
                                                                                <span className="text-slate-400">➔</span>
                                                                            </>
                                                                        )}
                                                                        <span className="font-semibold text-slate-700">{String(change.newValue || change.oldValue)}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
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
            <div className="flex justify-between pt-4 mt-6 border-t">
                {isEditMode && (formData.type === OrderType.REGULAR || !formData.type) && (
                    <button type="button" onClick={handleCreateServiceCall} className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 flex items-center gap-2 text-sm font-medium">
                        <SettingsIcon className="w-4 h-4" />
                        פתח קריאת שירות
                    </button>
                )}
                <div className="flex space-x-2 space-x-reverse">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">ביטול</button>
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700">שמור הזמנה</button>
                </div>
            </div>
        </form>
        {isProductSelectorOpen && productSelectorFor && (
            <ProductSelectorModal
                isOpen={isProductSelectorOpen}
                onClose={() => {
                    setIsProductSelectorOpen(false);
                    setProductSelectorFor(null);
                }}
                onSelect={handleProductSelect}
                suppliers={suppliers}
                orderId={order?.id}
                orderNumber={order?.orderNumber}
                orderStatus={order?.orderStatus}
            />
        )}
    </>
    );
};

const OrdersPage: React.FC<OrdersPageProps> = ({ orders, setOrders, customers, setCustomers, suppliers, setSuppliers, employees, addActivity, initialOpenOrderId, onOrderOpened, statusConfigs, getNextOrderNumber, vatRate }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [customerFilter, setCustomerFilter] = useState<string[]>([]);
    const [supplierFilter, setSupplierFilter] = useState<string[]>([]);
    const [employeeFilter, setEmployeeFilter] = useState<string[]>([]); // New Employee Filter
    const [orderStatusFilter, setOrderStatusFilter] = useState<string[]>([]);
    const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatus[]>([]);
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [startDateFilter, setStartDateFilter] = useState<string>(''); // NEW: Date Range Start
    const [endDateFilter, setEndDateFilter] = useState<string>('');     // NEW: Date Range End
    const [dateFilterType, setDateFilterType] = useState<'ORDER_DATE' | 'DEAL_DATE'>('ORDER_DATE'); // New Date Type Filter
    const [isCollectionMode, setIsCollectionMode] = useState(false);
    const [showCompletedOrders, setShowCompletedOrders] = useState(false); 

    const customerOptions = useMemo(() => customers.map(c => ({ value: c.id, label: c.name })), [customers]);
    const supplierOptions = useMemo(() => suppliers.map(s => ({ value: s.id, label: s.name })), [suppliers]);
    const employeeOptions = useMemo(() => employees.map(e => ({ value: e.id, label: e.name })), [employees]);
    const orderStatusOptions = useMemo(() => (statusConfigs || []).map(s => ({ value: s.label, label: s.label })), [statusConfigs]);
    const paymentStatusOptions = useMemo(() => PAYMENT_STATUSES_ORDERED.map(s => ({ value: s, label: s })), []);

    const availableYears = useMemo(() => {
        const years = new Set(orders.map(o => new Date(o.date).getFullYear()));
        return Array.from(years).sort((a: number, b: number = 0) => b - a);
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

    const resetFilters = () => {
        setSearchTerm('');
        setCustomerFilter([]);
        setSupplierFilter([]);
        setEmployeeFilter([]);
        setOrderStatusFilter([]);
        setPaymentStatusFilter([]);
        setMonthFilter('all');
        setYearFilter('all');
        setStartDateFilter('');
        setEndDateFilter('');
        setDateFilterType('ORDER_DATE');
        setIsCollectionMode(false);
        setShowCompletedOrders(false);
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
                content: `שינוי סטטוס`,
                user: user,
                type: 'LOG',
                changes: [
                    { field: 'orderStatus', label: 'סטטוס', oldValue: originalOrder.orderStatus, newValue: newStatus, action: 'UPDATED' }
                ]
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

    const handleDraftCreate = (draftOrder: Order) => {
        setEditingOrder(draftOrder);
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
        const targetStatus = order.orderStatus;
        let totalMilliseconds = 0;
        const now = new Date();
        const history = [...order.statusHistory].sort((a, b) => 
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );
        for (let i = 0; i < history.length; i++) {
            const entry = history[i];
            if (entry.status === targetStatus) {
                const startTime = new Date(entry.startDate).getTime();
                let endTime = now.getTime();
                if (i < history.length - 1) {
                    endTime = new Date(history[i + 1].startDate).getTime();
                }
                if (endTime > startTime) {
                    totalMilliseconds += (endTime - startTime);
                }
            }
        }
        const seconds = Math.floor(totalMilliseconds / 1000);
        const minutes = Math.floor((seconds % 3600) / 60);
        const hours = Math.floor((seconds % 86400) / 3600);
        const days = Math.floor(seconds / 86400);
        const parts = [];
        if (days > 0) parts.push(`${days} ימים`);
        if (hours > 0) parts.push(`${hours} שעות`);
        parts.push(`${minutes} דקות`);
        return parts.join(', ');
    };

    const filteredOrders = useMemo(() => {
        let result = orders;
        if (isCollectionMode) {
             result = result.filter(order => {
                 const config = statusConfigs.find(c => c.label === order.orderStatus);
                 const isActive = config ? config.isActiveDeal : false;
                 return order.paymentStatus !== PaymentStatus.PAID && isActive;
             });
        } else {
             result = result.filter(order => {
                if (paymentStatusFilter.length === 0) return true;
                return paymentStatusFilter.includes(order.paymentStatus);
            });
        }
        result = result
            .filter(order => {
                const config = statusConfigs.find(c => c.label === order.orderStatus);
                if (orderStatusFilter.length > 0) {
                    return orderStatusFilter.includes(order.orderStatus);
                } 
                if (isCollectionMode) {
                    return true;
                }
                if (!showCompletedOrders && config?.isCompleted) {
                    return false;
                }
                return true;
            })
            .filter(order => {
                if (customerFilter.length === 0) return true;
                return customerFilter.includes(order.customerId || '');
            })
            .filter(order => {
                if (employeeFilter.length === 0) return true;
                return employeeFilter.includes(order.employeeId || '');
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
                const relevantDate = dateFilterType === 'ORDER_DATE' 
                    ? new Date(order.date) 
                    : (order.dealStartDate ? new Date(order.dealStartDate) : null);
                
                if (!relevantDate) return dateFilterType === 'ORDER_DATE';
                
                const dateStr = relevantDate.toISOString().split('T')[0];

                // NEW: Date Range Filter Priority
                if (startDateFilter || endDateFilter) {
                    if (startDateFilter && dateStr < startDateFilter) return false;
                    if (endDateFilter && dateStr > endDateFilter) return false;
                    return true;
                }

                if (monthFilter !== 'all' && (relevantDate.getMonth() + 1) !== parseInt(monthFilter)) return false;
                if (yearFilter !== 'all' && relevantDate.getFullYear() !== parseInt(yearFilter)) return false;
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
                 const dateA = calculateDueDate(a.dealStartDate || a.date, a.paymentTerms);
                 const dateB = calculateDueDate(b.dealStartDate || b.date, b.paymentTerms);
                 return dateA.getTime() - dateB.getTime();
            });
        } else {
             const dateKey = dateFilterType === 'ORDER_DATE' ? 'date' : 'dealStartDate';
             result.sort((a,b) => {
                const dA = a[dateKey] ? new Date(a[dateKey]!).getTime() : 0;
                const dB = b[dateKey] ? new Date(b[dateKey]!).getTime() : 0;
                return dB - dA;
             });
        }
        return result;
    }, [orders, orderStatusFilter, paymentStatusFilter, customerFilter, employeeFilter, supplierFilter, monthFilter, yearFilter, startDateFilter, endDateFilter, searchTerm, isCollectionMode, showCompletedOrders, statusConfigs, dateFilterType]);

    const summaryTotals = useMemo(() => {
        return filteredOrders.reduce((acc, order) => {
            const { totalAmount, profit, totalCost } = calculateOrderTotals(order);
            const currentOrderVat = order.vatRate ?? vatRate;
            acc.totalAmount += totalAmount;
            acc.totalProfit += profit;
            acc.totalCost += totalCost; 
            acc.totalAmountInclVat += totalAmount * (1 + currentOrderVat / 100);
            
            const statusConfig = statusConfigs.find(c => c.label === order.orderStatus);
            const isActiveDeal = statusConfig ? statusConfig.isActiveDeal : true; 
            if (isActiveDeal) {
                const balance = order.paymentStatus === PaymentStatus.PAID ? 0 : totalAmount;
                acc.totalBalance += balance;
                acc.totalBalanceInclVat += balance * (1 + currentOrderVat / 100);
            }
            return acc;
        }, { totalAmount: 0, totalProfit: 0, totalBalance: 0, totalCost: 0, totalAmountInclVat: 0, totalBalanceInclVat: 0 });
    }, [filteredOrders, statusConfigs, vatRate]);
    
    return (
        <div>
            <div className="flex justify-between items-start mb-6 gap-4">
                 <div className="flex-grow bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-start">
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-11 gap-3">
                            <div className="lg:col-span-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">סוג תאריך</label>
                                <select 
                                    value={dateFilterType} 
                                    onChange={e => setDateFilterType(e.target.value as any)} 
                                    className={`w-full text-xs p-2 border rounded-md focus:ring-primary font-bold ${dateFilterType === 'DEAL_DATE' ? 'bg-indigo-50 border-primary text-primary' : 'border-slate-300'}`}
                                >
                                    <option value="ORDER_DATE">תאריך הזמנה</option>
                                    <option value="DEAL_DATE">תאריך אישור</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">מתאריך</label>
                                <input 
                                    type="date" 
                                    value={startDateFilter} 
                                    onChange={e => setStartDateFilter(e.target.value)} 
                                    className="w-full text-xs p-2 border border-slate-300 rounded-md focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">עד תאריך</label>
                                <input 
                                    type="date" 
                                    value={endDateFilter} 
                                    onChange={e => setEndDateFilter(e.target.value)} 
                                    className="w-full text-xs p-2 border border-slate-300 rounded-md focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">חודש</label>
                                <select disabled={!!startDateFilter || !!endDateFilter} value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-full text-xs p-2 border-slate-300 rounded-md focus:ring-primary disabled:bg-slate-50">
                                    <option value="all">הכל</option>
                                    {availableMonths.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">שנה</label>
                                <select disabled={!!startDateFilter || !!endDateFilter} value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="w-full text-xs p-2 border-slate-300 rounded-md focus:ring-primary disabled:bg-slate-50">
                                    <option value="all">הכל</option>
                                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <div>
                                <MultiSelectFilter label="לקוח" options={customerOptions} selectedValues={customerFilter} onChange={setCustomerFilter} />
                            </div>
                            <div>
                                <MultiSelectFilter label="עובד" options={employeeOptions} selectedValues={employeeFilter} onChange={setEmployeeFilter} />
                            </div>
                            <div>
                                <MultiSelectFilter label="ספק" options={supplierOptions} selectedValues={supplierFilter} onChange={setSupplierFilter} />
                            </div>
                            <div>
                                <MultiSelectFilter label="סטטוס" options={orderStatusOptions} selectedValues={orderStatusFilter} onChange={setOrderStatusFilter} />
                            </div>
                            <div className="lg:col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">חיפוש חופשי</label>
                                <div className="relative">
                                    <input type="text" placeholder="חיפוש..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full text-xs p-2 border-slate-300 rounded-md focus:ring-primary" />
                                    {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 left-2 text-slate-400">×</button>}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-4">
                             <div className="flex items-center gap-3">
                                <button onClick={() => setIsCollectionMode(!isCollectionMode)} className={`flex items-center px-4 py-2 rounded-md text-sm font-bold transition-colors shadow-sm ${isCollectionMode ? 'bg-red-600 text-white ring-2 ring-red-300' : 'bg-white text-slate-600 border border-slate-300 hover:bg-red-50 hover:text-red-600'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 me-2">
                                        <path fillRule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm12 4a3 3 0 11-6 0 3 3 0 016 0zM4 9a1 1 0 100-2 1 1 0 000 2zm13-1a1 1 0 11-2 0 1 1 0 012 0zM1.75 14.5a.75.75 0 000 1.5c4.417 0 8.693.603 12.749 1.73 1.111.309 2.251-.512 2.251-1.696v-.784a.75.75 0 00-1.5 0v.784a2.718 2.718 0 01-.529.134c-4.303 1.256-8.99 1.582-13.676.832H1.75z" clipRule="evenodd" />
                                    </svg>
                                    {isCollectionMode ? 'יציאה ממצב גבייה' : 'מצב גבייה (חובות)'}
                                </button>
                                <button 
                                    onClick={() => setShowCompletedOrders(!showCompletedOrders)} 
                                    className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm border ${showCompletedOrders ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}`}
                                >
                                    <span className={`w-4 h-4 me-2 rounded flex items-center justify-center border ${showCompletedOrders ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-400'}`}>
                                        {showCompletedOrders && <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                    </span>
                                    הצג עסקאות שהסתיימו
                                </button>
                             </div>
                             
                             <button 
                                onClick={resetFilters} 
                                className="text-xs font-black text-slate-400 hover:text-red-500 transition-colors uppercase flex items-center gap-1 bg-slate-50 px-3 py-2 rounded border border-slate-100"
                             >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                נקה את כל המסננים
                             </button>
                        </div>
                        
                        {/* Status Hint Message */}
                        {dateFilterType === 'DEAL_DATE' && !showCompletedOrders && (
                            <div className="flex items-center gap-2 text-indigo-600 text-xs bg-indigo-50/50 p-2 rounded-md border border-indigo-100 transition-all">
                                <span className="text-sm">💡</span>
                                <p className="font-medium">
                                    מציג עסקאות פעילות בלבד. כדי לראות גם עסקאות מהעבר (ארכיון), לחץ על 
                                    <span className="font-bold underline mx-1 cursor-pointer hover:text-indigo-800" onClick={() => setShowCompletedOrders(true)}>
                                        'הצג עסקאות שהסתיימו'
                                    </span>.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <button onClick={handleAddOrder} className="flex-shrink-0 flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-indigo-700 transition-colors h-fit mt-5">
                    <PlusIcon className="h-5 w-5 me-2" />
                    הוסף הזמנה
                </button>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-start">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider"># הזמנה</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">תיאור</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">לקוח</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">ספקים</th>
                             <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סכום</th>
                             <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">יתרה לתשלום</th>
                             <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">רווח</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">
                                {dateFilterType === 'ORDER_DATE' ? 'תאריך הזמנה' : 'תאריך אישור'}
                            </th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider bg-yellow-50/50">מועד תשלום</th>
                            <th className="px-4 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider">סטטוס</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {filteredOrders.map(order => {
                            const { totalAmount, profit, totalCost, totalPaid } = calculateOrderTotals(order);
                            const durationText = calculateStatusDuration(order);
                            const itemMarkup = totalCost > 0 ? (profit / totalCost) * 100 : (totalAmount > 0 ? 100 : 0);
                            const profitColorClass = getProfitMarginColor(itemMarkup);
                            const customer = customers.find(c => c.id === order.customerId);
                            const primaryContact = customer?.contacts.find(c => c.isBillingContact) || customer?.contacts[0];
                            const statusConfig = statusConfigs.find(c => c.label === order.orderStatus);
                            const isActiveDeal = statusConfig ? statusConfig.isActiveDeal : true;
                            
                            const currentOrderVat = order.vatRate ?? vatRate;
                            const totalDueWithVat = totalAmount * (1 + currentOrderVat / 100);
                            
                            const balanceDue = isActiveDeal ? Math.max(0, totalDueWithVat - totalPaid) : 0;
                            const calculationBaseDate = order.dealStartDate || order.date;
                            const dueDate = calculateDueDate(calculationBaseDate, order.paymentTerms);
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            const isCompletionBased = order.paymentTerms === 'עם סיום העבודה';
                            const isFinished = statusConfig?.isCompleted;
                            let isOverdue = false;
                            if (isActiveDeal && balanceDue > 1) {
                                if (isCompletionBased && !isFinished) {
                                    isOverdue = false; 
                                } else {
                                    isOverdue = dueDate.getTime() < today.getTime();
                                }
                            }
                            const diffTime = Math.abs(today.getTime() - dueDate.getTime());
                            const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            let whatsappUrl = '';
                            let gmailUrl = '';
                            let telUrl = '';
                            if (primaryContact) {
                                if (primaryContact.phone) {
                                    let cleanPhone = primaryContact.phone.replace(/[^0-9]/g, '');
                                    telUrl = `tel:${cleanPhone}`;
                                    if (cleanPhone.startsWith('0')) {
                                        cleanPhone = `972${cleanPhone.substring(1)}`;
                                    }
                                    whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}`;
                                }
                                if (primaryContact.email) {
                                    gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${primaryContact?.email}`;
                                }
                            }
                            const relatedSupplierIds = new Set<string>();
                            if (order.supplierId) relatedSupplierIds.add(order.supplierId);
                            order.lineItems.forEach(li => li.supplierId && relatedSupplierIds.add(li.supplierId));
                            order.additionalServices.forEach(as => as.supplierId && relatedSupplierIds.add(as.supplierId));
                            const relatedSupplierNames = Array.from(relatedSupplierIds)
                                .map(id => suppliers.find(s => s.id === id)?.name)
                                .filter(Boolean) as string[];
                            
                            const displayDate = dateFilterType === 'ORDER_DATE' ? order.date : order.dealStartDate;

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
                                            {whatsappUrl && <a href={whatsappUrl} target="crm_whatsapp" title={`שלח וואטסאפ ל-${primaryContact?.phone}`} className="text-green-500 hover:text-green-700"><WhatsAppIcon className="h-5 w-5"/></a>}
                                            {gmailUrl && <a href={gmailUrl} target="crm_email" title={`שלח אימייל ל-${primaryContact?.email}`} className="text-slate-500 hover:text-primary"><EmailIcon className="h-5 w-5"/></a>}
                                            {telUrl && <a href={telUrl} title={`התקשר ל-${primaryContact?.phone}`} className="text-slate-500 hover:text-primary"><PhoneIcon className="h-5 w-5"/></a>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-sm text-slate-500">
                                        <div className="flex flex-col gap-1">
                                            {relatedSupplierNames.length > 0 ? (
                                                relatedSupplierNames.map(name => (
                                                    <span key={name} className="text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded w-fit max-w-[150px] truncate" title={name}>
                                                        {name}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className='px-4 py-4 whitespace-nowrap text-sm font-semibold text-green-600'>
                                        <div>{totalAmount.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        <div className="text-[10px] text-slate-400 font-normal">
                                            ({totalDueWithVat.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })} כולל {currentOrderVat}%)
                                        </div>
                                        {!isActiveDeal && <span className="text-[10px] text-slate-400 block">(צפוי)</span>}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-red-600">
                                        {isActiveDeal ? (
                                            balanceDue > 1 ? (
                                                <>
                                                    <div className="text-red-600">{balanceDue.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                    <div className="text-[10px] text-red-400 font-normal">כולל מע"מ</div>
                                                </>
                                            ) : <span className="text-green-600 text-xs">שולם במלואו</span>
                                        ) : (
                                            <span className="text-slate-400 text-xs font-normal">לא לתשלום</span>
                                        )}
                                    </td>
                                     <td className={`px-4 py-4 whitespace-nowrap text-sm font-semibold text-center ${profitColorClass}`}>
                                        <div>{profit.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        <div className="text-xs font-normal opacity-80">({itemMarkup.toFixed(1)}%)</div>
                                    </td>
                                    <td className={`px-4 py-4 whitespace-nowrap text-sm ${dateFilterType === 'DEAL_DATE' ? 'font-bold text-indigo-700 bg-indigo-50/20' : 'text-slate-500'}`}>
                                        {displayDate ? new Date(displayDate).toLocaleDateString('he-IL') : '—'}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm bg-yellow-50/30">
                                        <div className="flex flex-col">
                                            {isCompletionBased && !isFinished ? (
                                                <span className="text-orange-500 font-bold text-xs">ממתין לסיום עבודה</span>
                                            ) : (
                                                <span className={`${isOverdue ? 'text-red-700 font-bold' : 'text-slate-600'}`}>
                                                    {dueDate.toLocaleDateString('he-IL')}
                                                </span>
                                            )}
                                            {isOverdue && <span className="text-[10px] bg-red-100 text-red-800 px-1 py-0.5 rounded w-fit mt-1 animate-pulse">{overdueDays} ימים באיחור</span>}
                                            {!isOverdue && balanceDue > 1 && isActiveDeal && <span className="text-[10px] text-slate-400 mt-1">({order.paymentTerms})</span>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <div className="relative">
                                            <select value={order.orderStatus} onChange={(e) => handleStatusChange(order.id, e.target.value)} className={`appearance-none w-full cursor-pointer px-2 py-1 text-xs leading-5 font-semibold rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary text-center ${getStatusBadge(order.orderStatus)}`} aria-label={`שנה סטטוס עבור הזמנה ${order.orderNumber}`}>
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
                                </tr>
                            )
                        })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-semibold border-t-2 border-slate-300 sticky bottom-0 z-10">
                        <tr>
                            <td className="px-4 py-3 text-end align-top" colSpan={4}>סה"כ</td>
                            <td className="px-4 py-3 text-start text-green-700 align-top">
                                <div>{summaryTotals.totalAmount.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                <div className="text-[10px] text-slate-500 font-normal">
                                    ({summaryTotals.totalAmountInclVat.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })} כולל מע"מ משוקלל)
                                </div>
                            </td>
                            <td className="px-4 py-3 text-start text-red-700 font-bold align-top">
                                <div>{summaryTotals.totalBalance.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                <div className="text-[10px] text-red-500 font-normal">
                                    ({summaryTotals.totalBalanceInclVat.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })} כולל מע"מ משוקלל)
                                </div>
                            </td>
                            <td className="px-4 py-3 text-start text-slate-800 align-top">
                                <div>{summaryTotals.totalProfit.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                <div className="text-[10px] text-slate-500 font-normal">
                                    ({summaryTotals.totalCost > 0 ? ((summaryTotals.totalProfit / summaryTotals.totalCost) * 100).toFixed(1) : (summaryTotals.totalAmount > 0 ? '100' : '0')}% רווח מהעלות)
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
                        onDraftCreate={handleDraftCreate}
                        onCancel={() => setIsModalOpen(false)} 
                        addActivity={addActivity}
                        allOrders={orders}
                        onSwitchOrder={(id) => {
                            const target = orders.find(o => o.id === id);
                            if (target) handleEditOrder(target);
                        }}
                        statusConfigs={statusConfigs}
                        getNextOrderNumber={getNextOrderNumber}
                        vatRate={vatRate}
                    />
                </Modal>
            )}
        </div>
    );
};

export default OrdersPage;