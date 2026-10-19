import React, { useState, useEffect, useMemo } from 'react';
import { LineItem, Supplier, PriceListProduct, SupplierPricing, PriceTier, LineItemUnit } from '../types';
import { getProduct } from '../services/priceListService';
import Modal from './Modal';
import { EmailIcon, WhatsAppIcon } from './icons';

interface SendItemToSuppliersModalProps {
    isOpen: boolean;
    onClose: () => void;
    lineItem: LineItem;
    suppliers: Supplier[];
    onSend: (supplierIds: string[], methods: { supplierId: string; method: 'EMAIL' | 'WHATSAPP' }[]) => void;
}

// Helper function to calculate price/cost range from tiers
const calculatePriceRange = (
    baseValue: number | undefined, 
    tiers: PriceTier[] | undefined,
    field: 'price' | 'cost' = 'price'
): { min: number; max: number } | null => {
    if (!baseValue && (!tiers || tiers.length === 0)) {
        return null;
    }

    const values: number[] = [];
    
    if (baseValue) {
        values.push(baseValue);
    }

    if (tiers && tiers.length > 0) {
        tiers.forEach(tier => {
            const value = tier[field];
            if (value !== undefined && value !== null) {
                values.push(value);
            }
        });
    }

    if (values.length === 0) {
        return null;
    }

    return {
        min: Math.min(...values),
        max: Math.max(...values)
    };
};

// Tooltip component for supplier pricing (from PriceListPage)
const SupplierCostTooltip: React.FC<{
    pricing: SupplierPricing;
    baseUnit?: string;
}> = ({ pricing, baseUnit }) => {
    const [isHovered, setIsHovered] = useState(false);
    const range = calculatePriceRange(pricing.baseCost, pricing.priceTiers, 'cost');
    const sortedTiers = pricing.priceTiers ? [...pricing.priceTiers].sort((a, b) => a.min - b.min) : [];
    
    if (!range) {
        return <span className="text-slate-400">אין מחיר</span>;
    }

    const hasRange = range.min !== range.max;

    return (
        <div 
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex flex-col cursor-pointer hover:bg-slate-50 px-2 py-1 rounded transition-colors">
                {hasRange ? (
                    <span className="text-sm text-slate-600">
                        ₪{range.min.toLocaleString()}-₪{range.max.toLocaleString()}
                    </span>
                ) : (
                    <span className="text-sm text-slate-600">
                        ₪{range.min.toLocaleString()}
                    </span>
                )}
            </div>
            
            {isHovered && (pricing.baseCost !== undefined || sortedTiers.length > 0) && (
                <div className="absolute z-50 right-0 top-full mt-2 w-96 bg-white border border-slate-300 rounded-lg shadow-xl p-4 max-h-[600px] overflow-y-auto" dir="rtl">
                    <div className="space-y-4">
                        <div className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-2">
                            עלויות לפי טווחים
                        </div>
                        {pricing.baseCost !== undefined && (
                            <div className="border-b border-slate-100 pb-2 mb-2">
                                <div className="text-xs text-slate-500 mb-1">עלות בסיס</div>
                                <div className="font-semibold">
                                    ₪{pricing.baseCost.toLocaleString()} {baseUnit ? `ל${baseUnit}` : ''}
                                </div>
                            </div>
                        )}
                        {sortedTiers.length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-slate-600 mb-2">טווחי עלויות לפי כמות:</div>
                                <div className="space-y-1.5">
                                    {sortedTiers.map((tier, tierIdx) => (
                                        <div key={tierIdx} className="bg-slate-50 p-2 rounded text-xs">
                                            <div className="flex justify-between items-center">
                                                <span className="text-slate-600">
                                                    {tier.min} {baseUnit || 'יחידות'}
                                                    {tier.max !== undefined ? ` - ${tier.max} ${baseUnit || 'יחידות'}` : '+'}
                                                </span>
                                                <span className="font-semibold text-primary">
                                                    ₪{(tier.cost || 0).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const SendItemToSuppliersModal: React.FC<SendItemToSuppliersModalProps> = ({
    isOpen,
    onClose,
    lineItem,
    suppliers,
    onSend
}) => {
    const [product, setProduct] = useState<PriceListProduct | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
    const [contactMethods, setContactMethods] = useState<Map<string, 'EMAIL' | 'WHATSAPP'>>(new Map());

    // Get all suppliers that sell this product
    const productSuppliers = useMemo(() => {
        if (!product || !product.supplierPricings) return [];
        return product.supplierPricings.map(sp => {
            const supplier = suppliers.find(s => s.id === sp.supplierId);
            return {
                ...sp,
                supplier: supplier
            };
        });
    }, [product, suppliers]);

    // Get all suppliers (including those without pricing)
    const allSuppliers = useMemo(() => {
        const supplierIdsWithPricing = new Set(productSuppliers.map(sp => sp.supplierId));
        const suppliersWithoutPricing = suppliers
            .filter(s => !supplierIdsWithPricing.has(s.id))
            .map(s => ({
                supplierId: s.id,
                supplierName: s.name,
                supplier: s,
                baseCost: undefined,
                priceTiers: undefined
            }));
        
        return [...productSuppliers, ...suppliersWithoutPricing];
    }, [productSuppliers, suppliers]);

    useEffect(() => {
        if (isOpen && lineItem.priceListProductId) {
            loadProduct();
        } else if (isOpen) {
            setProduct(null);
            setSelectedSuppliers(new Set());
        }
    }, [isOpen, lineItem.priceListProductId]);

    useEffect(() => {
        if (product && isOpen) {
            // Pre-select the current supplier if exists
            if (lineItem.supplierId) {
                setSelectedSuppliers(new Set([lineItem.supplierId]));
            }
            
            // Initialize contact methods based on supplier preferences
            const methods = new Map<string, 'EMAIL' | 'WHATSAPP'>();
            suppliers.forEach(supplier => {
                const primaryContact = supplier.contacts.find(c => c.isDefault) || supplier.contacts[0];
                const preference = primaryContact?.contactPreference || 'EMAIL';
                methods.set(supplier.id, preference as 'EMAIL' | 'WHATSAPP');
            });
            setContactMethods(methods);
        }
    }, [product, isOpen, lineItem.supplierId, suppliers]);

    const loadProduct = async () => {
        if (!lineItem.priceListProductId) return;
        
        try {
            setLoading(true);
            const productData = await getProduct(lineItem.priceListProductId);
            setProduct(productData);
        } catch (error) {
            console.error('Error loading product:', error);
            alert('שגיאה בטעינת מוצר');
        } finally {
            setLoading(false);
        }
    };

    const handleSupplierToggle = (supplierId: string) => {
        const newSelected = new Set(selectedSuppliers);
        if (newSelected.has(supplierId)) {
            newSelected.delete(supplierId);
        } else {
            newSelected.add(supplierId);
        }
        setSelectedSuppliers(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedSuppliers.size === allSuppliers.length) {
            setSelectedSuppliers(new Set());
        } else {
            setSelectedSuppliers(new Set(allSuppliers.map(sp => sp.supplierId)));
        }
    };

    const handleMethodChange = (supplierId: string, method: 'EMAIL' | 'WHATSAPP') => {
        const newMethods = new Map(contactMethods);
        newMethods.set(supplierId, method);
        setContactMethods(newMethods);
    };

    const handleSend = () => {
        if (selectedSuppliers.size === 0) {
            alert('אנא בחר לפחות ספק אחד');
            return;
        }

        const methods = Array.from(selectedSuppliers).map(supplierId => ({
            supplierId,
            method: contactMethods.get(supplierId) || 'EMAIL'
        }));

        onSend(Array.from(selectedSuppliers), methods);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal title="שלח בקשה לספקים" onClose={onClose} size="4xl">
            <div className="space-y-6" dir="rtl">
                {/* Product Info */}
                {product && (
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="flex gap-4">
                            {product.images && product.images.length > 0 && (
                                <img
                                    src={product.images.find(img => img.isPrimary)?.dataUrl || product.images[0].dataUrl}
                                    alt={product.name}
                                    className="w-24 h-24 object-cover rounded"
                                />
                            )}
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-900">{product.name}</h3>
                                {product.category && (
                                    <p className="text-sm text-slate-500">{product.category}</p>
                                )}
                                <div className="mt-2 text-sm text-slate-700">
                                    <div>כמות: {lineItem.quantity}</div>
                                    {lineItem.width && lineItem.height && (
                                        <div>מידות: {lineItem.width} x {lineItem.height} {lineItem.unitType === LineItemUnit.M2 ? 'ס"מ' : ''}</div>
                                    )}
                                    <div>מחיר ללקוח: ₪{(lineItem.unitPrice * lineItem.quantity).toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-8">טוען...</div>
                ) : (
                    <>
                        {/* Suppliers List */}
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-lg font-semibold text-slate-800">בחר ספקים לשליחה</h4>
                                <button
                                    onClick={handleSelectAll}
                                    className="text-sm text-primary hover:underline"
                                >
                                    {selectedSuppliers.size === allSuppliers.length ? 'בטל הכל' : 'בחר הכל'}
                                </button>
                            </div>

                            <div className="space-y-3 max-h-96 overflow-y-auto border border-slate-200 rounded-lg p-4">
                                {allSuppliers.map((sp) => {
                                    const isSelected = selectedSuppliers.has(sp.supplierId);
                                    const isCurrentSupplier = lineItem.supplierId === sp.supplierId;
                                    const supplier = sp.supplier || suppliers.find(s => s.id === sp.supplierId);
                                    const primaryContact = supplier?.contacts.find(c => c.isDefault) || supplier?.contacts[0];
                                    const defaultMethod = primaryContact?.contactPreference || 'EMAIL';
                                    const currentMethod = contactMethods.get(sp.supplierId) || defaultMethod;

                                    return (
                                        <div
                                            key={sp.supplierId}
                                            className={`p-4 border rounded-lg ${
                                                isCurrentSupplier 
                                                    ? 'border-blue-500 bg-blue-50' 
                                                    : isSelected 
                                                        ? 'border-primary bg-primary/5' 
                                                        : 'border-slate-200 bg-white'
                                            }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleSupplierToggle(sp.supplierId)}
                                                    className="mt-1 w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-900">
                                                                {sp.supplierName || supplier?.name}
                                                            </span>
                                                            {isCurrentSupplier && (
                                                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                                                    ספק נבחר
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Pricing Info */}
                                                    {sp.baseCost !== undefined || sp.priceTiers ? (
                                                        <div className="mb-3">
                                                            <SupplierCostTooltip 
                                                                pricing={sp}
                                                                baseUnit={product?.baseUnit}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="mb-3 text-sm text-slate-500">
                                                            אין מחיר מוגדר
                                                        </div>
                                                    )}

                                                    {/* Contact Method Selection */}
                                                    {isSelected && supplier && (
                                                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200">
                                                            <span className="text-sm text-slate-600">דרך תקשורת:</span>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => handleMethodChange(sp.supplierId, 'EMAIL')}
                                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${
                                                                        currentMethod === 'EMAIL'
                                                                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                                                                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                                                    }`}
                                                                >
                                                                    <EmailIcon className="w-4 h-4" />
                                                                    <span className="text-sm">Email</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleMethodChange(sp.supplierId, 'WHATSAPP')}
                                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${
                                                                        currentMethod === 'WHATSAPP'
                                                                            ? 'bg-green-50 border-green-500 text-green-700'
                                                                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                                                    }`}
                                                                >
                                                                    <WhatsAppIcon className="w-4 h-4" />
                                                                    <span className="text-sm">WhatsApp</span>
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

                        {/* Actions */}
                        <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                            <div className="text-sm text-slate-600">
                                {selectedSuppliers.size > 0 && (
                                    <span>{selectedSuppliers.size} ספקים נבחרו</span>
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
                                    disabled={selectedSuppliers.size === 0}
                                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    שלח לכל הנבחרים ({selectedSuppliers.size})
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

export default SendItemToSuppliersModal;
