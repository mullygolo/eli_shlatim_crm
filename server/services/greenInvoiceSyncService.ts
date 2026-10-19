/**
 * Shared logic for syncing a single Green Invoice client to CRM (create or update customer).
 * Used by: POST /sync-from-greeninvoice and by webhook POST /api/webhook/greeninvoice.
 */
import type { Customer, Contact } from '../types.js';
import type { GreenInvoiceClient } from '../types/greenInvoice.js';
import { getCustomers, createCustomer, updateCustomer } from './mongoService.js';

// Helpers to normalize GreenInvoice client fields (API may use names/name, email/emails, etc.)
export function giClientName(c: { names?: string; name?: string }): string {
    return (c.names || c.name || 'לקוח מ-חשבונית ירוקה').trim();
}
export function giClientEmail(c: { email?: string; emails?: string[] }): string {
    if (c.email) return c.email;
    return Array.isArray(c.emails) && c.emails.length ? c.emails[0] : '';
}
export function giClientPhone(c: { phone?: string; mobile?: string }): string {
    return c.phone || c.mobile || '';
}

/** Parse GI created_at (ms number/string or ISO string) to Date for greenInvoiceCreatedAt. */
function parseGiCreatedAt(v: unknown): Date | undefined {
    if (v == null || v === '') return undefined;
    if (typeof v === 'number' && !Number.isNaN(v)) {
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
    }
    if (typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed) return undefined;
        if (/^\d+$/.test(trimmed)) return parseGiCreatedAt(Number(trimmed));
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? undefined : d;
    }
    return undefined;
}
export type ApplyClientResult = { created?: Customer; updated?: Customer };

/**
 * Apply one Green Invoice client to CRM: create new customer or update existing.
 * Guarantees no duplicate: matches by greenInvoiceClientId first, then by name or businessId (taxId).
 * When multiple CRM customers match by name/businessId, prefers one without greenInvoiceClientId to avoid overwriting an existing link.
 */
export async function applyGreenInvoiceClientToCustomer(
    giClient: GreenInvoiceClient,
    existingCustomers: Customer[]
): Promise<ApplyClientResult> {
    const displayName = giClientName(giClient);
    const displayNameNorm = (displayName || '').trim().toLowerCase();
    const giTaxId = String((giClient as any).taxId ?? (giClient as any).business_id ?? (giClient as any).tax_id ?? '').trim();
    let existingCustomer = existingCustomers.find(c => c.greenInvoiceClientId === giClient.id);
    if (!existingCustomer) {
        const nameOrBizMatch = (c: Customer) => {
            const nameMatch = (c.name || '').trim().toLowerCase() === displayNameNorm;
            const hpMatch = !!giTaxId && !!((c.businessId || '').trim()) && giTaxId === (c.businessId || '').trim();
            return nameMatch || hpMatch;
        };
        const candidates = existingCustomers.filter(nameOrBizMatch);
        existingCustomer = candidates.find(c => !c.greenInvoiceClientId)
            ?? candidates.find(c => c.greenInvoiceClientId === giClient.id)
            ?? candidates[0];
    }

    const addressParts: string[] = [];
    if (giClient.address) addressParts.push(giClient.address);
    if (giClient.city) addressParts.push(giClient.city);
    if (giClient.zip) addressParts.push(giClient.zip);
    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : '';

    const businessId = (giClient as any).taxId ||
        (giClient as any).business_id ||
        (giClient as any).tax_id ||
        (giClient as any).taxNumber ||
        (giClient as any).tax_number ||
        '';

    if (existingCustomer) {
        const notesParts: string[] = [];
        if (existingCustomer.notes && !existingCustomer.notes.startsWith('יובא מחשבונית ירוקה')) {
            notesParts.push(existingCustomer.notes);
        }
        notesParts.push('--- נתונים מחשבונית ירוקה ---');
        if (giClient.remarks) notesParts.push(`הערות: ${giClient.remarks}`);
        if (giClient.department) notesParts.push(`מחלקה: ${giClient.department}`);
        if (giClient.accountingKey) notesParts.push(`מפתח חשבונאי: ${giClient.accountingKey}`);
        if (giClient.labels && giClient.labels.length > 0) {
            notesParts.push(`תגיות: ${giClient.labels.join(', ')}`);
        }
        if (giClient.fax) notesParts.push(`פקס: ${giClient.fax}`);
        const bankDetails: string[] = [];
        if (giClient.bankName) bankDetails.push(giClient.bankName);
        if (giClient.bankBranch) bankDetails.push(`סניף ${giClient.bankBranch}`);
        if (giClient.bankAccount) bankDetails.push(`חשבון ${giClient.bankAccount}`);
        const bankInfo = bankDetails.length > 0 ? bankDetails.join(', ') : '';
        if (bankInfo) notesParts.push(`פרטי בנק: ${bankInfo}`);
        const fullNotes = notesParts.length > 0 ? notesParts.join('\n') : existingCustomer.notes || '';

        let paymentTerms = existingCustomer.paymentTerms || 'תשלום מיידי';
        if (!existingCustomer.paymentTerms && giClient.paymentTerms) {
            if (typeof giClient.paymentTerms === 'number') {
                if (giClient.paymentTerms === 0) paymentTerms = 'תשלום מיידי';
                else if (giClient.paymentTerms > 0) paymentTerms = `שוטף ${giClient.paymentTerms}`;
                else paymentTerms = 'שוטף';
            } else {
                paymentTerms = String(giClient.paymentTerms);
            }
        }

        const giCreatedAt = parseGiCreatedAt((giClient as any).created_at ?? (giClient as any).createdAt);
        const updatedCustomerData: Customer = {
            ...existingCustomer,
            name: displayName,
            businessId: businessId || existingCustomer.businessId || '',
            address: fullAddress || giClient.address || existingCustomer.address || '',
            addressStreet: giClient.address ?? existingCustomer.addressStreet ?? '',
            addressCity: giClient.city ?? existingCustomer.addressCity ?? '',
            addressZip: giClient.zip != null ? String(giClient.zip) : (existingCustomer.addressZip ?? ''),
            category: typeof giClient.category === 'string' ? giClient.category : (giClient.category ? String(giClient.category) : existingCustomer.category),
            notes: fullNotes,
            paymentTerms,
            greenInvoiceClientId: giClient.id,
            ...(giCreatedAt && { greenInvoiceCreatedAt: giCreatedAt }),
        };

        if (giClient.contactPerson || giClientEmail(giClient) || giClientPhone(giClient)) {
            const primaryContact = updatedCustomerData.contacts?.find((c: Contact) => c.isDefault) || updatedCustomerData.contacts?.[0];
            if (primaryContact) {
                primaryContact.name = giClient.contactPerson || primaryContact.name || displayName;
                primaryContact.email = giClientEmail(giClient) || primaryContact.email || '';
                primaryContact.phone = giClientPhone(giClient) || primaryContact.phone || '';
            } else {
                updatedCustomerData.contacts = [{
                    id: `cont_${Date.now()}`,
                    name: giClient.contactPerson || displayName,
                    email: giClientEmail(giClient),
                    phone: giClientPhone(giClient),
                    role: 'איש קשר ראשי',
                    isBillingContact: true,
                    isDefault: true,
                }];
            }
        }

        const updated = await updateCustomer(updatedCustomerData);
        return { updated };
    }

    const notesParts: string[] = ['יובא מחשבונית ירוקה'];
    if (giClient.remarks) notesParts.push(`הערות: ${giClient.remarks}`);
    if (giClient.department) notesParts.push(`מחלקה: ${giClient.department}`);
    if (giClient.accountingKey) notesParts.push(`מפתח חשבונאי: ${giClient.accountingKey}`);
    if (giClient.labels && giClient.labels.length > 0) notesParts.push(`תגיות: ${giClient.labels.join(', ')}`);
    if (giClient.fax) notesParts.push(`פקס: ${giClient.fax}`);
    const bankDetails: string[] = [];
    if (giClient.bankName) bankDetails.push(giClient.bankName);
    if (giClient.bankBranch) bankDetails.push(`סניף ${giClient.bankBranch}`);
    if (giClient.bankAccount) bankDetails.push(`חשבון ${giClient.bankAccount}`);
    const bankInfo = bankDetails.length > 0 ? bankDetails.join(', ') : '';
    if (bankInfo) notesParts.push(`פרטי בנק: ${bankInfo}`);
    const fullNotes = notesParts.join('\n');

    let paymentTerms = 'תשלום מיידי';
    if (giClient.paymentTerms) {
        if (typeof giClient.paymentTerms === 'number') {
            if (giClient.paymentTerms === 0) paymentTerms = 'תשלום מיידי';
            else if (giClient.paymentTerms > 0) paymentTerms = `שוטף ${giClient.paymentTerms}`;
            else paymentTerms = 'שוטף';
        } else {
            paymentTerms = String(giClient.paymentTerms);
        }
    }

    const giCreatedAt = parseGiCreatedAt((giClient as any).created_at ?? (giClient as any).createdAt);
    const newCustomer: Customer = {
        id: `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: displayName,
        businessId: businessId,
        website: '',
        address: fullAddress || giClient.address || '',
        addressStreet: giClient.address ?? '',
        addressCity: giClient.city ?? '',
        addressZip: giClient.zip != null ? String(giClient.zip) : '',
        category: typeof giClient.category === 'string' ? giClient.category : (giClient.category ? String(giClient.category) : 'לקוח מ-חשבונית ירוקה'),
        notes: fullNotes,
        isSpecial: false,
        contacts: [{
            id: `cont_${Date.now()}`,
            name: giClient.contactPerson || displayName,
            email: giClientEmail(giClient),
            phone: giClientPhone(giClient),
            role: giClient.contactPerson ? 'איש קשר' : 'איש קשר ראשי',
            isBillingContact: true,
            isDefault: true,
        }],
        createdAt: giCreatedAt ?? new Date(),
        paymentMethod: 'העברה בנקאית' as any,
        paymentTerms,
        greenInvoiceClientId: giClient.id,
        ...(giCreatedAt && { greenInvoiceCreatedAt: giCreatedAt }),
    };
    const created = await createCustomer(newCustomer);
    return { created };
}

/**
 * Find a CRM customer that can serve as merge target (veteran) for an "orphan" whose GI client was merged/deactivated.
 * Tries: same businessId, same name, name contains, then single active-GI fallback.
 */
export function findSiblingForMerge(
    orphan: Customer,
    allCustomers: Customer[],
    activeGiIds: Set<string>
): Customer | null {
    const nameNorm = (orphan.name || '').trim().toLowerCase();
    const businessIdNorm = (orphan.businessId || '').trim();
    const withActiveGi = allCustomers.filter(
        c => c.id !== orphan.id && c.greenInvoiceClientId && activeGiIds.has(c.greenInvoiceClientId)
    );
    if (withActiveGi.length === 0) return null;

    if (businessIdNorm) {
        const sameBiz = withActiveGi.filter(c => (c.businessId || '').trim() === businessIdNorm);
        if (sameBiz.length >= 1) return sameBiz[0];
    }
    const exactName = withActiveGi.find(c => (c.name || '').trim().toLowerCase() === nameNorm);
    if (exactName) return exactName;
    const nameContains = withActiveGi.filter(c => {
        const cName = (c.name || '').trim().toLowerCase();
        return nameNorm && cName && (cName.includes(nameNorm) || nameNorm.includes(cName));
    });
    if (nameContains.length === 1) return nameContains[0];
    if (withActiveGi.length === 1) return withActiveGi[0];
    return null;
}
