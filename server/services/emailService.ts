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

