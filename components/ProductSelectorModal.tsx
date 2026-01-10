import React, { useState, useEffect, useMemo } from 'react';
import { PriceListProduct, Supplier, LineItemUnit } from '../types';
import { getProducts } from '../services/priceListService';
import { sendPriceListEmail } from '../services/priceListService';
import { calculateProductPrice } from '../utils/priceCalculations';
import Modal from './Modal';

interface ProductSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (product: PriceListProduct, supplierId: string, quantity: number, size?: { width?: number; height?: number }, selectedAddons?: string[]) => void;
    suppliers: Supplier[];
    orderId?: string;
    orderNumber?: string;
    orderStatus?: string;
}

const ProductSelectorModal: React.FC<ProductSelectorModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    suppliers,
    orderId,
    orderNumber,
    orderStatus
}) => {
    const [products, setProducts] = useState<PriceListProduct[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<PriceListProduct | null>(null);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [quantity, setQuantity] = useState<number>(1);
    const [width, setWidth] = useState<number>(0);
    const [height, setHeight] = useState<number>(0);
    const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadProducts();
        }
    }, [isOpen]);

    const loadProducts = async () => {
        try {
            setLoading(true);
            const data = await getProducts();
            setProducts(data.filter(p => p.isActive));
        } catch (error) {
            console.error('Error loading products:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = useMemo(() => {
        if (!searchQuery) return products;
        return products.filter(p =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [products, searchQuery]);

    const selectedSupplierPrice = useMemo(() => {
        if (!selectedProduct || !selectedSupplierId) return null;
        return selectedProduct.supplierPrices.find(sp => sp.supplierId === selectedSupplierId && sp.isActive);
    }, [selectedProduct, selectedSupplierId]);

    const calculatedPrice = useMemo(() => {
        if (!selectedProduct || !selectedSupplierId || !selectedSupplierPrice) return null;
        
        try {
            const size = selectedProduct.baseUnit === LineItemUnit.M2 && width > 0 && height > 0
                ? { width, height }
                : undefined;
            
            return calculateProductPrice(
                selectedProduct,
                quantity,
                size,
                selectedAddons,
                selectedSupplierId
            );
        } catch (error) {
            console.error('Error calculating price:', error);
            return null;
        }
    }, [selectedProduct, selectedSupplierId, quantity, width, height, selectedAddons]);

    const handleProductSelect = (product: PriceListProduct) => {
        setSelectedProduct(product);
        setSelectedSupplierId(product.defaultSupplierId || '');
        setQuantity(1);
        setWidth(0);
        setHeight(0);
        setSelectedAddons([]);
    };

    const handleAddonToggle = (addonId: string) => {
        setSelectedAddons(prev =>
            prev.includes(addonId)
                ? prev.filter(id => id !== addonId)
                : [...prev, addonId]
        );
    };

    const handleSave = () => {
        if (!selectedProduct || !selectedSupplierId) return;
        
        const size = selectedProduct.baseUnit === LineItemUnit.M2 && width > 0 && height > 0
            ? { width, height }
            : undefined;
        
        onSelect(selectedProduct, selectedSupplierId, quantity, size, selectedAddons);
        onClose();
    };

    const handleSendEmail = async () => {
        if (!selectedProduct || !selectedSupplierId || !orderId || !orderNumber) return;
        
        try {
            setSendingEmail(true);
            const emailType = orderStatus === 'טיוטה' || orderStatus === 'הצעת מחיר' ? 'quote' : 'order';
            await sendPriceListEmail(orderId, [selectedSupplierId], emailType);
            alert('מייל נשלח בהצלחה לספק');
        } catch (error) {
            console.error('Error sending email:', error);
            alert('שגיאה בשליחת מייל');
        } finally {
            setSendingEmail(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="בחר מוצר מהמחירון">
            <div className="space-y-6" dir="rtl">
                {/* Search */}
                <div>
                    <input
                        type="text"
                        placeholder="חיפוש מוצרים..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                </div>

                {!selectedProduct ? (
                    /* Products Grid */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="col-span-full text-center py-8">טוען...</div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="col-span-full text-center py-8 text-slate-500">לא נמצאו מוצרים</div>
                        ) : (
                            filteredProducts.map(product => (
                                <div
                                    key={product.id}
                                    onClick={() => handleProductSelect(product)}
                                    className="bg-white border border-slate-200 rounded-lg p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all"
                                >
                                    {product.images && product.images.length > 0 && (
                                        <img
                                            src={product.images[0].dataUrl}
                                            alt={product.name}
                                            className="w-full h-32 object-cover rounded-lg mb-3"
                                        />
                                    )}
                                    <h3 className="font-bold text-lg mb-1">{product.name}</h3>
                                    {product.category && (
                                        <p className="text-sm text-slate-500 mb-2">{product.category}</p>
                                    )}
                                    {product.description && (
                                        <p className="text-sm text-slate-600 line-clamp-2">{product.description}</p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    /* Product Details */
                    <div className="space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-bold">{selectedProduct.name}</h3>
                                {selectedProduct.category && (
                                    <p className="text-slate-500">{selectedProduct.category}</p>
                                )}
                            </div>
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="text-slate-600 hover:text-slate-900"
                            >
                                חזרה לרשימה
                            </button>
                        </div>

                        {selectedProduct.images && selectedProduct.images.length > 0 && (
                            <div className="grid grid-cols-2 gap-4">
                                {selectedProduct.images.map(img => (
                                    <img
                                        key={img.id}
                                        src={img.dataUrl}
                                        alt={selectedProduct.name}
                                        className="w-full h-48 object-cover rounded-lg"
                                    />
                                ))}
                            </div>
                        )}

                        {selectedProduct.description && (
                            <p className="text-slate-600">{selectedProduct.description}</p>
                        )}

                        {/* Supplier Selection */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">בחר ספק:</label>
                            <select
                                value={selectedSupplierId}
                                onChange={(e) => setSelectedSupplierId(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                            >
                                <option value="">בחר ספק</option>
                                {selectedProduct.supplierPrices
                                    .filter(sp => sp.isActive)
                                    .map(sp => {
                                        const supplier = suppliers.find(s => s.id === sp.supplierId);
                                        return (
                                            <option key={sp.supplierId} value={sp.supplierId}>
                                                {supplier?.name || sp.supplierName} - ₪{sp.baseCost.toLocaleString()}
                                            </option>
                                        );
                                    })}
                            </select>
                        </div>

                        {selectedSupplierPrice && (
                            <>
                                {/* Quantity/Size Input */}
                                {selectedProduct.baseUnit === LineItemUnit.M2 ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">רוחב (מ"ר):</label>
                                            <input
                                                type="number"
                                                value={width || ''}
                                                onChange={(e) => setWidth(parseFloat(e.target.value) || 0)}
                                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">גובה (מ"ר):</label>
                                            <input
                                                type="number"
                                                value={height || ''}
                                                onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
                                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">כמות:</label>
                                        <input
                                            type="number"
                                            value={quantity}
                                            onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                                            min="1"
                                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                        />
                                    </div>
                                )}

                                {/* Addons */}
                                {selectedProduct.addons && selectedProduct.addons.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">תוספות:</label>
                                        <div className="space-y-2">
                                            {selectedProduct.addons.map(addon => (
                                                <label key={addon.id} className="flex items-center space-x-reverse space-x-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedAddons.includes(addon.id)}
                                                        onChange={() => handleAddonToggle(addon.id)}
                                                        className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                                                    />
                                                    <span>{addon.name} (+₪{addon.price.toLocaleString()})</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Price Preview */}
                                {calculatedPrice && (
                                    <div className="bg-slate-50 rounded-lg p-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-medium">מחיר ליחידה:</span>
                                            <span className="font-bold">₪{calculatedPrice.unitPrice.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-medium">עלות ליחידה:</span>
                                            <span className="font-bold">₪{calculatedPrice.cost.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-slate-300 pt-2 mt-2">
                                            <span className="font-bold text-lg">סה"כ:</span>
                                            <span className="font-bold text-lg text-primary">₪{calculatedPrice.totalPrice.toLocaleString()}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-4 pt-4">
                                    {orderId && orderNumber && (
                                        <button
                                            onClick={handleSendEmail}
                                            disabled={sendingEmail}
                                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {sendingEmail ? 'שולח...' : 'שלח לספק'}
                                        </button>
                                    )}
                                    <button
                                        onClick={handleSave}
                                        className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
                                    >
                                        שמור
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                                    >
                                        ביטול
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ProductSelectorModal;

