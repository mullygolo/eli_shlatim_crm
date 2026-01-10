import React, { useState, useEffect } from 'react';
import { PriceListProduct, ProductType, LineItemUnit, PriceTier, Attachment, Supplier, SupplierPricing, ProductVariant } from '../types';
import { DeleteIcon, PlusIcon } from './icons';
import Modal from './Modal';

interface EditProductModalProps {
    product: PriceListProduct | null;
    suppliers: Supplier[];
    onSave: (product: PriceListProduct) => void;
    onClose: () => void;
}

const EditProductModal: React.FC<EditProductModalProps> = ({ product, suppliers, onSave, onClose }) => {
    const getInitialFormData = (): PriceListProduct => {
        if (product) {
            // Migrate old structure to new structure if needed
            const migrated = JSON.parse(JSON.stringify(product));
            if (migrated.supplierBaseCost !== undefined && !migrated.supplierPricings) {
                // Migrate old single supplier pricing to new structure
                if (migrated.supplierBaseCost || (migrated.supplierPriceTiers && migrated.supplierPriceTiers.length > 0)) {
                    migrated.supplierPricings = [{
                        supplierId: suppliers.length > 0 ? suppliers[0].id : '',
                        supplierName: suppliers.length > 0 ? suppliers[0].name : '',
                        baseCost: migrated.supplierBaseCost,
                        priceTiers: migrated.supplierPriceTiers || []
                    }];
                }
                delete migrated.supplierBaseCost;
                delete migrated.supplierPriceTiers;
            }
            return migrated;
        }
        return {
            id: `prod_${Date.now()}`,
            name: '',
            category: '',
            description: '',
            isActive: true,
            productType: 'standard',
            baseUnit: LineItemUnit.M2,
            customerBasePrice: undefined,
            customerPriceTiers: [],
            supplierPricings: suppliers.length > 0 ? [{
                supplierId: suppliers[0].id,
                supplierName: suppliers[0].name,
                baseCost: undefined,
                priceTiers: []
            }] : [],
            images: [],
            addons: [],
            variants: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    };

    const [formData, setFormData] = useState<PriceListProduct>(getInitialFormData);
    const [customerUseOnlyTiers, setCustomerUseOnlyTiers] = useState(false);
    const [useSimplePriceRange, setUseSimplePriceRange] = useState(false);
    const [variants, setVariants] = useState<ProductVariant[]>(formData.variants || []);

    useEffect(() => {
        const initialData = getInitialFormData();
        setFormData(initialData);
        setVariants(initialData.variants || []);
        setCustomerUseOnlyTiers(!initialData.customerBasePrice && (initialData.customerPriceTiers?.length || 0) > 0);
        setUseSimplePriceRange(!!initialData.customerPriceRange);
    }, [product]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    // Customer pricing handlers
    const handleCustomerBasePriceChange = (value: number) => {
        setFormData(prev => ({ ...prev, customerBasePrice: value || undefined }));
    };

    const handleCustomerTierChange = (index: number, field: keyof PriceTier, value: number | undefined) => {
        const tiers = formData.customerPriceTiers ? [...formData.customerPriceTiers] : [];
        tiers[index] = { ...tiers[index], [field]: value };
        setFormData(prev => ({ ...prev, customerPriceTiers: tiers }));
    };

    const addCustomerTier = () => {
        const newTier: PriceTier = { min: 0, price: 0 };
        const tiers = formData.customerPriceTiers ? [...formData.customerPriceTiers] : [];
        setFormData(prev => ({ ...prev, customerPriceTiers: [...tiers, newTier] }));
    };

    const removeCustomerTier = (index: number) => {
        const tiers = formData.customerPriceTiers ? [...formData.customerPriceTiers] : [];
        setFormData(prev => ({ ...prev, customerPriceTiers: tiers.filter((_, i) => i !== index) }));
    };

    // Variant handlers
    const addVariant = () => {
        const newVariant: ProductVariant = {
            id: `variant_${Date.now()}`,
            width: undefined,
            height: undefined,
            notes: '',
            customerPrice: 0,
            isActive: true,
        };
        const updated = [...variants, newVariant];
        setVariants(updated);
        setFormData(prev => ({ ...prev, variants: updated }));
    };

    const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
        const updated = [...variants];
        updated[index] = { ...updated[index], [field]: value };
        setVariants(updated);
        setFormData(prev => ({ ...prev, variants: updated }));
    };

    const removeVariant = (index: number) => {
        const updated = variants.filter((_, i) => i !== index);
        setVariants(updated);
        setFormData(prev => ({ ...prev, variants: updated }));
    };

    // Supplier pricing handlers
    const handleAddSupplier = () => {
        if (suppliers.length === 0) return;
        const newSupplierPricing: SupplierPricing = {
            supplierId: suppliers[0].id,
            supplierName: suppliers[0].name,
            baseCost: undefined,
            priceTiers: []
        };
        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
        setFormData(prev => ({ ...prev, supplierPricings: [...pricings, newSupplierPricing] }));
    };

    const handleRemoveSupplier = (index: number) => {
        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
        if (pricings.length <= 1) {
            alert('חייב להיות לפחות ספק אחד');
            return;
        }
        setFormData(prev => ({ ...prev, supplierPricings: pricings.filter((_, i) => i !== index) }));
    };

    const handleSupplierChange = (index: number, supplierId: string) => {
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier) return;
        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
        pricings[index] = {
            ...pricings[index],
            supplierId: supplier.id,
            supplierName: supplier.name
        };
        setFormData(prev => ({ ...prev, supplierPricings: pricings }));
    };

    const handleSupplierBaseCostChange = (index: number, value: number) => {
        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
        pricings[index] = { ...pricings[index], baseCost: value || undefined };
        setFormData(prev => ({ ...prev, supplierPricings: pricings }));
    };

    const handleSupplierTierChange = (supplierIndex: number, tierIndex: number, field: keyof PriceTier, value: number | undefined) => {
        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
        const tiers = pricings[supplierIndex].priceTiers ? [...pricings[supplierIndex].priceTiers!] : [];
        tiers[tierIndex] = { ...tiers[tierIndex], [field]: value };
        pricings[supplierIndex] = { ...pricings[supplierIndex], priceTiers: tiers };
        setFormData(prev => ({ ...prev, supplierPricings: pricings }));
    };

    const addSupplierTier = (supplierIndex: number) => {
        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
        const newTier: PriceTier = { min: 0, cost: 0 };
        const tiers = pricings[supplierIndex].priceTiers ? [...pricings[supplierIndex].priceTiers!] : [];
        pricings[supplierIndex] = { ...pricings[supplierIndex], priceTiers: [...tiers, newTier] };
        setFormData(prev => ({ ...prev, supplierPricings: pricings }));
    };

    const removeSupplierTier = (supplierIndex: number, tierIndex: number) => {
        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
        const tiers = pricings[supplierIndex].priceTiers ? [...pricings[supplierIndex].priceTiers!] : [];
        pricings[supplierIndex] = {
            ...pricings[supplierIndex],
            priceTiers: tiers.filter((_, i) => i !== tierIndex)
        };
        setFormData(prev => ({ ...prev, supplierPricings: pricings }));
    };
    
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files: File[] = Array.from(e.target.files);
            const filePromises = files.map(file => {
                return new Promise<Attachment>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (event.target?.result) {
                            resolve({
                                id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                fileName: file.name,
                                dataUrl: event.target.result as string,
                                type: file.type || 'image/jpeg',
                                uploadedAt: new Date(),
                            });
                        } else {
                            reject(new Error('Failed to read file'));
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });

            Promise.all(filePromises).then(newImages => {
                setFormData(prev => ({
                    ...prev,
                    images: [...(prev.images || []), ...newImages]
                }));
            }).catch(error => {
                console.error('Error uploading images:', error);
                alert('שגיאה בהעלאת תמונות');
            });
        }
    };
    
    const handleRemoveImage = (imageId: string) => {
        setFormData(prev => ({
            ...prev,
            images: (prev.images || []).filter(img => img.id !== imageId)
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // If using simple price range, clear base price and tiers
        if (useSimplePriceRange) {
            formData.customerBasePrice = undefined;
            formData.customerPriceTiers = [];
        } else {
            // If customer uses only tiers, clear base price
            if (customerUseOnlyTiers) {
                formData.customerBasePrice = undefined;
            }
            // Clear simple price range if not using it
            formData.customerPriceRange = undefined;
        }
        
        // Clear base cost and tiers for suppliers that use simple cost range
        if (formData.supplierPricings) {
            formData.supplierPricings = formData.supplierPricings.map(sp => {
                if (sp.costRange) {
                    // If using simple cost range, clear base cost and tiers
                    return {
                        ...sp,
                        baseCost: undefined,
                        priceTiers: []
                    };
                }
                // Otherwise, keep existing logic for "only tiers"
                const hasTiers = (sp.priceTiers?.length || 0) > 0;
                const useOnlyTiers = !sp.baseCost && hasTiers;
                return {
                    ...sp,
                    baseCost: useOnlyTiers ? undefined : sp.baseCost
                };
            });
        }
        
        // Ensure variants are saved
        formData.variants = variants;
        
        onSave({ ...formData, updatedAt: new Date() });
    };

        return (
        <Modal 
            title={product ? `עריכת מוצר: ${product.name}` : "הוספת מוצר חדש"} 
            onClose={onClose} 
            size="5xl"
        >
            <form onSubmit={handleSubmit} className="space-y-6 p-1">
                {/* סעיף 1: מידע בסיסי */}
                <div className="bg-slate-50 p-4 rounded-lg space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800">מידע בסיסי</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">שם מוצר *</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
                            <input
                                type="text"
                                name="category"
                                value={formData.category || ''}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
                        <textarea
                            name="description"
                            value={formData.description || ''}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">יחידת מידה</label>
                        <select
                            name="baseUnit"
                            value={formData.baseUnit || LineItemUnit.M2}
                            onChange={handleChange}
                            className="w-full md:w-1/3 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                            {Object.values(LineItemUnit).map(unit => (
                                <option key={unit} value={unit}>{unit}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* סעיף 2: תמחור ללקוח */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-6">
                    <h3 className="text-lg font-semibold text-slate-800">תמחור ללקוח</h3>
                    
                    {/* Checkbox for simple price range */}
                    <div className="flex items-center p-3 bg-slate-50 rounded-md">
                        <input
                            type="checkbox"
                            id="useSimplePriceRange"
                            checked={useSimplePriceRange}
                            onChange={(e) => {
                                setUseSimplePriceRange(e.target.checked);
                                if (e.target.checked) {
                                    // Clear base price and tiers when using simple range
                                    setFormData(prev => ({ 
                                        ...prev, 
                                        customerBasePrice: undefined,
                                        customerPriceTiers: []
                                    }));
                                    setCustomerUseOnlyTiers(false);
                                } else {
                                    // Clear simple range when switching back
                                    setFormData(prev => ({
                                        ...prev,
                                        customerPriceRange: undefined
                                    }));
                                }
                            }}
                            className="h-4 w-4 text-primary focus:ring-primary border-slate-300 rounded"
                        />
                        <label htmlFor="useSimplePriceRange" className="mr-2 text-sm font-medium text-slate-700">
                            השתמש בטווח מחיר פשוט (מ-X עד Y ללא קשר ליחידות מידה)
                        </label>
                </div>

                    {useSimplePriceRange ? (
                        /* Simple Price Range */
                                <div className="grid grid-cols-2 gap-4">
                                   <div>
                                       <label className="block text-sm font-medium text-slate-700 mb-1">מחיר מינימום</label>
                                <input
                                    type="number"
                                    value={formData.customerPriceRange?.min || ''}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        customerPriceRange: {
                                            min: parseFloat(e.target.value) || 0,
                                            max: prev.customerPriceRange?.max || 0
                                        }
                                    }))}
                                    step="0.01"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                                   </div>
                                   <div>
                                       <label className="block text-sm font-medium text-slate-700 mb-1">מחיר מקסימום</label>
                                <input
                                    type="number"
                                    value={formData.customerPriceRange?.max || ''}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        customerPriceRange: {
                                            min: prev.customerPriceRange?.min || 0,
                                            max: parseFloat(e.target.value) || 0
                                        }
                                    }))}
                                    step="0.01"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                                   </div>
                               </div>
                    ) : (
                        <>
                            {/* מחיר בסיס ללקוח */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            מחיר בסיס ל{formData.baseUnit || LineItemUnit.M2} ללקוח
                        </label>
                        <input
                            type="number"
                            value={formData.customerBasePrice || ''}
                            onChange={(e) => handleCustomerBasePriceChange(parseFloat(e.target.value) || 0)}
                            step="0.01"
                            className="w-full md:w-1/3 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            מחיר זה יחול אם אין טווח מחירים מתאים לכמות
                        </p>
                    </div>

                    {/* טווחי מחירים ללקוח */}
                    <div className="pt-4 border-t border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h4 className="font-medium text-slate-800 mb-1">טווחי מחירים לפי כמויות ({formData.baseUnit || LineItemUnit.M2})</h4>
                                <p className="text-xs text-slate-500">
                                    ניתן להגדיר טווחים לפי יחידת המידה שנבחרה. אם יש מחיר בסיס, הוא יחול מחוץ לטווחים.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={addCustomerTier}
                                className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:bg-primary-dark flex items-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4" />
                                הוסף טווח
                            </button>
                        </div>

                        {formData.customerPriceTiers && formData.customerPriceTiers.length > 0 && (
                            <div className="space-y-3">
                                {formData.customerPriceTiers.map((tier, index) => (
                                    <div key={index} className="bg-white p-3 rounded-md border border-slate-200">
                                        <div className="grid grid-cols-4 gap-3 items-end">
                                            <div>
                                                <label className="block text-xs text-slate-600 mb-1">מ-{formData.baseUnit || LineItemUnit.M2}</label>
                                                <input
                                                    type="number"
                                                    value={tier.min || ''}
                                                    onChange={(e) => handleCustomerTierChange(index, 'min', parseFloat(e.target.value) || undefined)}
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                                                    step="0.01"
                                                    placeholder="10"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600 mb-1">עד-{formData.baseUnit || LineItemUnit.M2}</label>
                                                <input
                                                    type="number"
                                                    value={tier.max || ''}
                                                    onChange={(e) => handleCustomerTierChange(index, 'max', parseFloat(e.target.value) || undefined)}
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                                                    step="0.01"
                                                    placeholder="20"
                                                />
                                                <p className="text-xs text-slate-400 mt-1">השאר ריק ל-∞</p>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600 mb-1">מחיר ללקוח (ל{formData.baseUnit || LineItemUnit.M2})</label>
                                                <input
                                                    type="number"
                                                    value={tier.price || 0}
                                                    onChange={(e) => handleCustomerTierChange(index, 'price', parseFloat(e.target.value) || 0)}
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                                                    step="0.01"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeCustomerTier(index)}
                                                className="px-2 py-1 text-red-600 hover:text-red-800"
                                            >
                                                <DeleteIcon className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                               </div>
                           )}
                    </div>

                    {/* תת-מוצרים (מידות מוגדרות מראש) */}
                    <div className="pt-4 border-t border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h4 className="font-medium text-slate-800 mb-1">תת-מוצרים (מידות מוגדרות מראש)</h4>
                                <p className="text-xs text-slate-500">
                                    ניתן להגדיר מידות קבועות עם מחירים ספציפיים. לדוגמה: 10/10 ס״מ, 20/20 ס״מ וכו'.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={addVariant}
                                className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:bg-primary-dark flex items-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4" />
                                הוסף תת-מוצר
                            </button>
                        </div>

                        {variants && variants.length > 0 && (
                            <div className="space-y-3">
                                {variants.map((variant, index) => (
                                    <div key={variant.id} className="bg-white p-3 rounded-md border border-slate-200">
                                        <div className="grid grid-cols-5 gap-3 items-end">
                                            <div>
                                                <label className="block text-xs text-slate-600 mb-1">שם (אופציונלי)</label>
                                                <input
                                                    type="text"
                                                    value={variant.name || ''}
                                                    onChange={(e) => updateVariant(index, 'name', e.target.value)}
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                                                    placeholder="קטן/בינוני"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600 mb-1">רוחב (ס״מ)</label>
                                                <input
                                                    type="number"
                                                    value={variant.width || ''}
                                                    onChange={(e) => updateVariant(index, 'width', parseFloat(e.target.value) || undefined)}
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                                                    step="0.01"
                                                    placeholder="10"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600 mb-1">גובה (ס״מ)</label>
                                                <input
                                                    type="number"
                                                    value={variant.height || ''}
                                                    onChange={(e) => updateVariant(index, 'height', parseFloat(e.target.value) || undefined)}
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                                                    step="0.01"
                                                    placeholder="10"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600 mb-1">הערה</label>
                                                <input
                                                    type="text"
                                                    value={variant.notes || ''}
                                                    onChange={(e) => updateVariant(index, 'notes', e.target.value)}
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                                                    placeholder="10/10 ס״מ או הערות אחרות"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600 mb-1">מחיר ללקוח *</label>
                                                <input
                                                    type="number"
                                                    value={variant.customerPrice || 0}
                                                    onChange={(e) => updateVariant(index, 'customerPrice', parseFloat(e.target.value) || 0)}
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                                                    step="0.01"
                                                    required
                                                />
                                                
                                                {/* Display supplier costs for this variant */}
                                                {formData.supplierPricings && formData.supplierPricings.length > 0 && (() => {
                                                    const supplierCostsForVariant = formData.supplierPricings
                                                        .map(sp => {
                                                            const vc = sp.variantCosts?.find(v => v.variantId === variant.id);
                                                            return vc ? { supplierName: sp.supplierName, cost: vc.cost } : null;
                                                        })
                                                        .filter(Boolean) as { supplierName: string; cost: number }[];
                                                    
                                                    if (supplierCostsForVariant.length > 0) {
                                                        return (
                                                            <div className="mt-1 text-xs text-slate-500 bg-slate-50 p-1 rounded">
                                                                <span className="font-medium">עלויות מספקים: </span>
                                                                {supplierCostsForVariant.map((sc, i) => (
                                                                    <span key={i}>
                                                                        {sc.supplierName}: ₪{sc.cost.toLocaleString()}
                                                                        {i < supplierCostsForVariant.length - 1 ? ', ' : ''}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </div>
                                        <div className="flex justify-end mt-2">
                                            <button
                                                type="button"
                                                onClick={() => removeVariant(index)}
                                                className="px-2 py-1 text-red-600 hover:text-red-800"
                                            >
                                                <DeleteIcon className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                        </>
                    )}
                </div>

                {/* סעיף 3: תמחור מספקים */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-slate-800">תמחור מספקים</h3>
                        {suppliers.length > 0 && (
                            <button
                                type="button"
                                onClick={handleAddSupplier}
                                className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 flex items-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4" />
                                הוסף ספק
                            </button>
                        )}
                    </div>

                    {formData.supplierPricings && formData.supplierPricings.length > 0 && (
                        <div className="space-y-6">
                            {formData.supplierPricings.map((sp, idx) => (
                                <div key={idx} className="bg-slate-50 p-3 rounded-md border border-slate-200 space-y-3">
                                    {/* Supplier Header */}
                                    <div className="flex justify-between items-center pb-2 border-b border-slate-300">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-semibold text-slate-800">{sp.supplierName}</h4>
                                            {formData.supplierPricings && formData.supplierPricings.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSupplier(idx)}
                                                    className="text-red-500 hover:text-red-700"
                                                    title="הסר ספק"
                                                >
                                                    <DeleteIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Supplier Selection */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">בחר ספק</label>
                                        <select
                                            value={sp.supplierId}
                                            onChange={(e) => handleSupplierChange(idx, e.target.value)}
                                            className="w-full md:w-1/2 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                        >
                                            {suppliers.map(supplier => (
                                                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Checkbox for simple cost range */}
                                    <div className="flex items-center p-2 bg-white rounded-md">
                                        <input
                                            type="checkbox"
                                            id={`supplierUseSimpleRange_${idx}`}
                                            checked={!!sp.costRange}
                                            onChange={(e) => {
                                                const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
                                                if (e.target.checked) {
                                                    // When checked: set simple cost range, clear base cost and tiers
                                                    pricings[idx] = {
                                                        ...pricings[idx],
                                                        costRange: { min: 0, max: 0 },
                                                        baseCost: undefined,
                                                        priceTiers: []
                                                    };
                                                } else {
                                                    // When unchecked: clear simple range
                                                    pricings[idx] = {
                                                        ...pricings[idx],
                                                        costRange: undefined
                                                    };
                                                }
                                                setFormData(prev => ({ ...prev, supplierPricings: pricings }));
                                            }}
                                            className="h-3.5 w-3.5 text-primary focus:ring-primary border-slate-300 rounded"
                                        />
                                        <label htmlFor={`supplierUseSimpleRange_${idx}`} className="mr-2 text-xs font-medium text-slate-700">
                                            השתמש בטווח עלות פשוט (מ-X עד Y ללא קשר ליחידות מידה)
                                        </label>
                                    </div>

                                    {sp.costRange ? (
                                        /* Simple Cost Range */
                                <div className="grid grid-cols-2 gap-4">
                                   <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">עלות מינימום</label>
                                                <input
                                                    type="number"
                                                    value={sp.costRange.min || ''}
                                                    onChange={(e) => {
                                                        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
                                                        pricings[idx] = {
                                                            ...pricings[idx],
                                                            costRange: {
                                                                min: parseFloat(e.target.value) || 0,
                                                                max: pricings[idx].costRange?.max || 0
                                                            }
                                                        };
                                                        setFormData(prev => ({ ...prev, supplierPricings: pricings }));
                                                    }}
                                                    step="0.01"
                                                    className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">עלות מקסימום</label>
                                                <input
                                                    type="number"
                                                    value={sp.costRange.max || ''}
                                                    onChange={(e) => {
                                                        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
                                                        pricings[idx] = {
                                                            ...pricings[idx],
                                                            costRange: {
                                                                min: pricings[idx].costRange?.min || 0,
                                                                max: parseFloat(e.target.value) || 0
                                                            }
                                                        };
                                                        setFormData(prev => ({ ...prev, supplierPricings: pricings }));
                                                    }}
                                                    step="0.01"
                                                    className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* מחיר בסיס מספק */}
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                                    מחיר בסיס ל{formData.baseUnit || LineItemUnit.M2} מספק
                                                </label>
                                                <input
                                                    type="number"
                                                    value={sp.baseCost || ''}
                                                    onChange={(e) => handleSupplierBaseCostChange(idx, parseFloat(e.target.value) || 0)}
                                                    step="0.01"
                                                    className="w-full md:w-1/3 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">
                                                    מחיר זה יחול אם אין טווח מחירים מתאים לכמות
                                                </p>
                                            </div>

                                            {/* טווחי מחירים מספק */}
                                    <div className="pt-2 border-t border-slate-200">
                                        <div className="flex justify-between items-center mb-2">
                                            <div>
                                                <h5 className="text-xs font-medium text-slate-800 mb-1">טווחי מחירים לפי כמויות ({formData.baseUnit || LineItemUnit.M2})</h5>
                                                <p className="text-xs text-slate-500">
                                                    ניתן להגדיר טווחים לפי יחידת המידה שנבחרה. אם יש מחיר בסיס, הוא יחול מחוץ לטווחים.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => addSupplierTier(idx)}
                                                className="px-2 py-1 text-xs bg-primary text-white rounded-md hover:bg-primary-dark flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-3 h-3" />
                                                הוסף טווח
                                            </button>
                                        </div>

                                        {sp.priceTiers && sp.priceTiers.length > 0 && (
                                            <div className="space-y-2">
                                                {sp.priceTiers.map((tier, tierIndex) => (
                                                    <div key={tierIndex} className="bg-white p-2 rounded-md border border-slate-200">
                                                        <div className="grid grid-cols-4 gap-2 items-end">
                                                            <div>
                                                                <label className="block text-xs text-slate-600 mb-1">מ-{formData.baseUnit || LineItemUnit.M2}</label>
                                                                <input
                                                                    type="number"
                                                                    value={tier.min || ''}
                                                                    onChange={(e) => handleSupplierTierChange(idx, tierIndex, 'min', parseFloat(e.target.value) || undefined)}
                                                                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded-md"
                                                                    step="0.01"
                                                                    placeholder="10"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-slate-600 mb-1">עד-{formData.baseUnit || LineItemUnit.M2}</label>
                                                                <input
                                                                    type="number"
                                                                    value={tier.max || ''}
                                                                    onChange={(e) => handleSupplierTierChange(idx, tierIndex, 'max', parseFloat(e.target.value) || undefined)}
                                                                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded-md"
                                                                    step="0.01"
                                                                    placeholder="20"
                                                                />
                                                                <p className="text-xs text-slate-400 mt-0.5">השאר ריק ל-∞</p>
                                   </div>
                                   <div>
                                                                <label className="block text-xs text-slate-600 mb-1">מחיר מספק (ל{formData.baseUnit || LineItemUnit.M2})</label>
                                                                <input
                                                                    type="number"
                                                                    value={tier.cost || 0}
                                                                    onChange={(e) => handleSupplierTierChange(idx, tierIndex, 'cost', parseFloat(e.target.value) || 0)}
                                                                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded-md"
                                                                    step="0.01"
                                                                />
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeSupplierTier(idx, tierIndex)}
                                                                className="px-1 py-1 text-red-600 hover:text-red-800"
                                                            >
                                                                <DeleteIcon className="h-4 w-4" />
                                                            </button>
                                   </div>
                               </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* עלויות לתת-מוצרים */}
                                    {variants && variants.length > 0 && (
                                        <div className="pt-2 border-t border-slate-200">
                                            <div className="flex justify-between items-center mb-2">
                                                <div>
                                                    <h5 className="text-xs font-medium text-slate-800 mb-1">עלויות לתת-מוצרים</h5>
                                                    <p className="text-xs text-slate-500">
                                                        הגדר עלות לכל תת-מוצר. אם לא מוגדר, יוחל המחיר הבסיס או טווחי המחירים.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        // Copy all variants from customer pricing
                                                        const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
                                                        const variantCosts = variants.map(v => ({
                                                            variantId: v.id,
                                                            cost: 0 // Default cost, user can update
                                                        }));
                                                        pricings[idx] = {
                                                            ...pricings[idx],
                                                            variantCosts: variantCosts
                                                        };
                                                        setFormData(prev => ({ ...prev, supplierPricings: pricings }));
                                                    }}
                                                    className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200"
                                                >
                                                    העתק תת-מוצרים מלקוח
                                                </button>
                                            </div>

                                            {sp.variantCosts && sp.variantCosts.length > 0 && (
                                                <div className="space-y-2">
                                                    {sp.variantCosts.map((vc, vcIndex) => {
                                                        const variant = variants.find(v => v.id === vc.variantId);
                                                        if (!variant) return null;
                                                        return (
                                                            <div key={vc.variantId} className="bg-white p-2 rounded-md border border-slate-200">
                                                                <div className="grid grid-cols-4 gap-2 items-center">
                                                                    <div className="col-span-2">
                                                                        <div className="space-y-1">
                                                                            <span className="text-xs font-medium text-slate-700 block">
                                                                                {variant.name || `תת-מוצר ${vcIndex + 1}`}
                                                                            </span>
                                                                            {(variant.width || variant.height) && (
                                                                                <span className="text-xs text-slate-600 block">
                                                                                    {variant.width && variant.height 
                                                                                        ? `${variant.width}x${variant.height} ס״מ`
                                                                                        : variant.width 
                                                                                        ? `רוחב: ${variant.width} ס״מ`
                                                                                        : `גובה: ${variant.height} ס״מ`}
                                                                                </span>
                                                                            )}
                                                                            {variant.notes && (
                                                                                <p className="text-xs text-slate-500">{variant.notes}</p>
                                                                            )}
                                                                            {variant.customerPrice && (
                                                                                <p className="text-xs text-slate-400">
                                                                                    מחיר ללקוח: ₪{variant.customerPrice.toLocaleString()}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs text-slate-600 mb-1">עלות מספק</label>
                                                                        <input
                                                                            type="number"
                                                                            value={vc.cost || 0}
                                                                            onChange={(e) => {
                                                                                const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
                                                                                const updatedCosts = [...(pricings[idx].variantCosts || [])];
                                                                                const existingIndex = updatedCosts.findIndex(v => v.variantId === vc.variantId);
                                                                                if (existingIndex >= 0) {
                                                                                    updatedCosts[existingIndex] = {
                                                                                        ...updatedCosts[existingIndex],
                                                                                        cost: parseFloat(e.target.value) || 0
                                                                                    };
                                                                                } else {
                                                                                    updatedCosts.push({
                                                                                        variantId: vc.variantId,
                                                                                        cost: parseFloat(e.target.value) || 0
                                                                                    });
                                                                                }
                                                                                pricings[idx] = {
                                                                                    ...pricings[idx],
                                                                                    variantCosts: updatedCosts
                                                                                };
                                                                                setFormData(prev => ({ ...prev, supplierPricings: pricings }));
                                                                            }}
                                                                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded-md"
                                                                            step="0.01"
                                                                        />
                                                                    </div>
                                                                    <div className="flex justify-end">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const pricings = formData.supplierPricings ? [...formData.supplierPricings] : [];
                                                                                const updatedCosts = (pricings[idx].variantCosts || []).filter(v => v.variantId !== vc.variantId);
                                                                                pricings[idx] = {
                                                                                    ...pricings[idx],
                                                                                    variantCosts: updatedCosts.length > 0 ? updatedCosts : undefined
                                                                                };
                                                                                setFormData(prev => ({ ...prev, supplierPricings: pricings }));
                                                                            }}
                                                                            className="px-1 py-1 text-red-600 hover:text-red-800"
                                                                        >
                                                                            <DeleteIcon className="h-4 w-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                        </>
                           )}
                                </div>
                            ))}
                        </div>
                    )}
                            </div>

                {/* סעיף 4: תמונות והערות */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-6">
                    <h3 className="text-lg font-semibold text-slate-800">תמונות והערות</h3>
                    
                    {/* תמונות */}
                            <div>
                        <h4 className="font-medium text-slate-800 mb-2">תמונות מוצר</h4>
                                 <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleImageUpload}
                                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark"
                                />
                                {formData.images && formData.images.length > 0 && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                        {formData.images.map((img) => (
                                            <div key={img.id} className="relative group">
                                                <img
                                                    src={img.dataUrl}
                                                    alt={img.fileName}
                                                    className="w-full h-32 object-cover rounded-md border border-slate-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveImage(img.id)}
                                                    className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <DeleteIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                    {/* הערות */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
                        <textarea
                            name="notes"
                            value={formData.notes || ''}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    {/* סטטוס פעיל */}
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="isActive"
                            name="isActive"
                            checked={formData.isActive}
                            onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                            className="h-4 w-4 text-primary focus:ring-primary border-slate-300 rounded"
                        />
                        <label htmlFor="isActive" className="mr-2 text-sm font-medium text-slate-700">
                            מוצר פעיל
                        </label>
                        </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end items-center p-4 border-t border-slate-200">
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                        >
                            ביטול
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
                        >
                            שמור מוצר
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default EditProductModal;
