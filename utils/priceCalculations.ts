import { PriceListProduct, PriceTier, LineItemUnit, ProductAddon, SupplierPricing } from '../types';

/**
 * Calculates the price for a given value based on a set of price tiers.
 * @param basePrice The default price if no tier matches.
 * @param value The value (e.g., quantity or size) to check against the tiers.
 * @param tiers The array of price tiers.
 * @param tierField The field to use from the tier ('price' for customer, 'cost' for supplier).
 * @returns The calculated price from the matching tier, or the base price.
 */
function calculateTieredPrice(basePrice: number, value: number, tiers: PriceTier[], tierField: 'price' | 'cost'): number {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:11',message:'calculateTieredPrice entry',data:{basePrice,value,tiersCount:tiers?.length||0,tierField},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (!tiers || tiers.length === 0) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:14',message:'No tiers, returning basePrice',data:{basePrice},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return basePrice;
    }

    // Sort tiers by min value, ensuring stable order
    const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:19',message:'Sorted tiers',data:{firstTierMin:sortedTiers[0]?.min,lastTierMin:sortedTiers[sortedTiers.length-1]?.min,tiersCount:sortedTiers.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    // Find the best matching tier
    const matchingTier = sortedTiers.reduce((bestMatch: PriceTier | null, currentTier) => {
        // If the value is within the current tier's range
        if (value >= currentTier.min) {
            // If the current tier is a better match than the best match found so far
            if (!bestMatch || currentTier.min >= bestMatch.min) {
                return currentTier;
            }
        }
        return bestMatch;
    }, null);

    if (matchingTier) {
        // Check if the value also fits within the 'max' boundary if it exists
        if (matchingTier.max === undefined || matchingTier.max === null || value <= matchingTier.max) {
             const tieredValue = matchingTier[tierField];
             // #region agent log
             fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:35',message:'Found matching tier',data:{tieredValue,basePrice,min:matchingTier.min,max:matchingTier.max},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
             // #endregion
             // If the tier has a valid price/cost, return it. Otherwise, fall back to basePrice.
             return tieredValue !== undefined && tieredValue !== null ? tieredValue : basePrice;
        }
    }

    // No matching tier found - handle edge cases
    const firstTier = sortedTiers[0];
    const lastTier = sortedTiers[sortedTiers.length - 1];
    
    // If value is less than the minimum tier, use the first tier's price if basePrice is 0
    if (value < firstTier.min) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:47',message:'Value less than first tier',data:{value,firstTierMin:firstTier.min,basePrice},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        // If basePrice is 0 or undefined, use the first tier's price
        if (!basePrice || basePrice === 0) {
            const firstTierValue = firstTier[tierField];
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:51',message:'Using first tier (basePrice is 0)',data:{firstTierValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return firstTierValue !== undefined && firstTierValue !== null ? firstTierValue : basePrice;
        }
        return basePrice;
    }
    
    // Value is greater than all tiers - use the last (highest) tier's price
    if (value > (lastTier.max ?? Infinity)) {
        const lastTierValue = lastTier[tierField];
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:60',message:'Value greater than last tier',data:{lastTierValue,basePrice},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return lastTierValue !== undefined && lastTierValue !== null ? lastTierValue : basePrice;
    }

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:65',message:'No matching tier, returning basePrice',data:{basePrice,value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return basePrice;
}


/**
 * Calculates the final unit price and unit cost for a given product, quantity, and optional selections.
 * @param product The product from the price list.
 * @param quantity The number of units.
 * @param size Optional dimensions for area-based calculation.
 * @param selectedAddonIds Optional array of selected addon IDs.
 * @param supplierId Optional supplier ID to use for cost calculation (if not provided, uses first supplier)
 * @param variantId Optional variant ID to use for variant-specific pricing
 * @param unitType Optional unit type to use for calculation (if not provided, uses product.baseUnit)
 * @returns An object containing the calculated unitPrice and unitCost.
 */
export function calculateProductPrice(
    product: PriceListProduct,
    quantity: number,
    size?: { width?: number; height?: number },
    selectedAddonIds?: string[],
    supplierId?: string,
    variantId?: string,
    unitType?: LineItemUnit
): { unitPrice: number; unitCost: number } {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:75',message:'calculateProductPrice entry',data:{productId:product.id,productType:product.productType,quantity,sizeWidth:size?.width,sizeHeight:size?.height,variantId,unitType,baseUnit:product.baseUnit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    let unitPrice = 0;
    let unitCost = 0;

    // Handle variant pricing first if a variant is selected
    if (variantId && product.variants) {
        const selectedVariant = product.variants.find(v => v.id === variantId);
        if (selectedVariant) {
            unitPrice = selectedVariant.customerPrice;
            
            // Find variant cost from supplier pricing
            if (supplierId && product.supplierPricings) {
                const supplierPricing = product.supplierPricings.find(sp => sp.supplierId === supplierId);
                const variantCostEntry = supplierPricing?.variantCosts?.find(vc => vc.variantId === variantId);
                if (variantCostEntry) {
                    unitCost = variantCostEntry.cost;
                }
            }
            
            // If variant cost not found, try first supplier
            if (unitCost === 0 && product.supplierPricings && product.supplierPricings.length > 0) {
                const supplierPricing = product.supplierPricings[0];
                const variantCostEntry = supplierPricing?.variantCosts?.find(vc => vc.variantId === variantId);
                if (variantCostEntry) {
                    unitCost = variantCostEntry.cost;
                }
            }
        }
    }

    // If no variant selected or variant has no specific price/cost, calculate based on base/tiered pricing
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:115',message:'Before standard branch check',data:{unitPrice,productType:product.productType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    if (unitPrice === 0 && (product.productType === 'standard' || !product.productType)) {
        const effectiveUnitType = unitType || product.baseUnit;
        // If size is provided (width and height), use it for calculation (treat as M2)
        // This handles cases where user enters dimensions - always use width * height for M2 calculation
        const valueForTiers = size?.width && size?.height 
            ? size.width * size.height 
            : quantity;
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:119',message:'calculateProductPrice standard branch',data:{quantity,sizeWidth:size?.width,sizeHeight:size?.height,effectiveUnitType,valueForTiers,hasPriceRange:!!product.customerPriceRange,customerBasePrice:product.customerBasePrice,tiersCount:product.customerPriceTiers?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        // Check if product uses simple price range (customerPriceRange)
        if (product.customerPriceRange && product.customerPriceRange.min !== undefined) {
            unitPrice = product.customerPriceRange.min;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:125',message:'Using customerPriceRange',data:{unitPrice,priceRangeMin:product.customerPriceRange.min},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
        } else {
        // Calculate customer price
        unitPrice = calculateTieredPrice(
            product.customerBasePrice || 0,
            valueForTiers,
            product.customerPriceTiers || [],
            'price'
        );
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'priceCalculations.ts:133',message:'After calculateTieredPrice',data:{unitPrice,basePrice:product.customerBasePrice||0,valueForTiers},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
        }

        // Calculate supplier cost - use new structure if available, otherwise fall back to legacy
        if (unitCost === 0) {
        if (product.supplierPricings && product.supplierPricings.length > 0) {
            // Find the supplier pricing (by supplierId if provided, otherwise use first)
            let supplierPricing: SupplierPricing | undefined;
            if (supplierId) {
                supplierPricing = product.supplierPricings.find(sp => sp.supplierId === supplierId);
            }
            if (!supplierPricing) {
                supplierPricing = product.supplierPricings[0];
            }
            
            if (supplierPricing) {
                    // Check if supplier pricing uses simple cost range (costRange)
                    if (supplierPricing.costRange && supplierPricing.costRange.min !== undefined) {
                        unitCost = supplierPricing.costRange.min;
                    } else {
                unitCost = calculateTieredPrice(
                    supplierPricing.baseCost || 0,
                    valueForTiers,
                    supplierPricing.priceTiers || [],
                    'cost'
                );
                    }
            }
        } else {
            // Fallback to legacy structure for backward compatibility
        unitCost = calculateTieredPrice(
            product.supplierBaseCost || 0,
            valueForTiers,
            product.supplierPriceTiers || [],
            'cost'
        );
            }
        }

    } else if (unitPrice === 0 && product.productType === 'shipping') {
        // For shipping, we might not have a tiered price.
        // A simple approach is to use the average of the price range, or the min price.
        // This logic can be refined based on business rules.
        unitPrice = product.customerPriceRange?.min || 0;
        if (unitCost === 0) {
        unitCost = product.supplierCostRange?.min || 0;
        }
    }

    // --- Addon Calculation ---
    if (selectedAddonIds && product.addons) {
        let addonPrice = 0;
        let addonCost = 0;

        selectedAddonIds.forEach(addonId => {
            const addon = product.addons?.find(a => a.id === addonId);
            if (addon) {
                if (addon.isPercentage) {
                    addonPrice += unitPrice * (addon.price / 100);
                    if (addon.cost) {
                        addonCost += unitCost * (addon.cost / 100);
                    }
                } else {
                    addonPrice += addon.price;
                    if (addon.cost) {
                        addonCost += addon.cost;
                    }
                }
            }
        });
        
        unitPrice += addonPrice;
        unitCost += addonCost;
    }

    return { unitPrice, unitCost };
}

