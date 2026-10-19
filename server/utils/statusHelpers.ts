/**
 * Status helpers – לוגיקה מבוססת דגלים (ID), לא על שם/צבע
 */

import type { OrderStatusConfiguration } from '../types.js';

/** Resolve status config for an order. Uses orderStatusId first, falls back to orderStatus (label) for legacy data. */
export function getStatusConfigForOrder(
    order: { orderStatusId?: string; orderStatus?: string },
    statusConfigs: OrderStatusConfiguration[]
): OrderStatusConfiguration | undefined {
    if (!statusConfigs?.length) return undefined;
    if (order.orderStatusId) {
        const byId = statusConfigs.find(c => c.id === order.orderStatusId);
        if (byId) return byId;
    }
    return order.orderStatus
        ? statusConfigs.find(c => c.label === order.orderStatus)
        : undefined;
}

/** Get display label for an order's status */
export function getOrderStatusLabel(
    order: { orderStatusId?: string; orderStatus?: string },
    statusConfigs: OrderStatusConfiguration[]
): string {
    const config = getStatusConfigForOrder(order, statusConfigs);
    return config?.label ?? order.orderStatus ?? '—';
}

/** Resolve status config by id or label (for flexible lookups e.g. activity meta.newStatus) */
export function getStatusConfigByIdOrLabel(
    idOrLabel: string,
    statusConfigs: OrderStatusConfiguration[]
): OrderStatusConfiguration | undefined {
    if (!statusConfigs?.length) return undefined;
    const byId = statusConfigs.find(c => c.id === idOrLabel);
    if (byId) return byId;
    return statusConfigs.find(c => c.label === idOrLabel);
}

/** Resolve status config for history entry – supports statusId and status (label) */
export function getHistoryStatusConfig(
    entry: { statusId?: string; status?: string },
    statusConfigs: OrderStatusConfiguration[]
): OrderStatusConfiguration | undefined {
    if (entry.statusId) {
        const c = statusConfigs.find(x => x.id === entry.statusId);
        if (c) return c;
    }
    return entry.status ? statusConfigs.find(c => c.label === entry.status) : undefined;
}
