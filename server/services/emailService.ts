import nodemailer from 'nodemailer';
import { Order, Supplier, LineItem, AdditionalService, PriceListProduct } from '../types';
import * as mongoService from './mongoService.js';

// Create transporter for Gmail
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS // App Password
    }
});

// General email sending function
export async function sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; path?: string; content?: string; contentType?: string }>
): Promise<void> {
    try {
        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: Array.isArray(to) ? to.join(', ') : to,
            subject,
            html,
            attachments
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${Array.isArray(to) ? to.join(', ') : to}`);
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}

// Send price list email to supplier
export async function sendPriceListEmail(
    order: Order,
    supplierId: string,
    emailType: 'quote' | 'order',
    productIds?: string[]
): Promise<void> {
    try {
        // Get supplier
        const suppliers = await mongoService.getSuppliers();
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier) {
            throw new Error(`Supplier not found: ${supplierId}`);
        }

        // Get supplier email
        const supplierEmail = supplier.contacts.find(c => c.isDefault || c.isBillingContact)?.email || supplier.contacts[0]?.email;
        if (!supplierEmail) {
            throw new Error(`No email found for supplier: ${supplier.name}`);
        }

        // Filter products for this supplier
        const supplierLineItems = order.lineItems.filter(li => 
            li.supplierId === supplierId && 
            (!productIds || productIds.includes(li.priceListProductId || ''))
        );
        const supplierServices = order.additionalServices.filter(as => 
            as.supplierId === supplierId && 
            (!productIds || productIds.includes(as.priceListProductId || ''))
        );

        if (supplierLineItems.length === 0 && supplierServices.length === 0) {
            throw new Error(`No products found for supplier: ${supplier.name}`);
        }

        // Get price list products if needed
        const priceListProducts = await mongoService.getPriceListProducts();
        const productMap = new Map(priceListProducts.map(p => [p.id, p]));

        // Build email content
        const emailTitle = emailType === 'quote' ? 'בקשה להצעת מחיר' : 'הזמנה';
        
        let productsHtml = '';
        let totalQuantity = 0;
        let totalPrice = 0;

        // Line items
        supplierLineItems.forEach(item => {
            const product = item.priceListProductId ? productMap.get(item.priceListProductId) : null;
            const size = item.width && item.height ? `${item.width} x ${item.height}` : '';
            const addons = item.selectedAddons?.join(', ') || '';
            
            totalQuantity += item.quantity;
            totalPrice += item.unitPrice * item.quantity;

            productsHtml += `
                <tr>
                    <td>${item.description}</td>
                    <td>${item.quantity}</td>
                    <td>${size}</td>
                    <td>${addons}</td>
                    <td>₪${item.unitPrice.toLocaleString()}</td>
                    <td>${item.priceListNotes || item.notes || ''}</td>
                </tr>
            `;
        });

        // Additional services
        supplierServices.forEach(service => {
            const product = service.priceListProductId ? productMap.get(service.priceListProductId) : null;
            const addons = service.selectedAddons?.join(', ') || '';
            
            totalQuantity += 1;
            totalPrice += service.price;

            productsHtml += `
                <tr>
                    <td>${service.description}</td>
                    <td>1</td>
                    <td>-</td>
                    <td>${addons}</td>
                    <td>₪${service.price.toLocaleString()}</td>
                    <td>${service.priceListNotes || service.notes || ''}</td>
                </tr>
            `;
        });

        const html = `
            <!DOCTYPE html>
            <html dir="rtl" lang="he">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; direction: rtl; }
                    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                    th { background-color: #f2f2f2; }
                    .summary { margin-top: 20px; font-weight: bold; }
                </style>
            </head>
            <body>
                <h2>${emailTitle}</h2>
                <p><strong>מספר הזמנה:</strong> ${order.orderNumber}</p>
                <p><strong>תאריך:</strong> ${new Date(order.date).toLocaleDateString('he-IL')}</p>
                
                <h3>פרטי המוצרים:</h3>
                <table>
                    <thead>
                        <tr>
                            <th>שם מוצר</th>
                            <th>כמות</th>
                            <th>גודל</th>
                            <th>תוספות</th>
                            <th>מחיר מבוקש</th>
                            <th>הערות</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${productsHtml}
                    </tbody>
                </table>
                
                <div class="summary">
                    <p>סה"כ כמות: ${totalQuantity}</p>
                    <p>סה"כ מחיר: ₪${totalPrice.toLocaleString()}</p>
                </div>
                
                <p>תודה,<br>${process.env.COMPANY_NAME || 'החברה'}</p>
            </body>
            </html>
        `;

        await sendEmail(supplierEmail, emailTitle, html);
    } catch (error) {
        console.error('Error sending price list email:', error);
        throw error;
    }
}

// Send quote request to supplier for specific line item
export async function sendQuoteRequest(
    order: Order,
    lineItemId: string,
    supplierId: string,
    method: 'EMAIL' | 'WHATSAPP'
): Promise<{ success: boolean; method: string; contact?: string; error?: string }> {
    try {
        // Get supplier
        const suppliers = await mongoService.getSuppliers();
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier) {
            throw new Error(`Supplier not found: ${supplierId}`);
        }

        // Find line item
        const lineItem = order.lineItems.find(li => li.id === lineItemId);
        if (!lineItem || !lineItem.priceListProductId) {
            throw new Error(`Line item not found or missing product ID: ${lineItemId}`);
        }

        // Get product details
        const priceListProducts = await mongoService.getPriceListProducts();
        const product = priceListProducts.find(p => p.id === lineItem.priceListProductId);
        if (!product) {
            throw new Error(`Product not found: ${lineItem.priceListProductId}`);
        }

        if (method === 'EMAIL') {
            // Send via email
            const primaryContact = supplier.contacts.find(c => c.isDefault || c.isBillingContact) || supplier.contacts[0];
            const supplierEmail = primaryContact?.email;
            if (!supplierEmail) {
                throw new Error(`No email found for supplier: ${supplier.name}`);
            }

            const size = lineItem.width && lineItem.height ? `${lineItem.width} x ${lineItem.height}` : '';
            const addons = lineItem.selectedAddons?.join(', ') || '';

            const html = `
                <!DOCTYPE html>
                <html dir="rtl" lang="he">
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; direction: rtl; background-color: #f5f5f5; padding: 20px; }
                        .container { max-width: 800px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                        h1 { color: #1e3a8a; margin-bottom: 20px; }
                        .info-section { background-color: #f9fafb; padding: 15px; border-radius: 6px; margin-bottom: 20px; }
                        .info-row { margin: 8px 0; }
                        .info-label { font-weight: bold; color: #374151; }
                        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
                        th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: right; }
                        th { background-color: #f3f4f6; font-weight: bold; color: #374151; }
                        .product-name { font-weight: bold; color: #1e3a8a; }
                        .summary { margin-top: 25px; padding: 15px; background-color: #eff6ff; border-radius: 6px; }
                        .summary-item { margin: 8px 0; font-size: 16px; }
                        .summary-label { font-weight: bold; }
                        .notes { margin-top: 20px; padding: 15px; background-color: #fef3c7; border-right: 4px solid #f59e0b; border-radius: 4px; }
                        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>בקשה להצעת מחיר</h1>
                        
                        <div class="info-section">
                            <div class="info-row">
                                <span class="info-label">מספר הזמנה:</span> ${order.orderNumber}
                            </div>
                            <div class="info-row">
                                <span class="info-label">תאריך:</span> ${new Date(order.date).toLocaleDateString('he-IL')}
                            </div>
                        </div>
                        
                        <h2 style="color: #374151; margin-top: 25px;">פרטי המוצר</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>שם מוצר</th>
                                    <th>כמות</th>
                                    <th>גודל</th>
                                    <th>תוספות</th>
                                    ${lineItem.unitPrice > 0 ? '<th>מחיר מבוקש (לשם ידיעה)</th>' : ''}
                                    <th>הערות</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="product-name">${product.name}</td>
                                    <td>${lineItem.quantity}</td>
                                    <td>${size || '-'}</td>
                                    <td>${addons || '-'}</td>
                                    ${lineItem.unitPrice > 0 ? `<td>₪${(lineItem.unitPrice * lineItem.quantity).toLocaleString()}</td>` : ''}
                                    <td>${lineItem.priceListNotes || lineItem.notes || '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                        
                        ${lineItem.unitPrice > 0 ? `
                        <div class="summary">
                            <div class="summary-item">
                                <span class="summary-label">סה"כ כמות:</span> ${lineItem.quantity}
                            </div>
                            <div class="summary-item">
                                <span class="summary-label">סה"כ מחיר מבוקש:</span> ₪${(lineItem.unitPrice * lineItem.quantity).toLocaleString()}
                            </div>
                            <p style="margin-top: 10px; font-size: 14px; color: #6b7280;">
                                * המחיר מוצג לשם ידיעה בלבד. אנא שלחו את ההצעה הטובה ביותר שלכם.
                            </p>
                        </div>
                        ` : `
                        <div class="summary">
                            <p style="margin: 0; color: #1e3a8a; font-weight: bold;">
                                אנא שלחו הצעת מחיר עבור המוצר המפורט לעיל.
                            </p>
                        </div>
                        `}
                        
                        ${(lineItem.priceListNotes || lineItem.notes) ? `
                        <div class="notes">
                            <strong>הערות נוספות:</strong><br>
                            ${lineItem.priceListNotes || lineItem.notes}
                        </div>
                        ` : ''}
                        
                        <div class="footer">
                            <p>תודה,<br>${process.env.COMPANY_NAME || 'החברה'}</p>
                            <p style="margin-top: 10px; font-size: 12px;">
                                אנא השיבו להצעה בהקדם האפשרי.
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            await sendEmail(supplierEmail, 'בקשה להצעת מחיר', html);
            return { success: true, method: 'EMAIL', contact: supplierEmail };
        } else {
            // WhatsApp - return URL
            const primaryContact = supplier.contacts.find(c => c.isDefault) || supplier.contacts[0];
            const phone = primaryContact?.phone;
            if (!phone) {
                throw new Error(`No phone found for supplier: ${supplier.name}`);
            }

            // Format phone for WhatsApp
            let cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = `972${cleanPhone.substring(1)}`;
            }

            const size = lineItem.width && lineItem.height ? `${lineItem.width} x ${lineItem.height}` : '';
            const addons = lineItem.selectedAddons?.join(', ') || '';
            const priceText = lineItem.unitPrice > 0 
                ? `\nמחיר מבוקש: ₪${(lineItem.unitPrice * lineItem.quantity).toLocaleString()} (לשם ידיעה)`
                : '';
            const notesText = lineItem.priceListNotes || lineItem.notes ? `\nהערות: ${lineItem.priceListNotes || lineItem.notes}` : '';
            
            const message = `שלום,\nאני מבקש הצעת מחיר עבור:\n\nמוצר: ${product.name}\nכמות: ${lineItem.quantity}${size ? `\nגודל: ${size}` : ''}${addons ? `\nתוספות: ${addons}` : ''}${priceText}\nמספר הזמנה: ${order.orderNumber}\nתאריך: ${new Date(order.date).toLocaleDateString('he-IL')}${notesText}\n\nתודה!`;
            
            const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
            
            return { success: true, method: 'WHATSAPP', contact: whatsappUrl };
        }
    } catch (error: any) {
        console.error('Error sending quote request:', error);
        return { success: false, method, error: error.message };
    }
}
