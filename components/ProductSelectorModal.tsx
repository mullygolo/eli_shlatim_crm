import React, { useState, useEffect, useMemo } from 'react';
import { PriceListProduct, Supplier, LineItemUnit, PriceTier, SupplierPricing, ProductVariant } from '../types';
import { getProducts } from '../services/priceListService';
import { calculateProductPrice } from '../utils/priceCalculations';
import Modal from './Modal';

interface ProductSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (product: PriceListProduct, supplierId: string, quantity: number, size?: { width?: number; height?: number }, selectedAddons?: string[], variantId?: string, description?: string, unitType?: LineItemUnit, notes?: string) => void;
    suppliers: Supplier[];
    orderId?: string;
    orderNumber?: string;
    orderStatus?: string;
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

// Tooltip component for customer price with tiers (from PriceListPage)
const CustomerPriceTooltip: React.FC<{
    basePrice?: number;
    tiers: PriceTier[];
    baseUnit?: string;
    minPrice: number;
    maxPrice: number;
    hasRange: boolean;
}> = ({ basePrice, tiers, baseUnit, minPrice, maxPrice, hasRange }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            setHideTimeout(null);
        }
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        const timeout = setTimeout(() => {
            setIsHovered(false);
        }, 300); // 300ms delay before hiding
        setHideTimeout(timeout);
    };

    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
        };
    }, [hideTimeout]);

    return (
        <div 
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="flex flex-col cursor-pointer hover:bg-slate-50 px-2 py-1 rounded transition-colors">
                {basePrice && (
                    <span className="font-semibold text-primary">₪{basePrice.toLocaleString()}</span>
                )}
                {hasRange && (
                    <span className="text-xs text-slate-600">
                        ₪{minPrice.toLocaleString()}-₪{maxPrice.toLocaleString()}
                    </span>
                )}
                {!basePrice && !hasRange && (
                    <span className="font-semibold text-primary">₪{minPrice.toLocaleString()}</span>
                )}
            </div>
            
            {isHovered && (
                <div 
                    className="absolute z-50 right-0 top-full mt-2 w-96 bg-white border border-slate-300 rounded-lg shadow-xl p-4" 
                    dir="rtl"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    style={{ maxWidth: 'calc(100vw - 2rem)' }}
                >
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

// Tooltip component for product variants (from PriceListPage)
const VariantPriceTooltip: React.FC<{
    variants: ProductVariant[];
    minPrice: number;
    maxPrice: number;
    hasRange: boolean;
    basePrice?: number;
    baseUnit?: string;
}> = ({ variants, minPrice, maxPrice, hasRange, basePrice, baseUnit }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);
    
    const activeVariants = variants.filter(v => v.isActive !== false);

    const handleMouseEnter = () => {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            setHideTimeout(null);
        }
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        const timeout = setTimeout(() => {
            setIsHovered(false);
        }, 300); // 300ms delay before hiding
        setHideTimeout(timeout);
    };

    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
        };
    }, [hideTimeout]);

    return (
        <div 
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
                <div 
                    className="absolute z-50 right-0 top-full mt-2 w-80 bg-white border border-slate-300 rounded-lg shadow-xl p-4" 
                    dir="rtl"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    style={{ maxWidth: 'calc(100vw - 2rem)' }}
                >
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

// Helper function to format customer price (simplified version from PriceListPage)
const formatCustomerPrice = (product: PriceListProduct): React.ReactNode => {
    if (product.productType === 'shipping') {
        const { min = 0, max = 0 } = product.customerPriceRange || {};
        return (
            <div className="flex flex-col">
                <span className="font-semibold text-primary">₪{min}-₪{max}</span>
                <span className="text-xs text-slate-500">טווח מחיר</span>
            </div>
        );
    }
    
    const basePrice = product.customerBasePrice;
    const tiers = product.customerPriceTiers || [];
    const variants = product.variants || [];
    
    const activeVariants = variants.filter(v => v.isActive !== false);
    const hasVariantsOnly = !basePrice && tiers.length === 0 && activeVariants.length > 0;
    
    if (hasVariantsOnly) {
        const variantPrices = activeVariants.map(v => v.customerPrice).filter(p => p > 0);
        if (variantPrices.length === 0) {
            return <span className="text-slate-400">אין מחיר</span>;
        }
        
        const minVariantPrice = Math.min(...variantPrices);
        const maxVariantPrice = Math.max(...variantPrices);
        const hasRange = minVariantPrice !== maxVariantPrice;
        
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
        
        return (
            <VariantPriceTooltip 
                variants={activeVariants}
                minPrice={minVariantPrice}
                maxPrice={maxVariantPrice}
                hasRange={hasRange}
            />
        );
    }
    
    const range = calculatePriceRange(basePrice, tiers, 'price');
    
    if (!range && activeVariants.length === 0) {
        return <span className="text-slate-400">אין מחיר</span>;
    }

    if (activeVariants.length > 0) {
        const variantPrices = activeVariants.map(v => v.customerPrice).filter(p => p > 0);
        if (variantPrices.length > 0) {
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

    if (tiers.length === 0 && basePrice && range) {
        return (
            <div className="flex flex-col">
                <span className="font-semibold text-primary">₪{basePrice.toLocaleString()}</span>
            </div>
        );
    }

    if (!range) {
        return <span className="text-slate-400">אין מחיר</span>;
    }
    
    const hasRange = range.min !== range.max;
    
    if ((basePrice && tiers.length > 0) || (tiers.length > 0 && hasRange)) {
        return (
            <CustomerPriceTooltip
                basePrice={basePrice}
                tiers={tiers}
                baseUnit={product.baseUnit}
                minPrice={range.min}
                maxPrice={range.max}
                hasRange={hasRange}
            />
        );
    }
    
    return (
        <div className="flex flex-col">
            {basePrice && (
                <span className="font-semibold text-primary">₪{basePrice.toLocaleString()}</span>
            )}
            {hasRange && !basePrice && (
                <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs font-medium text-primary">₪{range.min.toLocaleString()}-₪{range.max.toLocaleString()}</span>
                    <span className="text-xs text-slate-500">לפי כמות</span>
                </div>
            )}
            {!basePrice && !hasRange && (
                <span className="font-semibold text-primary">₪{range.min.toLocaleString()}</span>
            )}
        </div>
    );
};

// Tooltip component for supplier costs (from PriceListPage)
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
    const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            setHideTimeout(null);
        }
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        const timeout = setTimeout(() => {
            setIsHovered(false);
        }, 300); // 300ms delay before hiding
        setHideTimeout(timeout);
    };

    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
        };
    }, [hideTimeout]);

    return (
        <div 
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
                <div 
                    className="absolute z-50 right-0 top-full mt-2 w-96 bg-white border border-slate-300 rounded-lg shadow-xl p-4 max-h-[600px] overflow-y-auto" 
                    dir="rtl"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    style={{ maxWidth: 'calc(100vw - 2rem)' }}
                >
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
                                    <div className="font-medium text-sm text-slate-900 mb-2">{sp.supplierName}</div>
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

interface SelectedProduct {
    selectedItemId: string; // Unique ID for each instance
    productId: string;
    supplierId: string;
    quantity: number;
    size?: { width?: number; height?: number };
    selectedAddons?: string[];
    variantId?: string;
    description?: string;
    unitType?: LineItemUnit;
    width?: number;
    height?: number;
    notes?: string; // Notes for this item
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
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    
    // State for multiple product selection - Map of productId to array of instances
    const [selectedProducts, setSelectedProducts] = useState<Map<string, SelectedProduct[]>>(new Map());
    const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
    // State for expanded price/supplier details rows
    const [expandedDetails, setExpandedDetails] = useState<Map<string, Set<'price' | 'supplier'>>>(new Map());

    useEffect(() => {
        if (isOpen) {
            loadProducts();
            setSelectedProducts(new Map());
            setExpandedProductIds(new Set());
            setExpandedDetails(new Map());
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

    // Calculate total number of instances
    const totalInstances = useMemo(() => {
        let count = 0;
        selectedProducts.forEach(instances => {
            count += instances.length;
        });
        return count;
    }, [selectedProducts]);

    // Helper function to calculate supplier price range including variantCosts and costRange
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
        
        if (!product.supplierPricings || product.supplierPricings.length === 0) {
            return <span className="text-slate-400">אין מחיר</span>;
        }

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
            const range = calculateSupplierPriceRange(sp, product.variants);
            
            if (!range) {
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
            const hasTiers = (sp.priceTiers?.length || 0) > 0;
            const hasVariantCosts = (sp.variantCosts?.length || 0) > 0;
            const hasCostRange = sp.costRange && sp.costRange.min !== undefined && sp.costRange.max !== undefined;
            
            // If has tiers, variantCosts, or costRange, show tooltip with details
            if ((hasTiers || hasVariantCosts || hasCostRange) && (hasRange || sp.baseCost !== undefined || hasVariantCosts || hasCostRange)) {
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
                    {sp.baseCost !== undefined && (
                        <span className="text-sm">₪{sp.baseCost.toLocaleString()}</span>
                    )}
                    {sp.baseCost !== undefined && variantCosts.length > 0 && (
                        <span className="text-xs text-slate-500 mt-1">
                            + {variantCosts.length} תת-מוצרים (₪{range.min.toLocaleString()}-₪{range.max.toLocaleString()})
                        </span>
                    )}
                    {!sp.baseCost && variantCosts.length > 0 && (
                        <span className="text-sm">₪{range.min.toLocaleString()}{hasRange ? `-₪${range.max.toLocaleString()}` : ''}</span>
                    )}
                    {!sp.baseCost && variantCosts.length === 0 && costRange && (
                        <span className="text-sm">₪{costRange.min.toLocaleString()}-₪{costRange.max.toLocaleString()}</span>
                    )}
                    {!sp.baseCost && variantCosts.length === 0 && !costRange && range && (
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
    };

    // Get available suppliers for a product
    const getAvailableSuppliers = (product: PriceListProduct): SupplierPricing[] => {
        if (!product.supplierPricings || product.supplierPricings.length === 0) {
            return [];
        }
        return product.supplierPricings.filter(sp => 
            sp.baseCost !== undefined || (sp.priceTiers?.length || 0) > 0 || (sp.variantCosts?.length || 0) > 0 || (sp.costRange && sp.costRange.min !== undefined)
        );
    };

    // Get supplier cost range for display
    const getSupplierCostRange = (pricing: SupplierPricing): { min: number; max: number } | null => {
        return calculatePriceRange(pricing.baseCost, pricing.priceTiers, 'cost');
    };

    // Handle product selection checkbox
    const handleProductCheckboxChange = (productId: string, checked: boolean) => {
        const newSelected = new Map(selectedProducts);
        if (checked) {
            const product = products.find(p => p.id === productId);
            if (product) {
                const availableSuppliers = getAvailableSuppliers(product);
                const defaultSupplierId = availableSuppliers[0]?.supplierId || '';
                const selectedItemId = `${productId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                newSelected.set(productId, [{
                    selectedItemId,
                    productId,
                    supplierId: defaultSupplierId,
                    quantity: 0,
                    description: product.name,
                    unitType: product.baseUnit || LineItemUnit.UNIT
                }]);
                // Auto-expand when selecting
                const newExpanded = new Set(expandedProductIds);
                newExpanded.add(productId);
                setExpandedProductIds(newExpanded);
            }
        } else {
            newSelected.delete(productId);
            // Auto-collapse when deselecting
            const newExpanded = new Set(expandedProductIds);
            newExpanded.delete(productId);
            setExpandedProductIds(newExpanded);
        }
        setSelectedProducts(newSelected);
    };

    // Helper function to update a specific instance in the array
    const updateInstance = (productId: string, selectedItemId: string, updater: (instance: SelectedProduct) => SelectedProduct) => {
        const newSelected = new Map(selectedProducts);
        const instances = newSelected.get(productId);
        if (instances) {
            const updatedInstances = instances.map(instance => 
                instance.selectedItemId === selectedItemId ? updater(instance) : instance
            );
            newSelected.set(productId, updatedInstances);
            setSelectedProducts(newSelected);
        }
    };

    // Handle supplier selection for a product instance
    const handleSupplierChange = (productId: string, selectedItemId: string, supplierId: string) => {
        updateInstance(productId, selectedItemId, (instance) => ({ ...instance, supplierId }));
    };

    // Handle quantity change for a product instance
    const handleQuantityChange = (productId: string, selectedItemId: string, quantity: number) => {
        updateInstance(productId, selectedItemId, (instance) => ({ ...instance, quantity: Math.max(0, quantity) }));
    };

    // Toggle expanded row
    const toggleExpanded = (productId: string) => {
        const newExpanded = new Set(expandedProductIds);
        if (newExpanded.has(productId)) {
            newExpanded.delete(productId);
        } else {
            newExpanded.add(productId);
        }
        setExpandedProductIds(newExpanded);
    };

    // Toggle expanded details row (price/supplier)
    const toggleDetailsExpanded = (productId: string, type: 'price' | 'supplier') => {
        setExpandedDetails(prev => {
            const newDetails = new Map(prev);
            const currentSet = newDetails.get(productId) || new Set<'price' | 'supplier'>();
            const newSet = new Set(currentSet);
            
            if (newSet.has(type)) {
                newSet.delete(type);
            } else {
                newSet.add(type);
            }
            
            if (newSet.size === 0) {
                newDetails.delete(productId);
            } else {
                newDetails.set(productId, newSet);
            }
            
            return newDetails;
        });
    };

    // Handle variant change for a product instance
    const handleVariantChange = (productId: string, selectedItemId: string, variantId: string) => {
        const product = products.find(p => p.id === productId);
        if (product) {
            const variant = product.variants?.find(v => v.id === variantId);
            const description = variant 
                ? `${product.name}${variant.name ? ` - ${variant.name}` : ''}`
                : product.name;
            updateInstance(productId, selectedItemId, (instance) => ({
                ...instance,
                variantId,
                description,
                width: variant?.width,
                height: variant?.height,
                // If selecting a variant and quantity is 0, set it to 1
                quantity: variantId && instance.quantity === 0 ? 1 : instance.quantity
            }));
        }
    };

    // Handle size change for a product instance
    const handleSizeChange = (productId: string, selectedItemId: string, width?: number, height?: number) => {
        updateInstance(productId, selectedItemId, (instance) => {
            // If width and height are provided, set unitType to M2 automatically
            const newUnitType = (width && height) ? LineItemUnit.M2 : instance.unitType;
            const newQuantity = newUnitType === LineItemUnit.M2 && width && height
                ? (width * height) || 0
                : instance.quantity;
            return {
                ...instance,
                width,
                height,
                unitType: newUnitType,
                quantity: newQuantity
            };
        });
    };

    // Handle description change for a product instance
    const handleDescriptionChange = (productId: string, selectedItemId: string, description: string) => {
        updateInstance(productId, selectedItemId, (instance) => ({ ...instance, description }));
    };

    const handleNotesChange = (productId: string, selectedItemId: string, notes: string) => {
        updateInstance(productId, selectedItemId, (instance) => ({ ...instance, notes }));
    };

    // Handle unit type change for a product instance
    const handleUnitTypeChange = (productId: string, selectedItemId: string, unitType: LineItemUnit) => {
        updateInstance(productId, selectedItemId, (instance) => {
            // Reset width/height and quantity if switching to/from M2
            if (unitType === LineItemUnit.M2) {
                return {
                    ...instance,
                    unitType,
                    quantity: (instance.width || 0) * (instance.height || 0) || 0
                };
            } else {
                return {
                    ...instance,
                    unitType,
                    width: undefined,
                    height: undefined,
                    quantity: instance.quantity || 0
                };
            }
        });
    };

    // Handle add another instance
    const handleAddAnotherInstance = (productId: string) => {
        const newSelected = new Map(selectedProducts);
        const instances = newSelected.get(productId);
        const product = products.find(p => p.id === productId);
        if (instances && product) {
            const availableSuppliers = getAvailableSuppliers(product);
            const defaultSupplierId = availableSuppliers[0]?.supplierId || '';
            const selectedItemId = `${productId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newInstance: SelectedProduct = {
                selectedItemId,
                productId,
                supplierId: defaultSupplierId,
                quantity: 0,
                description: product.name,
                unitType: product.baseUnit || LineItemUnit.UNIT
            };
            newSelected.set(productId, [...instances, newInstance]);
            setSelectedProducts(newSelected);
        }
    };

    // Handle remove instance
    const handleRemoveInstance = (productId: string, selectedItemId: string) => {
        const newSelected = new Map(selectedProducts);
        const instances = newSelected.get(productId);
        if (instances) {
            const filteredInstances = instances.filter(instance => instance.selectedItemId !== selectedItemId);
            if (filteredInstances.length === 0) {
                // If this was the last instance, remove the product and uncheck checkbox
                newSelected.delete(productId);
                const newExpanded = new Set(expandedProductIds);
                newExpanded.delete(productId);
                setExpandedProductIds(newExpanded);
            } else {
                newSelected.set(productId, filteredInstances);
            }
            setSelectedProducts(newSelected);
        }
    };

    // Handle add to order
    const handleAddToOrder = () => {
        selectedProducts.forEach((instances, productId) => {
            const product = products.find(p => p.id === productId);
            if (product) {
                instances.forEach(selected => {
                    if (selected.quantity > 0) {
                        const size = selected.width && selected.height ? { width: selected.width, height: selected.height } : undefined;
                        onSelect(
                            product,
                            selected.supplierId || '',
                            selected.quantity,
                            size,
                            undefined, // addons not in use
                            selected.variantId,
                            selected.description,
                            selected.unitType,
                            selected.notes
                        );
                    }
                });
            }
        });
        setSelectedProducts(new Map());
        setExpandedProductIds(new Set());
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="בחר מוצרים מהמחירון" size="5xl">
            <div className="space-y-4" dir="rtl">
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

                {/* Products Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-12">
                                        <input
                                            type="checkbox"
                                            checked={filteredProducts.length > 0 && filteredProducts.every(p => {
                                                const instances = selectedProducts.get(p.id);
                                                return instances !== undefined && instances.length > 0;
                                            })}
                                            onChange={(e) => {
                                                filteredProducts.forEach(p => {
                                                    handleProductCheckboxChange(p.id, e.target.checked);
                                                });
                                            }}
                                            className="rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-16">תמונה</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">שם מוצר</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-40">מחיר ללקוח</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-48">ספק</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-32">כמות</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-40">מחיר מחושב</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                            טוען...
                                        </td>
                                    </tr>
                                ) : filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                            לא נמצאו מוצרים
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProducts.map(product => {
                                        const instances = selectedProducts.get(product.id);
                                        const isSelected = instances !== undefined && instances.length > 0;
                                        const selected = instances?.[0]; // Use first instance for table display
                                        const availableSuppliers = getAvailableSuppliers(product);
                                        const isExpanded = expandedProductIds.has(product.id);
                                        const detailsExpanded = expandedDetails.get(product.id) || new Set<'price' | 'supplier'>();
                                        const isPriceExpanded = detailsExpanded.has('price');
                                        const isSupplierExpanded = detailsExpanded.has('supplier');
                                        
                                        // Calculate price for all instances (sum them up for table display)
                                        let calculatedPrice: { unitPrice: number; unitCost: number } | null = null;
                                        let totalPrice = 0;
                                        let totalCost = 0;
                                        if (isSelected && instances && instances.length > 0) {
                                            instances.forEach(instance => {
                                                const size = instance.width && instance.height ? { width: instance.width, height: instance.height } : undefined;
                                                const price = calculateProductPrice(
                                                    product,
                                                    instance.quantity || 0,
                                                    size,
                                                    undefined, // addons not in use
                                                    instance.supplierId || undefined,
                                                    instance.variantId,
                                                    instance.unitType
                                                );
                                                // Sum up total price and cost
                                                totalPrice += price.unitPrice * (instance.quantity || 0);
                                                totalCost += price.unitCost * (instance.quantity || 0);
                                            });
                                            calculatedPrice = {
                                                unitPrice: totalPrice,
                                                unitCost: totalCost
                                            };
                                        }
                                        
                                        return (
                                            <React.Fragment key={product.id}>
                                            <tr className={isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => handleProductCheckboxChange(product.id, e.target.checked)}
                                                            className="rounded border-slate-300 text-primary focus:ring-primary"
                                                        />
                                                        {isSelected && (
                            <button
                                                                type="button"
                                                                onClick={() => toggleExpanded(product.id)}
                                                                className="p-1 hover:bg-slate-200 rounded transition-colors"
                                                                title={isExpanded ? "סגור פרטים" : "פתח פרטים"}
                                                            >
                                                                <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                </svg>
                            </button>
                                                        )}
                        </div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {product.images && product.images.length > 0 ? (
                                                        <img
                                                            src={product.images.find(img => img.isPrimary)?.dataUrl || product.images[0].dataUrl}
                                                            alt={product.name}
                                                            className="w-12 h-12 object-cover rounded"
                                    />
                                                    ) : (
                                                        <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center">
                                                            <span className="text-slate-400 text-xs">אין</span>
                            </div>
                        )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-900">{product.name}</div>
                                                    {product.category && (
                                                        <div className="text-sm text-slate-500">{product.category}</div>
                        )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div 
                                                        className="cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleDetailsExpanded(product.id, 'price');
                                                        }}
                                                        title="לחץ להרחבה/סגירה"
                                                    >
                                                        {formatCustomerPrice(product)}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isSelected && selected ? (
                            <select
                                                            value={selected.supplierId || ''}
                                                            onChange={(e) => handleSupplierChange(product.id, selected.selectedItemId, e.target.value)}
                                                            className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                            >
                                <option value="">בחר ספק</option>
                                                            {availableSuppliers.map(sp => {
                                        const supplier = suppliers.find(s => s.id === sp.supplierId);
                                                                const range = getSupplierCostRange(sp);
                                        return (
                                            <option key={sp.supplierId} value={sp.supplierId}>
                                                                        {supplier?.name || sp.supplierName}
                                                                        {range && ` (₪${range.min.toLocaleString()}${range.min !== range.max ? `-₪${range.max.toLocaleString()}` : ''})`}
                                            </option>
                                        );
                                    })}
                            </select>
                                                    ) : (
                                                        <div 
                                                            className="cursor-pointer"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleDetailsExpanded(product.id, 'supplier');
                                                            }}
                                                            title="לחץ להרחבה/סגירה"
                                                        >
                                                            {formatSupplierCost(product)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isSelected && selected ? (
                                            <input
                                                type="number"
                                            min="0"
                                                            value={selected.quantity ?? ''}
                                                            onChange={(e) => handleQuantityChange(product.id, selected.selectedItemId, parseFloat(e.target.value) || 0)}
                                                            className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                                                        />
                                                    ) : (
                                                        <span className="text-sm text-slate-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {calculatedPrice && calculatedPrice.unitPrice > 0 ? (
                                                        <div className="flex flex-col">
                                                            <div className="text-sm font-medium text-slate-900">
                                                                ₪{calculatedPrice.unitPrice.toLocaleString()}
                                                            </div>
                                                            {calculatedPrice.unitCost > 0 && (
                                                                <div className="text-xs text-slate-500">
                                                                    עלות: ₪{calculatedPrice.unitCost.toLocaleString()}
                                    </div>
                                )}
                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-slate-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                            {/* Expanded price details row */}
                                            {isPriceExpanded && (
                                                <tr className="bg-blue-50">
                                                    <td colSpan={7} className="px-4 py-4">
                                                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                                                            <div className="flex justify-between items-center mb-3">
                                                                <h4 className="text-sm font-semibold text-slate-700">פרטי מחיר ללקוח</h4>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleDetailsExpanded(product.id, 'price')}
                                                                    className="text-slate-600 hover:text-slate-800 text-sm"
                                                                >
                                                                    ✕ סגור
                                                                </button>
                                                            </div>
                                                            {(() => {
                                                                const basePrice = product.customerBasePrice;
                                                                const tiers = product.customerPriceTiers || [];
                                                                const variants = product.variants || [];
                                                                const activeVariants = variants.filter(v => v.isActive !== false);
                                                                const range = calculatePriceRange(basePrice, tiers, 'price');
                                                                
                                                                return (
                                                                    <div className="space-y-3">
                                                                        {basePrice !== undefined && (
                                                                            <div className="border-b border-slate-100 pb-2 mb-2">
                                                                                <div className="text-xs text-slate-500 mb-1">מחיר בסיס</div>
                                                                                <div className="font-semibold text-primary text-sm">
                                                                                    ₪{basePrice.toLocaleString()} {product.baseUnit ? `ל${product.baseUnit}` : ''}
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
                                                                                                        {tier.min} {product.baseUnit || 'יחידות'}
                                                                                                        {tier.max !== undefined ? ` - ${tier.max} ${product.baseUnit || 'יחידות'}` : '+'}
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
                                                                        {activeVariants.length > 0 && (
                                                                            <div>
                                                                                <div className="text-xs font-medium text-slate-600 mb-2">מחירים לפי תת-מוצר:</div>
                                                                                <div className="space-y-2">
                                                                                    {activeVariants.map((variant, idx) => {
                                                                                        const variantLabel = variant.name || 
                                                                                            (variant.width && variant.height ? `${variant.width}x${variant.height} ס״מ` : 
                                                                                            variant.width ? `רוחב: ${variant.width} ס״מ` :
                                                                                            variant.height ? `גובה: ${variant.height} ס״מ` :
                                                                                            `תת-מוצר ${idx + 1}`);
                                                                                        return (
                                                                                            <div key={variant.id || idx} className="bg-slate-50 p-2 rounded text-sm">
                                                                                                <div className="font-medium text-dark-text mb-1">{variantLabel}</div>
                                                                                                {variant.notes && (
                                                                                                    <div className="text-xs text-slate-500 mb-1">{variant.notes}</div>
                                                                                                )}
                                                                                                <div className="font-semibold text-primary">
                                                                                                    ₪{variant.customerPrice.toLocaleString()}
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {range && (
                                                                            <div className="pt-2 border-t border-slate-200 text-xs text-slate-500">
                                                                                טווח כולל: ₪{range.min.toLocaleString()}-₪{range.max.toLocaleString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            {/* Expanded supplier details row */}
                                            {isSupplierExpanded && (
                                                <tr className="bg-green-50">
                                                    <td colSpan={7} className="px-4 py-4">
                                                        <div className="bg-white border border-slate-200 rounded-lg p-4">
                                                            <div className="flex justify-between items-center mb-3">
                                                                <h4 className="text-sm font-semibold text-slate-700">פרטי ספקים ועלויות</h4>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleDetailsExpanded(product.id, 'supplier')}
                                                                    className="text-slate-600 hover:text-slate-800 text-sm"
                                                                >
                                                                    ✕ סגור
                                                                </button>
                                                            </div>
                                                            {(() => {
                                                                if (!product.supplierPricings || product.supplierPricings.length === 0) {
                                                                    return <span className="text-slate-400">אין מחיר</span>;
                                                                }
                                                                
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
                                                                
                                                                return (
                                                                    <div className="space-y-4">
                                                                        {activePricings.map((sp, idx) => {
                                                                            const range = calculatePriceRange(sp.baseCost, sp.priceTiers, 'cost');
                                                                            const sortedTiers = sp.priceTiers ? [...sp.priceTiers].sort((a, b) => a.min - b.min) : [];
                                                                            const variantCosts = sp.variantCosts || [];
                                                                            const costRange = sp.costRange;
                                                                            const variantsMap = product.variants ? new Map(product.variants.map(v => [v.id, v])) : new Map();
                                                                            
                                                                            return (
                                                                                <div key={idx} className="border-b border-slate-200 last:border-b-0 pb-4 last:pb-0">
                                                                                    <div className="font-medium text-sm text-slate-900 mb-2">{sp.supplierName}</div>
                                                                                    <div className="text-sm text-slate-600 space-y-2">
                                                                                        {sp.baseCost !== undefined && (
                                                                                            <div className="bg-slate-50 p-2 rounded">
                                                                                                <div className="text-xs text-slate-500 mb-1">עלות בסיס</div>
                                                                                                <div className="font-semibold">
                                                                                                    ₪{sp.baseCost.toLocaleString()} {product.baseUnit ? `ל${product.baseUnit}` : ''}
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
                                                                                                                    {tier.min} {product.baseUnit || 'יחידות'}
                                                                                                                    {tier.max !== undefined ? ` - ${tier.max} ${product.baseUnit || 'יחידות'}` : '+'}
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
                                                                );
                                                            })()}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            {isSelected && isExpanded && instances && instances.length > 0 && (
                                                <tr className="bg-slate-50">
                                                    <td colSpan={7} className="px-4 py-4">
                                                        <div className="space-y-4">
                                                            {instances.map((instance, index) => (
                                                                <div key={instance.selectedItemId} className="border border-slate-200 rounded-lg p-4 bg-white">
                                                                    <div className="flex justify-between items-center mb-3">
                                                                        <h4 className="text-sm font-semibold text-slate-700">מוצר #{index + 1}</h4>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveInstance(product.id, instance.selectedItemId)}
                                                                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                                                                        >
                                                                            מחק
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                                        {/* Variant Selection */}
                                                                        {product.variants && product.variants.length > 0 && (
                                                                            <div>
                                                                                <label className="block text-sm font-medium text-slate-700 mb-1">תת-מוצר</label>
                                                                                <select
                                                                                    value={instance.variantId || ''}
                                                                                    onChange={(e) => handleVariantChange(product.id, instance.selectedItemId, e.target.value)}
                                                                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                                                >
                                                                                    <option value="">בחר תת-מוצר</option>
                                                                                    {product.variants.filter(v => v.isActive).map(variant => (
                                                                                        <option key={variant.id} value={variant.id}>
                                                                                            {variant.name || (variant.width && variant.height ? `${variant.width}x${variant.height}` : variant.notes || 'תת-מוצר')}
                                                                                            {variant.customerPrice > 0 && ` (₪${variant.customerPrice.toLocaleString()})`}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                        )}

                                                                        {/* Description */}
                                                                        <div>
                                                                            <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
                                                                            <input
                                                                                type="text"
                                                                                value={instance.description || ''}
                                                                                onChange={(e) => handleDescriptionChange(product.id, instance.selectedItemId, e.target.value)}
                                                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                                                placeholder="תיאור הפריט"
                                                                            />
                                                                        </div>
                                                                        
                                                                        {/* Notes */}
                                                                        <div className="md:col-span-2 lg:col-span-3">
                                                                            <label className="block text-sm font-medium text-slate-700 mb-1">הערה</label>
                                                                            <textarea
                                                                                value={instance.notes || ''}
                                                                                onChange={(e) => handleNotesChange(product.id, instance.selectedItemId, e.target.value)}
                                                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                                                placeholder="הערות לפריט זה"
                                                                                rows={2}
                                                                            />
                                                                        </div>
                                                                        
                                                                        {/* Unit Type */}
                                                                        <div>
                                                                            <label className="block text-sm font-medium text-slate-700 mb-1">יחידת מידה</label>
                                                                            <select
                                                                                value={instance.unitType || LineItemUnit.UNIT}
                                                                                onChange={(e) => handleUnitTypeChange(product.id, instance.selectedItemId, e.target.value as LineItemUnit)}
                                                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                                            >
                                                                                {Object.values(LineItemUnit).map(unit => (
                                                                                    <option key={unit} value={unit}>{unit}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        
                                                                        {/* Width (for M2) */}
                                                                        {instance.unitType === LineItemUnit.M2 && (
                                        <div>
                                                                                <label className="block text-sm font-medium text-slate-700 mb-1">רוחב</label>
                                            <input
                                                type="number"
                                                                                    min="0"
                                                                                    step="0.01"
                                                                                    value={instance.width || ''}
                                                                                    onChange={(e) => handleSizeChange(product.id, instance.selectedItemId, parseFloat(e.target.value) || undefined, instance.height)}
                                                                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                                                    placeholder="0"
                                            />
                                        </div>
                                                                        )}
                                                                        
                                                                        {/* Height (for M2) */}
                                                                        {instance.unitType === LineItemUnit.M2 && (
                                    <div>
                                                                                <label className="block text-sm font-medium text-slate-700 mb-1">גובה</label>
                                        <input
                                            type="number"
                                                                                    min="0"
                                                                                    step="0.01"
                                                                                    value={instance.height || ''}
                                                                                    onChange={(e) => handleSizeChange(product.id, instance.selectedItemId, instance.width, parseFloat(e.target.value) || undefined)}
                                                                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                                                    placeholder="0"
                                        />
                                    </div>
                                )}

                                                                        {/* Quantity (if not M2) */}
                                                                        {instance.unitType !== LineItemUnit.M2 && (
                                    <div>
                                                                                <label className="block text-sm font-medium text-slate-700 mb-1">כמות</label>
                                                    <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    value={instance.quantity ?? ''}
                                                                                    onChange={(e) => handleQuantityChange(product.id, instance.selectedItemId, parseFloat(e.target.value) || 0)}
                                                                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            <div className="flex justify-center pt-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAddAnotherInstance(product.id)}
                                                                    className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
                                                                >
                                                                    ➕ הוסף עוד
                                                                </button>
                                        </div>
                                    </div>
                                                    </td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                                        </div>
                                    </div>

                                {/* Actions */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                    <div className="text-sm text-slate-600">
                        {totalInstances > 0 && (
                            <span>{totalInstances} פריט{totalInstances > 1 ? 'ים' : ''} נבחר{totalInstances > 1 ? 'ו' : ''}</span>
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
                            onClick={handleAddToOrder}
                            disabled={totalInstances === 0}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            הוסף להזמנה ({totalInstances})
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ProductSelectorModal;
