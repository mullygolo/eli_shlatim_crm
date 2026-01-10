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
    if (!tiers || tiers.length === 0) {
        return basePrice;
    }

    // Sort tiers by min value, ensuring stable order
    const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);

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
             // If the tier has a valid price/cost, return it. Otherwise, fall back to basePrice.
             return tieredValue !== undefined && tieredValue !== null ? tieredValue : basePrice;
        }
    }

    return basePrice;
}


/**
 * Calculates the final unit price and unit cost for a given product, quantity, and optional selections.
 * @param product The product from the price list.
 * @param quantity The number of units.
 * @param size Optional dimensions for area-based calculation.
 * @param selectedAddonIds Optional array of selected addon IDs.
 * @param supplierId Optional supplier ID to use for cost calculation (if not provided, uses first supplier)
 * @returns An object containing the calculated unitPrice and unitCost.
 */
export function calculateProductPrice(
    product: PriceListProduct,
    quantity: number,
    size?: { width?: number; height?: number },
    selectedAddonIds?: string[],
    supplierId?: string
): { unitPrice: number; unitCost: number } {
    
    let unitPrice = 0;
    let unitCost = 0;

    if (product.productType === 'standard') {
        const valueForTiers = product.baseUnit === LineItemUnit.M2 && size?.width && size?.height 
            ? size.width * size.height 
            : quantity;

        // Calculate customer price
        unitPrice = calculateTieredPrice(
            product.customerBasePrice || 0,
            valueForTiers,
            product.customerPriceTiers || [],
            'price'
        );

        // Calculate supplier cost - use new structure if available, otherwise fall back to legacy
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
                unitCost = calculateTieredPrice(
                    supplierPricing.baseCost || 0,
                    valueForTiers,
                    supplierPricing.priceTiers || [],
                    'cost'
                );
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

    } else if (product.productType === 'shipping') {
        // For shipping, we might not have a tiered price.
        // A simple approach is to use the average of the price range, or the min price.
        // This logic can be refined based on business rules.
        unitPrice = product.customerPriceRange?.min || 0;
        unitCost = product.supplierCostRange?.min || 0;
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

