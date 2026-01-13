import React, { useState, useEffect, useMemo } from 'react';
import { PriceListProduct, SalesHistoryEntry, AdHocProduct, Supplier, Attachment, PriceTier, SupplierPricing, ProductVariant } from '../types';
import { getProducts, getSalesHistory, getAdHocProducts, updateProduct, createProduct, deleteProduct } from '../services/priceListService';
import { PlusIcon, EditIcon, DeleteIcon, ImportIcon } from './icons';
import Modal from './Modal';
import EditProductModal from './EditProductModal';

interface PriceListPageProps {
    suppliers: Supplier[];
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

// Tooltip component for customer price with tiers
const CustomerPriceTooltip: React.FC<{
    basePrice?: number;
    tiers: PriceTier[];
    baseUnit?: string;
    minPrice: number;
    maxPrice: number;
    hasRange: boolean;
}> = ({ basePrice, tiers, baseUnit, minPrice, maxPrice, hasRange }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div 
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex flex-col cursor-pointer hover:bg-slate-50 px-2 py-1 rounded transition-colors">
                {basePrice && (
                    <span className="font-semibold text-primary">₪{basePrice.toLocaleString()}</span>
                )}
                {tiers.length > 0 && (
                    <span className="text-xs text-slate-600">
                        {basePrice ? '(' : ''}₪{minPrice.toLocaleString()}{hasRange ? `-₪${maxPrice.toLocaleString()}` : ''}{basePrice ? ')' : ''}
                    </span>
                )}
                {!basePrice && tiers.length === 0 && !hasRange && (
                    <span className="font-semibold text-primary">₪{minPrice.toLocaleString()}</span>
                )}
                {!basePrice && tiers.length === 0 && hasRange && (
                    <span className="font-semibold text-primary">₪{minPrice.toLocaleString()}-₪{maxPrice.toLocaleString()}</span>
                )}
            </div>
            
            {isHovered && (
                <div className="absolute z-50 right-0 top-full mt-2 w-96 bg-white border border-slate-300 rounded-lg shadow-xl p-4" dir="rtl">
                    <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-2">
                            מחירים לפי טווחים
                        </div>
                        {basePrice !== undefined && (
                            <div className="border-b border-slate-100 pb-2 mb-2">
                                <div className="text-xs text-slate-500 mb-1">מחיר בסיס</div>
                                <div className="font-semibold text-primary text-sm">
                                    ₪{basePrice.toLocaleString()} {baseUnit ? `ל${baseUnit}` : ''}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">יחול מחוץ לטווחים</div>
                            </div>
                        )}
                        {tiers.length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-slate-600 mb-2">טווחי מחירים לפי כמות:</div>
                                <div className="space-y-2">
                                    {tiers
                                        .sort((a, b) => a.min - b.min)
                                        .map((tier, idx) => (
                                            <div key={idx} className="bg-slate-50 p-2 rounded text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-slate-600">
                                                        {tier.min} {baseUnit || 'יחידות'}
                                                        {tier.max !== undefined ? ` - ${tier.max} ${baseUnit || 'יחידות'}` : '+'}
                                                    </span>
                                                    <span className="font-semibold text-primary">
                                                        ₪{tier.price.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                        <div className="pt-2 border-t border-slate-200 text-xs text-slate-500">
                            טווח כולל: ₪{minPrice.toLocaleString()}-₪{maxPrice.toLocaleString()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Tooltip component for multiple suppliers
const SupplierCostTooltip: React.FC<{
    pricings: SupplierPricing[];
    optionalSuppliers?: SupplierPricing[];
    overallMin: number;
    overallMax: number;
    hasRange: boolean;
    baseUnit?: string;
    variants?: ProductVariant[];
}> = ({ pricings, optionalSuppliers = [], overallMin, overallMax, hasRange, baseUnit, variants }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div 
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex flex-col cursor-pointer hover:bg-slate-50 px-2 py-1 rounded transition-colors">
                <span className="font-medium text-primary text-sm">
                    {pricings.length} ספקים
                </span>
                {hasRange ? (
                    <span className="text-xs text-slate-600">
                        ₪{overallMin.toLocaleString()}-₪{overallMax.toLocaleString()}
                    </span>
                ) : (
                    <span className="text-xs text-slate-600">
                        ₪{overallMin.toLocaleString()}
                    </span>
                )}
            </div>
            
            {isHovered && (
                <div className="absolute z-50 right-0 top-full mt-2 w-96 bg-white border border-slate-300 rounded-lg shadow-xl p-4 max-h-[600px] overflow-y-auto" dir="rtl">
                    <div className="space-y-4">
                        <div className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-2">
                            עלויות לפי ספק
                        </div>
                        {pricings.map((sp, idx) => {
                            const range = calculatePriceRange(sp.baseCost, sp.priceTiers, 'cost');
                            const sortedTiers = sp.priceTiers ? [...sp.priceTiers].sort((a, b) => a.min - b.min) : [];
                            const variantCosts = sp.variantCosts || [];
                            const costRange = sp.costRange;
                            const variantsMap = variants ? new Map(variants.map(v => [v.id, v])) : new Map();
                            
                            return (
                                <div key={idx} className="border-b border-slate-200 last:border-b-0 pb-4 last:pb-0">
                                    <div className="font-medium text-sm text-dark-text mb-2">{sp.supplierName}</div>
                                    <div className="text-sm text-slate-600 space-y-2">
                                        {sp.baseCost !== undefined && (
                                            <div className="bg-slate-50 p-2 rounded">
                                                <div className="text-xs text-slate-500 mb-1">עלות בסיס</div>
                                                <div className="font-semibold">
                                                    ₪{sp.baseCost.toLocaleString()} {baseUnit ? `ל${baseUnit}` : ''}
                                                </div>
                                            </div>
                                        )}
                                        {costRange && costRange.min !== undefined && costRange.max !== undefined && (
                                            <div className="bg-slate-50 p-2 rounded">
                                                <div className="text-xs text-slate-500 mb-1">טווח עלות</div>
                                                <div className="font-semibold">
                                                    ₪{costRange.min.toLocaleString()}-₪{costRange.max.toLocaleString()}
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
                                        {variantCosts.length > 0 && (
                                            <div>
                                                <div className="text-xs font-medium text-slate-600 mb-2">עלויות לפי תת-מוצר:</div>
                                                <div className="space-y-1.5">
                                                    {variantCosts.map((vc, vcIdx) => {
                                                        const variant = variantsMap.get(vc.variantId);
                                                        const variantName = variant 
                                                            ? (variant.name || (variant.width && variant.height ? `${variant.width}x${variant.height}` : variant.notes || 'תת-מוצר'))
                                                            : 'תת-מוצר';
                                                        return (
                                                            <div key={vcIdx} className="bg-slate-50 p-2 rounded text-xs">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-slate-600">{variantName}</span>
                                                                    <span className="font-semibold text-primary">
                                                                        ₪{vc.cost.toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        {range && range.min !== range.max && (
                                            <div className="text-xs text-slate-500 pt-1 border-t border-slate-100">
                                                טווח כולל: ₪{range.min.toLocaleString()}-₪{range.max.toLocaleString()}
                                            </div>
                                        )}
                                        {sp.baseCost === undefined && sortedTiers.length === 0 && variantCosts.length === 0 && !costRange && range && (
                                            <div>₪{range.min.toLocaleString()}</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {optionalSuppliers.length > 0 && (
                            <div className="border-t border-slate-300 pt-4 mt-4">
                                <div className="text-xs font-medium text-slate-600 mb-2">ספקים אופציונליים (ללא מחיר מוגדר):</div>
                                <div className="space-y-1.5">
                                    {optionalSuppliers.map((sp, idx) => (
                                        <div key={idx} className="bg-slate-100 p-2 rounded text-xs">
                                            <span className="text-slate-600">{sp.supplierName}</span>
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

// Image Lightbox component
const ImageLightbox: React.FC<{
    images: Attachment[];
    initialIndex: number;
    onClose: () => void;
}> = ({ images, initialIndex, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const currentImage = images[currentIndex];

    const handlePrevious = React.useCallback(() => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    }, [images.length]);

    const handleNext = React.useCallback(() => {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    }, [images.length]);

    const handleDownload = () => {
        if (!currentImage) return;
        const link = document.createElement('a');
        link.href = currentImage.dataUrl;
        link.download = currentImage.fileName || 'image.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    React.useEffect(() => {
        setCurrentIndex(initialIndex);
    }, [initialIndex]);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrevious();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNext, handlePrevious, onClose]);

    if (!currentImage) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center" dir="rtl">
            <button
                onClick={onClose}
                className="absolute top-4 left-4 text-white hover:text-gray-300 text-2xl z-10"
            >
                ✕
            </button>
            
            {images.length > 1 && (
                <>
                    <button
                        onClick={handlePrevious}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 text-4xl z-10"
                    >
                        ‹
                    </button>
                    <button
                        onClick={handleNext}
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 text-4xl z-10"
                    >
                        ›
                    </button>
                </>
            )}

            <div className="flex flex-col items-center max-w-[90vw] max-h-[90vh]">
                <img
                    src={currentImage.dataUrl}
                    alt={currentImage.fileName}
                    className="max-w-full max-h-[80vh] object-contain"
                />
                <div className="mt-4 flex items-center gap-4 text-white">
                    {images.length > 1 && (
                        <span className="text-sm">
                            {currentIndex + 1} / {images.length}
                        </span>
                    )}
                    <button
                        onClick={handleDownload}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                    >
                        הורד תמונה
                    </button>
                    {currentImage.fileName && (
                        <span className="text-sm text-gray-300">{currentImage.fileName}</span>
                    )}
                </div>
            </div>
        </div>
    );
};

// Tooltip component for product variants
const VariantPriceTooltip: React.FC<{
    variants: ProductVariant[];
    minPrice: number;
    maxPrice: number;
    hasRange: boolean;
    basePrice?: number;
    baseUnit?: string;
}> = ({ variants, minPrice, maxPrice, hasRange, basePrice, baseUnit }) => {
    const [isHovered, setIsHovered] = useState(false);
    
    // Filter only active variants
    const activeVariants = variants.filter(v => v.isActive !== false);

    return (
        <div 
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex flex-col cursor-pointer hover:bg-slate-50 px-2 py-1 rounded transition-colors">
                <span className="font-medium text-primary text-sm">
                    {activeVariants.length} תת-מוצרים
                    {basePrice !== undefined && ` + מחיר בסיס ₪${basePrice.toLocaleString()}`}
                </span>
                {hasRange ? (
                    <span className="text-xs text-slate-600">
                        ₪{minPrice.toLocaleString()}-₪{maxPrice.toLocaleString()}
                    </span>
                ) : (
                    <span className="text-xs text-slate-600">
                        ₪{minPrice.toLocaleString()}
                    </span>
                )}
            </div>
            
            {isHovered && (
                <div className="absolute z-50 right-0 top-full mt-2 w-80 bg-white border border-slate-300 rounded-lg shadow-xl p-4" dir="rtl">
                    <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-2">
                            מחירים לפי תת-מוצר{basePrice !== undefined ? ' ומחיר בסיס' : ''}
                        </div>
                        {basePrice !== undefined && (
                            <div className="border-b border-slate-200 pb-3 mb-3">
                                <div className="text-xs text-slate-500 mb-1">מחיר בסיס</div>
                                <div className="font-semibold text-primary text-sm">
                                    ₪{basePrice.toLocaleString()}{baseUnit ? ` ל${baseUnit}` : ''}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">יחול מחוץ לתת-מוצרים</div>
                            </div>
                        )}
                        {activeVariants.map((variant, idx) => {
                            const variantLabel = variant.name || 
                                (variant.width && variant.height ? `${variant.width}x${variant.height} ס״מ` : 
                                variant.width ? `רוחב: ${variant.width} ס״מ` :
                                variant.height ? `גובה: ${variant.height} ס״מ` :
                                `תת-מוצר ${idx + 1}`);
                            
                            return (
                                <div key={variant.id || idx} className="border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                                    <div className="font-medium text-sm text-dark-text mb-1">
                                        {variantLabel}
                                    </div>
                                    <div className="text-sm text-slate-600 space-y-1">
                                        {variant.notes && (
                                            <div className="text-xs text-slate-500">{variant.notes}</div>
                                        )}
                                        <div className="font-semibold text-primary">
                                            ₪{variant.customerPrice.toLocaleString()}
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
};

const PriceListPage: React.FC<PriceListPageProps> = ({ suppliers }) => {
    const [products, setProducts] = useState<PriceListProduct[]>([]);
    const [salesHistory, setSalesHistory] = useState<SalesHistoryEntry[]>([]);
    const [adHocProducts, setAdHocProducts] = useState<AdHocProduct[]>([]);
    const [activeTab, setActiveTab] = useState<'products' | 'history' | 'adHoc' | 'analytics'>('products');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<PriceListProduct | null>(null);
    const [lightboxImages, setLightboxImages] = useState<Attachment[]>([]);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [showLightbox, setShowLightbox] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [productsData, historyData, adHocData] = await Promise.all([
                getProducts(),
                getSalesHistory(),
                getAdHocProducts()
            ]);
            setProducts(productsData);
            setSalesHistory(historyData);
            setAdHocProducts(adHocData);
        } catch (error) {
            console.error('Error loading price list data:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            const matchesSearch = !searchQuery || 
                product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                product.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                product.description?.toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesCategory = !categoryFilter || product.category === categoryFilter;
            
            // Note: Supplier filter was removed as it depended on the old data structure.
            // It can be re-added based on a new logic if needed.
            
            return matchesSearch && matchesCategory;
        });
    }, [products, searchQuery, categoryFilter]);

    const categories = useMemo(() => {
        const cats = new Set<string>();
        products.forEach(p => {
            if (p.category) cats.add(p.category);
        });
        return Array.from(cats).sort();
    }, [products]);
    
    // Helper function to calculate price range including variantCosts and costRange
    const calculateSupplierPriceRange = (sp: SupplierPricing, productVariants?: ProductVariant[]): { min: number; max: number } | null => {
        const baseCost = sp.baseCost;
        const tiers = sp.priceTiers || [];
        const variantCosts = sp.variantCosts || [];
        const costRange = sp.costRange;
        
        // Calculate range from base cost and tiers
        const range = calculatePriceRange(baseCost, tiers, 'cost');
        
        // Add variant costs to the range
        const variantCostValues = variantCosts.map(vc => vc.cost).filter(c => c > 0);
        
        // If we have costRange, use it
        if (costRange && costRange.min !== undefined && costRange.max !== undefined) {
            const allCosts: number[] = [costRange.min, costRange.max];
            if (range) {
                allCosts.push(range.min, range.max);
            } else if (baseCost !== undefined) {
                allCosts.push(baseCost);
            }
            allCosts.push(...variantCostValues);
            return {
                min: Math.min(...allCosts),
                max: Math.max(...allCosts)
            };
        }
        
        if (variantCostValues.length === 0 && !range && baseCost === undefined) {
            return null;
        }
        
        const allCosts: number[] = [];
        if (range) {
            allCosts.push(range.min, range.max);
        } else if (baseCost !== undefined) {
            allCosts.push(baseCost);
        }
        allCosts.push(...variantCostValues);
        
        if (allCosts.length === 0) {
            return null;
        }
        
        return {
            min: Math.min(...allCosts),
            max: Math.max(...allCosts)
        };
    };
    
    // Helper function for displaying supplier costs (supports multiple suppliers)
    const formatSupplierCost = (product: PriceListProduct): React.ReactNode => {
        if (product.productType === 'shipping') {
            const { min = 0, max = 0 } = product.supplierCostRange || {};
            return (
                <div className="flex flex-col">
                    <span className="font-medium">₪{min}-₪{max}</span>
                    <span className="text-xs text-slate-500">טווח עלות</span>
                </div>
            );
        }
        
        // New structure: supplierPricings array
        if (product.supplierPricings && product.supplierPricings.length > 0) {
            // Separate suppliers with prices from optional suppliers (without prices)
            const activePricings = product.supplierPricings.filter(sp => {
                const hasBaseCost = sp.baseCost !== undefined;
                const hasTiers = (sp.priceTiers?.length || 0) > 0;
                const hasVariantCosts = (sp.variantCosts?.length || 0) > 0;
                const hasCostRange = sp.costRange && sp.costRange.min !== undefined && sp.costRange.max !== undefined;
                return hasBaseCost || hasTiers || hasVariantCosts || hasCostRange;
            });
            
            const optionalSuppliers = product.supplierPricings.filter(sp => {
                const hasBaseCost = sp.baseCost !== undefined;
                const hasTiers = (sp.priceTiers?.length || 0) > 0;
                const hasVariantCosts = (sp.variantCosts?.length || 0) > 0;
                const hasCostRange = sp.costRange && sp.costRange.min !== undefined && sp.costRange.max !== undefined;
                return !hasBaseCost && !hasTiers && !hasVariantCosts && !hasCostRange;
            });
            
            if (activePricings.length === 0 && optionalSuppliers.length === 0) {
                return <span className="text-slate-400">אין מחיר</span>;
            }
            
            // If we have optional suppliers but no active pricings, show optional suppliers
            if (activePricings.length === 0 && optionalSuppliers.length > 0) {
                return (
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500 mb-1">ספקים אופציונליים</span>
                        <span className="font-medium text-sm text-slate-600">
                            {optionalSuppliers.map(s => s.supplierName).join(', ')}
                        </span>
                    </div>
                );
            }

            if (activePricings.length === 1) {
                const sp = activePricings[0];
                const baseCost = sp.baseCost;
                const tiers = sp.priceTiers || [];
                const variantCosts = sp.variantCosts || [];
                const costRange = sp.costRange;
                const range = calculateSupplierPriceRange(sp, product.variants);
                
                if (!range) {
                    // If no range but we have optional suppliers, show them
                    if (optionalSuppliers.length > 0) {
                        return (
                            <div className="flex flex-col">
                                <span className="text-xs text-slate-500 mb-1">ספקים אופציונליים</span>
                                <span className="font-medium text-sm text-slate-600">
                                    {optionalSuppliers.map(s => s.supplierName).join(', ')}
                                </span>
                            </div>
                        );
                    }
                    return <span className="text-slate-400">אין מחיר</span>;
                }

                const hasRange = range.min !== range.max;
                const hasTiers = tiers.length > 0;
                const hasVariantCosts = variantCosts.length > 0;
                const hasCostRange = costRange && costRange.min !== undefined && costRange.max !== undefined;
                
                // If has tiers, variantCosts, or costRange, show tooltip with details
                if ((hasTiers || hasVariantCosts || hasCostRange) && (hasRange || baseCost !== undefined || variantCosts.length > 0 || costRange)) {
                    return (
                        <SupplierCostTooltip 
                            pricings={[sp]}
                            optionalSuppliers={optionalSuppliers}
                            overallMin={range.min}
                            overallMax={range.max}
                            hasRange={hasRange}
                            baseUnit={product.baseUnit}
                            variants={product.variants}
                        />
                    );
                }
                
                // Simple display for single price without tiers, variantCosts, or costRange
                return (
                    <div className="flex flex-col">
                        <span className="font-medium text-sm">{sp.supplierName}</span>
                        {baseCost !== undefined && (
                            <span className="text-sm">₪{baseCost.toLocaleString()}</span>
                        )}
                        {baseCost !== undefined && variantCosts.length > 0 && (
                            <span className="text-xs text-slate-500 mt-1">
                                + {variantCosts.length} תת-מוצרים (₪{range.min.toLocaleString()}-₪{range.max.toLocaleString()})
                            </span>
                        )}
                        {!baseCost && variantCosts.length > 0 && (
                            <span className="text-sm">₪{range.min.toLocaleString()}{hasRange ? `-₪${range.max.toLocaleString()}` : ''}</span>
                        )}
                        {!baseCost && variantCosts.length === 0 && costRange && (
                            <span className="text-sm">₪{costRange.min.toLocaleString()}-₪{costRange.max.toLocaleString()}</span>
                        )}
                        {!baseCost && variantCosts.length === 0 && !costRange && range && (
                            <span className="text-sm">₪{range.min.toLocaleString()}</span>
                        )}
                        {optionalSuppliers.length > 0 && (
                            <span className="text-xs text-slate-500 mt-1">
                                + {optionalSuppliers.length} ספק{optionalSuppliers.length > 1 ? 'ים' : ''} אופציונלי{optionalSuppliers.length > 1 ? 'ים' : ''}
                            </span>
                        )}
                    </div>
                );
            }

            // Multiple suppliers - show compact with tooltip
            const allRanges = activePricings
                .map(sp => calculateSupplierPriceRange(sp, product.variants))
                .filter((r): r is { min: number; max: number } => r !== null);
            
            if (allRanges.length === 0) {
                // If no ranges but we have optional suppliers, show them
                if (optionalSuppliers.length > 0) {
                    return (
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-500 mb-1">ספקים אופציונליים</span>
                            <span className="font-medium text-sm text-slate-600">
                                {optionalSuppliers.map(s => s.supplierName).join(', ')}
                            </span>
                        </div>
                    );
                }
                return <span className="text-slate-400">אין מחיר</span>;
            }

            const overallMin = Math.min(...allRanges.map(r => r.min));
            const overallMax = Math.max(...allRanges.map(r => r.max));
            const hasOverallRange = overallMin !== overallMax;

            return (
                <SupplierCostTooltip 
                    pricings={activePricings}
                    optionalSuppliers={optionalSuppliers}
                    overallMin={overallMin}
                    overallMax={overallMax}
                    hasRange={hasOverallRange}
                    baseUnit={product.baseUnit}
                    variants={product.variants}
                />
            );
        }
        
        return <span className="text-slate-400">אין מחיר</span>;
    };

    // Helper function for displaying customer price with range
    const formatCustomerPrice = (product: PriceListProduct): React.ReactNode => {
        // Check if product uses simple price range (for both shipping and standard types)
        if (product.customerPriceRange && product.customerPriceRange.min !== undefined && product.customerPriceRange.max !== undefined) {
            const { min, max } = product.customerPriceRange;
            return (
                <div className="flex flex-col">
                    <span className="font-semibold text-primary">₪{min.toLocaleString()}-₪{max.toLocaleString()}</span>
                    <span className="text-xs text-slate-500">טווח מחיר</span>
                </div>
            );
        }
        
        if (product.productType === 'shipping') {
            return <span className="text-slate-400">אין מחיר</span>;
        }
        
        const basePrice = product.customerBasePrice;
        const tiers = product.customerPriceTiers || [];
        const variants = product.variants || [];
        
        // Filter active variants
        const activeVariants = variants.filter(v => v.isActive !== false);
        
        // Check if product has variants but no base price
        const hasVariantsOnly = !basePrice && tiers.length === 0 && activeVariants.length > 0;
        
        if (hasVariantsOnly) {
            // Calculate range from variants
            const variantPrices = activeVariants.map(v => v.customerPrice).filter(p => p > 0);
            if (variantPrices.length === 0) {
                return <span className="text-slate-400">אין מחיר</span>;
            }
            
            const minVariantPrice = Math.min(...variantPrices);
            const maxVariantPrice = Math.max(...variantPrices);
            const hasRange = minVariantPrice !== maxVariantPrice;
            
            // If only one variant or all same price, show simple display
            if (activeVariants.length === 1 || !hasRange) {
                return (
                    <div className="flex flex-col">
                        <span className="font-semibold text-primary">₪{minVariantPrice.toLocaleString()}</span>
                        {activeVariants.length > 1 && !hasRange && (
                            <span className="text-xs text-slate-500">{activeVariants.length} תת-מוצרים (מחיר אחיד)</span>
                        )}
                    </div>
                );
            }
            
            // Multiple variants with different prices - show tooltip
            return (
                <VariantPriceTooltip 
                    variants={activeVariants}
                    minPrice={minVariantPrice}
                    maxPrice={maxVariantPrice}
                    hasRange={hasRange}
                />
            );
        }
        
        // Regular pricing logic (base price and/or tiers)
        const range = calculatePriceRange(basePrice, tiers, 'price');
        
        if (!range && activeVariants.length === 0) {
            return <span className="text-slate-400">אין מחיר</span>;
        }

        // If we have variants, check if we should show tooltip
        if (activeVariants.length > 0) {
            const variantPrices = activeVariants.map(v => v.customerPrice).filter(p => p > 0);
            if (variantPrices.length > 0) {
                // Combine base price/tiers with variants to get overall range
                const allPrices: number[] = [...variantPrices];
                if (range) {
                    allPrices.push(range.min, range.max);
        } else if (basePrice) {
                    allPrices.push(basePrice);
                }
                
                if (allPrices.length > 0) {
                    const overallMin = Math.min(...allPrices);
                    const overallMax = Math.max(...allPrices);
                    const hasOverallRange = overallMin !== overallMax;
                    
                    // Show tooltip if there's a range or multiple variants or basePrice exists
                    if (hasOverallRange || activeVariants.length > 1 || basePrice !== undefined) {
                        return (
                            <VariantPriceTooltip 
                                variants={activeVariants}
                                minPrice={overallMin}
                                maxPrice={overallMax}
                                hasRange={hasOverallRange}
                                basePrice={basePrice}
                                baseUnit={product.baseUnit}
                            />
                        );
                    }
                }
            }
        }

        // Calculate final range including basePrice if it extends beyond tiers
        let finalMin = range.min;
        let finalMax = range.max;
        let finalHasRange = range.min !== range.max;
        
        if (basePrice !== undefined && tiers.length > 0) {
            // If we have both basePrice and tiers, include basePrice in range calculation
            finalMin = Math.min(range.min, basePrice);
            finalMax = Math.max(range.max, basePrice);
            finalHasRange = finalMin !== finalMax;
        }
        
        // If there's no range and no basePrice, show error
        if (!range && !basePrice) {
            return <span className="text-slate-400">אין מחיר</span>;
        }
        
        // Show tooltip if we have tiers (always show when tiers exist, even if basePrice extends the range)
        if (tiers.length > 0) {
            return (
                <CustomerPriceTooltip
                    basePrice={basePrice}
                    tiers={tiers}
                    baseUnit={product.baseUnit}
                    minPrice={finalMin}
                    maxPrice={finalMax}
                    hasRange={finalHasRange}
                />
            );
        }
        
        // Simple display for single basePrice without tiers
        if (basePrice && tiers.length === 0) {
            return (
                <div className="flex flex-col">
                    <span className="font-semibold text-primary">₪{basePrice.toLocaleString()}</span>
                </div>
            );
        }
        
        // Fallback - should not reach here
        return <span className="text-slate-400">אין מחיר</span>;
    };

    const handleEditProduct = (product: PriceListProduct) => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    const handleAddProduct = () => {
        setEditingProduct(null);
        setIsModalOpen(true);
    };

    const handleSaveProduct = async (product: PriceListProduct) => {
        try {
            if (editingProduct) {
                await updateProduct(product);
            } else {
                await createProduct(product);
            }
            await loadData();
            setIsModalOpen(false);
            setEditingProduct(null);
        } catch (error) {
            console.error('Error saving product:', error);
            alert('שגיאה בשמירת המוצר');
        }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק את המוצר הזה?')) {
            return;
        }
        try {
            await deleteProduct(id);
            await loadData();
        } catch (error) {
            console.error('Error deleting product:', error);
            alert('שגיאה במחיקת המוצר');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-slate-600">טוען מחירון...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-light-bg min-h-screen" dir="rtl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-dark-text mb-2">מחירון</h1>
                <p className="text-slate-600">ניהול מחירון מוצרים, היסטוריית מכירות וניתוחים</p>
            </div>

            {/* Tabs */}
            <div className="mb-6 border-b border-slate-200">
                <div className="flex space-x-reverse space-x-4">
                    <button
                        onClick={() => setActiveTab('products')}
                        className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                            activeTab === 'products'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        מחירון
                    </button>
                    {/* Other tabs remain unchanged */}
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                            activeTab === 'history'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        היסטוריית מכירות
                    </button>
                    <button
                        onClick={() => setActiveTab('adHoc')}
                        className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                            activeTab === 'adHoc'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        מוצרים מזדמנים
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                            activeTab === 'analytics'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        ניתוחים
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'products' && (
                <div>
                    {/* Filters and Actions */}
                    <div className="mb-6 flex flex-wrap gap-4 items-center">
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="חיפוש מוצרים..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                        </div>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                            <option value="">כל הקטגוריות</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <button className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2">
                            <ImportIcon className="h-5 w-5" />
                            ייבוא מ-CSV
                        </button>
                        <button 
                            onClick={handleAddProduct}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark flex items-center gap-2"
                        >
                            <PlusIcon className="h-5 w-5" />
                            הוסף מוצר
                        </button>
                    </div>

                    {/* Products Table */}
                    <div className="bg-white rounded-lg shadow-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">תמונה</th>
                                        <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">שם מוצר</th>
                                        <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">קטגוריה</th>
                                        <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">תיאור</th>
                                        <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">עלות ספק</th>
                                        <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">מחיר לקוח</th>
                                        <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">פעולות</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                        {filteredProducts.map(product => (
                                            <tr key={product.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4">
                                                    {product.images && product.images.length > 0 ? (
                                                        <div className="relative">
                                        <img 
                                                                src={product.images.find(img => img.isPrimary)?.dataUrl || product.images[0].dataUrl} 
                                            alt={product.name}
                                                                className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                                                onClick={() => {
                                                                    setLightboxImages(product.images || []);
                                                                    const primaryIndex = product.images.findIndex(img => img.isPrimary);
                                                                    setLightboxIndex(primaryIndex >= 0 ? primaryIndex : 0);
                                                                    setShowLightbox(true);
                                                                }}
                                                            />
                                                            {product.images.length > 1 && (
                                                                <div className="absolute -top-1 -right-1 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                                                    {product.images.length}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center">
                                                            <span className="text-slate-400 text-xs">אין תמונה</span>
                                    </div>
                                )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-dark-text">{product.name}</div>
                                                    <div className="text-xs text-slate-500">{product.productType === 'shipping' ? 'משלוח' : product.baseUnit}</div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600">
                                                    {product.category || '-'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600">
                                                    <span className="truncate block max-w-[200px]" title={product.description}>
                                                        {product.description || '-'}
                                                </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-700">
                                                    {formatSupplierCost(product)}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                                                    {formatCustomerPrice(product)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2 justify-end">
                                                        <button 
                                                            onClick={() => handleEditProduct(product)}
                                                            className="p-2 text-slate-600 hover:text-primary"
                                                        >
                                                            <EditIcon className="h-5 w-5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteProduct(product.id)}
                                                            className="p-2 text-slate-600 hover:text-red-600"
                                                        >
                                                            <DeleteIcon className="h-5 w-5" />
                                                        </button>
                                        </div>
                                                </td>
                                            </tr>
                                        )
                                )}
                    {filteredProducts.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                            <p>לא נמצאו מוצרים</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div>
                    {/* Unchanged */}
                </div>
            )}

            {activeTab === 'adHoc' && (
                <div>
                    {/* Unchanged */}
                </div>
            )}

            {activeTab === 'analytics' && (
                <div>
                    {/* Unchanged */}
                </div>
            )}

            {/* Product Edit Modal */}
            {isModalOpen && (
                <EditProductModal 
                    product={editingProduct}
                    suppliers={suppliers}
                    onSave={handleSaveProduct}
                    onClose={() => {
                        setIsModalOpen(false);
                        setEditingProduct(null);
                    }}
                />
            )}

            {/* Image Lightbox */}
            {showLightbox && (
                <ImageLightbox
                    images={lightboxImages}
                    initialIndex={lightboxIndex}
                    onClose={() => setShowLightbox(false)}
                />
            )}
        </div>
    );
};

export default PriceListPage;

