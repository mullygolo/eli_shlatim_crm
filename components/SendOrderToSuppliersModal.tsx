import React, { useState, useMemo, useEffect } from 'react';
import { LineItem, Supplier, PriceListProduct, Order, Contact } from '../types';
import { getProduct } from '../services/priceListService';
import Modal from './Modal';
import { EmailIcon, WhatsAppIcon } from './icons';

interface SendOrderToSuppliersModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
    suppliers: Supplier[];
    onSend: (requests: { lineItemId: string; supplierIds: string[]; methods: { supplierId: string; method: 'EMAIL' | 'WHATSAPP' }[] }[]) => void;
}

interface LineItemWithProduct extends LineItem {
    product?: PriceListProduct;
    loading?: boolean;
}

const SendOrderToSuppliersModal: React.FC<SendOrderToSuppliersModalProps> = ({
    isOpen,
    onClose,
    order,
    suppliers,
    onSend
}) => {
    const [lineItemsWithProducts, setLineItemsWithProducts] = useState<LineItemWithProduct[]>([]);
    const [selectedSuppliers, setSelectedSuppliers] = useState<Map<string, Set<string>>>(new Map()); // lineItemId -> Set<supplierId>
    const [contactMethods, setContactMethods] = useState<Map<string, Map<string, 'EMAIL' | 'WHATSAPP'>>>(new Map()); // lineItemId -> supplierId -> method

    // Filter line items that have priceListProductId
    const relevantLineItems = useMemo(() => {
        return order.lineItems.filter(item => item.priceListProductId);
    }, [order.lineItems]);

    useEffect(() => {
        if (isOpen && relevantLineItems.length > 0) {
            loadProducts();
        }
    }, [isOpen, relevantLineItems]);

    const loadProducts = async () => {
        const items: LineItemWithProduct[] = relevantLineItems.map(item => ({ ...item, loading: true }));
        setLineItemsWithProducts(items);

        // Load products in parallel
        const productPromises = relevantLineItems.map(async (item) => {
            if (!item.priceListProductId) return null;
            try {
                const product = await getProduct(item.priceListProductId);
                return { itemId: item.id, product };
            } catch (error) {
                console.error(`Error loading product for item ${item.id}:`, error);
                return { itemId: item.id, product: null };
            }
        });

        const results = await Promise.all(productPromises);
        const updatedItems = items.map(item => {
            const result = results.find(r => r?.itemId === item.id);
            return {
                ...item,
                product: result?.product || undefined,
                loading: false
            };
        });

        setLineItemsWithProducts(updatedItems);

        // Initialize contact methods and pre-select current suppliers
        const newSelectedSuppliers = new Map<string, Set<string>>();
        const newContactMethods = new Map<string, Map<string, 'EMAIL' | 'WHATSAPP'>>();

        updatedItems.forEach(item => {
            // Pre-select current supplier if exists
            const selectedForItem = new Set<string>();
            if (item.supplierId) {
                selectedForItem.add(item.supplierId);
            }
            newSelectedSuppliers.set(item.id, selectedForItem);

            // Initialize contact methods
            const methodsForItem = new Map<string, 'EMAIL' | 'WHATSAPP'>();
            if (item.product) {
                // Get all suppliers for this product
                const productSupplierIds = new Set(item.product.supplierPricings?.map(sp => sp.supplierId) || []);
                suppliers.forEach(supplier => {
                    if (productSupplierIds.has(supplier.id) || !item.product?.supplierPricings?.some(sp => sp.supplierId === supplier.id)) {
                        const primaryContact = supplier.contacts.find(c => c.isDefault) || supplier.contacts[0];
                        const preference = primaryContact?.contactPreference || 'EMAIL';
                        methodsForItem.set(supplier.id, preference as 'EMAIL' | 'WHATSAPP');
                    }
                });
            }
            newContactMethods.set(item.id, methodsForItem);
        });

        setSelectedSuppliers(newSelectedSuppliers);
        setContactMethods(newContactMethods);
    };

    const getSuppliersForItem = (item: LineItemWithProduct): Supplier[] => {
        if (!item.product) return [];
        
        const productSupplierIds = new Set(item.product.supplierPricings?.map(sp => sp.supplierId) || []);
        const suppliersWithPricing = suppliers.filter(s => productSupplierIds.has(s.id));
        const suppliersWithoutPricing = suppliers.filter(s => !productSupplierIds.has(s.id));
        
        return [...suppliersWithPricing, ...suppliersWithoutPricing];
    };

    const handleSupplierToggle = (lineItemId: string, supplierId: string) => {
        const newSelected = new Map(selectedSuppliers);
        const itemSelected = new Set(newSelected.get(lineItemId) || []);
        
        if (itemSelected.has(supplierId)) {
            itemSelected.delete(supplierId);
        } else {
            itemSelected.add(supplierId);
        }
        
        newSelected.set(lineItemId, itemSelected);
        setSelectedSuppliers(newSelected);
    };

    const handleSelectAllForItem = (lineItemId: string) => {
        const item = lineItemsWithProducts.find(i => i.id === lineItemId);
        if (!item) return;

        const itemSuppliers = getSuppliersForItem(item);
        const currentSelected = selectedSuppliers.get(lineItemId) || new Set();
        
        const newSelected = new Map(selectedSuppliers);
        if (currentSelected.size === itemSuppliers.length) {
            newSelected.set(lineItemId, new Set());
        } else {
            newSelected.set(lineItemId, new Set(itemSuppliers.map(s => s.id)));
        }
        
        setSelectedSuppliers(newSelected);
    };

    const handleMethodChange = (lineItemId: string, supplierId: string, method: 'EMAIL' | 'WHATSAPP') => {
        const newMethods = new Map(contactMethods);
        const itemMethods = new Map(newMethods.get(lineItemId) || []);
        itemMethods.set(supplierId, method);
        newMethods.set(lineItemId, itemMethods);
        setContactMethods(newMethods);
    };

    const handleSend = () => {
        const requests: { lineItemId: string; supplierIds: string[]; methods: { supplierId: string; method: 'EMAIL' | 'WHATSAPP' }[] }[] = [];

        selectedSuppliers.forEach((supplierIds, lineItemId) => {
            if (supplierIds.size > 0) {
                const itemMethods = contactMethods.get(lineItemId) || new Map();
                const methods = Array.from(supplierIds).map(supplierId => ({
                    supplierId,
                    method: itemMethods.get(supplierId) || 'EMAIL'
                }));
                requests.push({
                    lineItemId,
                    supplierIds: Array.from(supplierIds),
                    methods
                });
            }
        });

        if (requests.length === 0) {
            alert('אנא בחר לפחות ספק אחד');
            return;
        }

        onSend(requests);
        onClose();
    };

    if (!isOpen) return null;

    if (!isOpen) return null;

    return (
        <Modal title="שלח בקשות הצעת מחיר לספקים" onClose={onClose} size="5xl">
            <div className="space-y-6" dir="rtl">
                {/* Order Info */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">הזמנה #{order.orderNumber}</h3>
                            <p className="text-sm text-slate-600">{order.description}</p>
                        </div>
                        <div className="text-sm text-slate-500">
                            {relevantLineItems.length} פריטים
                        </div>
                    </div>
                </div>

                {/* Line Items */}
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {lineItemsWithProducts.map((item) => {
                        const itemSuppliers = getSuppliersForItem(item);
                        const itemSelected = selectedSuppliers.get(item.id) || new Set();
                        const itemMethods = contactMethods.get(item.id) || new Map();

                        return (
                            <div key={item.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                                {/* Item Header */}
                                <div className="flex gap-4 mb-4 pb-4 border-b border-slate-200">
                                    {item.product?.images && item.product.images.length > 0 && (
                                        <img
                                            src={item.product.images.find(img => img.isPrimary)?.dataUrl || item.product.images[0].dataUrl}
                                            alt={item.product.name}
                                            className="w-20 h-20 object-cover rounded"
                                        />
                                    )}
                                    <div className="flex-1">
                                        <h4 className="text-base font-bold text-slate-900">
                                            {item.product?.name || item.description}
                                        </h4>
                                        {item.product?.category && (
                                            <p className="text-sm text-slate-500">{item.product.category}</p>
                                        )}
                                        <div className="mt-2 text-sm text-slate-700">
                                            <div>כמות: {item.quantity}</div>
                                            {item.width && item.height && (
                                                <div>מידות: {item.width} x {item.height}</div>
                                            )}
                                            <div>מחיר ללקוח: ₪{(item.unitPrice * item.quantity).toLocaleString()}</div>
                                            {item.supplierId && (
                                                <div className="text-xs text-blue-600 mt-1">
                                                    ספק נבחר: {suppliers.find(s => s.id === item.supplierId)?.name}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Suppliers List */}
                                {item.loading ? (
                                    <div className="text-center py-4 text-slate-500">טוען...</div>
                                ) : (
                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <h5 className="text-sm font-semibold text-slate-800">בחר ספקים לשליחה</h5>
                                            <button
                                                onClick={() => handleSelectAllForItem(item.id)}
                                                className="text-xs text-primary hover:underline"
                                            >
                                                {itemSelected.size === itemSuppliers.length ? 'בטל הכל' : 'בחר הכל'}
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {itemSuppliers.map((supplier) => {
                                                const isSelected = itemSelected.has(supplier.id);
                                                const isCurrentSupplier = item.supplierId === supplier.id;
                                                const currentMethod = itemMethods.get(supplier.id) || 'EMAIL';
                                                const primaryContact = supplier.contacts.find(c => c.isDefault) || supplier.contacts[0];
                                                const defaultMethod = primaryContact?.contactPreference || 'EMAIL';

                                                // Check if supplier has pricing for this product
                                                const hasPricing = item.product?.supplierPricings?.some(sp => sp.supplierId === supplier.id);

                                                return (
                                                    <div
                                                        key={supplier.id}
                                                        className={`p-3 border rounded-lg ${
                                                            isCurrentSupplier
                                                                ? 'border-blue-500 bg-blue-50'
                                                                : isSelected
                                                                    ? 'border-primary bg-primary/5'
                                                                    : 'border-slate-200 bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => handleSupplierToggle(item.id, supplier.id)}
                                                                className="mt-1 w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                                                            />
                                                            <div className="flex-1">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-semibold text-slate-900">
                                                                            {supplier.name}
                                                                        </span>
                                                                        {isCurrentSupplier && (
                                                                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                                                                ספק נבחר
                                                                            </span>
                                                                        )}
                                                                        {!hasPricing && (
                                                                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                                                                ללא מחיר
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Contact Method Selection */}
                                                                {isSelected && (
                                                                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-200">
                                                                        <span className="text-xs text-slate-600">דרך תקשורת:</span>
                                                                        <div className="flex gap-2">
                                                                            <button
                                                                                onClick={() => handleMethodChange(item.id, supplier.id, 'EMAIL')}
                                                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs transition-colors ${
                                                                                    currentMethod === 'EMAIL'
                                                                                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                                                                                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                                                                }`}
                                                                            >
                                                                                <EmailIcon className="w-3.5 h-3.5" />
                                                                                <span>Email</span>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleMethodChange(item.id, supplier.id, 'WHATSAPP')}
                                                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs transition-colors ${
                                                                                    currentMethod === 'WHATSAPP'
                                                                                        ? 'bg-green-50 border-green-500 text-green-700'
                                                                                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                                                                }`}
                                                                            >
                                                                                <WhatsAppIcon className="w-3.5 h-3.5" />
                                                                                <span>WhatsApp</span>
                                                                            </button>
                                                                        </div>
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
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                    <div className="text-sm text-slate-600">
                        {Array.from(selectedSuppliers.values()).reduce((sum, set) => sum + set.size, 0) > 0 && (
                            <span>
                                {Array.from(selectedSuppliers.values()).reduce((sum, set) => sum + set.size, 0)} ספקים נבחרו
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                        >
                            ביטול
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={Array.from(selectedSuppliers.values()).every(set => set.size === 0)}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <EmailIcon className="w-4 h-4" />
                            שלח לכל הנבחרים
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default SendOrderToSuppliersModal;
