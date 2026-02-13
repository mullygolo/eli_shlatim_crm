import React from 'react';
import type { Customer } from '../types';

/** Whether the customer was created in Green Invoice (imported/synced from GI). */
export const fromGreenInvoice = (c: Customer): boolean =>
    (c.notes || '').trim().startsWith('יובא מחשבונית ירוקה') ||
    (!!c.greenInvoiceClientId && (c.category || '').trim() === 'לקוח מ-חשבונית ירוקה');

/** Whether the customer is linked/synced to Green Invoice. */
export const syncedToGreenInvoice = (c: Customer): boolean => !!c.greenInvoiceClientId;

export const formatCustomerCreatedAt = (d: Date | string | undefined): string => {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

interface CustomerSyncBadgesProps {
    customer: Customer;
    compact?: boolean;
}

const CustomerSyncBadges: React.FC<CustomerSyncBadgesProps> = ({ customer, compact }) => {
    const fromGI = fromGreenInvoice(customer);
    const toGI = syncedToGreenInvoice(customer);
    const badge = (label: string, title: string, bg: string) => (
        <span key={label} title={title} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${bg}`}>
            {label}
        </span>
    );
    return (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mt-0.5' : 'mt-2'}`}>
            {fromGI ? badge('נוצר בחשבונית ירוקה', 'הלקוח נוצר בחשבונית ירוקה וסונכרן לתוכנה', 'bg-emerald-100 text-emerald-800') : badge('נוצר בתוכנה', 'הלקוח נוצר במערכת זו', 'bg-indigo-100 text-indigo-800')}
            {fromGI && toGI && badge('מסונכרן לתוכנה', 'הלקוח סונכרן ומופיע במערכת', 'bg-emerald-100 text-emerald-800')}
            {!fromGI && toGI && badge('מסונכרן לחשבונית ירוקה', 'הלקוח מקושר ומופיע בחשבונית ירוקה', 'bg-amber-100 text-amber-800')}
        </div>
    );
};

export default CustomerSyncBadges;
