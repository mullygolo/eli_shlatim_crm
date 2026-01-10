import { Router } from 'express';
import {
    getPriceListProducts,
    getPriceListProduct,
    createPriceListProduct,
    updatePriceListProduct,
    deletePriceListProduct,
    searchPriceListProducts,
    getSalesHistory,
    addSalesHistoryEntry,
    getProductSalesHistory,
    getSupplierSalesHistory,
    getAdHocProducts,
    createAdHocProduct,
    suggestProductMatch,
    getOrders
} from '../services/mongoService.js';
import { sendPriceListEmail } from '../services/emailService.js';
import { Order } from '../types';

const router = Router();

// Products
router.get('/products', async (req, res) => {
    try {
        const products = await getPriceListProducts();
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

router.get('/products/:id', async (req, res) => {
    try {
        const product = await getPriceListProduct(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

router.post('/products', async (req, res) => {
    try {
        const product = await createPriceListProduct(req.body);
        res.status(201).json(product);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

router.put('/products/:id', async (req, res) => {
    try {
        const product = await updatePriceListProduct(req.body);
        res.json(product);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

router.delete('/products/:id', async (req, res) => {
    try {
        await deletePriceListProduct(req.params.id);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// CSV Import
router.post('/import-csv', async (req, res) => {
    try {
        // TODO: Implement CSV import logic
        res.status(501).json({ error: 'CSV import not yet implemented' });
    } catch (error) {
        console.error('Error importing CSV:', error);
        res.status(500).json({ error: 'Failed to import CSV' });
    }
});

// Sales History
router.get('/sales-history', async (req, res) => {
    try {
        const filters: any = {};
        if (req.query.productId) filters.productId = req.query.productId as string;
        if (req.query.supplierId) filters.supplierId = req.query.supplierId as string;
        if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
        if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
        
        const history = await getSalesHistory(filters);
        res.json(history);
    } catch (error) {
        console.error('Error fetching sales history:', error);
        res.status(500).json({ error: 'Failed to fetch sales history' });
    }
});

router.post('/sales-history', async (req, res) => {
    try {
        const entry = await addSalesHistoryEntry(req.body);
        res.status(201).json(entry);
    } catch (error) {
        console.error('Error adding sales history entry:', error);
        res.status(500).json({ error: 'Failed to add sales history entry' });
    }
});

// Ad-hoc Products
router.get('/ad-hoc-products', async (req, res) => {
    try {
        const filters: any = {};
        if (req.query.orderId) filters.orderId = req.query.orderId as string;
        if (req.query.supplierId) filters.supplierId = req.query.supplierId as string;
        if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
        if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
        
        const products = await getAdHocProducts(filters);
        res.json(products);
    } catch (error) {
        console.error('Error fetching ad-hoc products:', error);
        res.status(500).json({ error: 'Failed to fetch ad-hoc products' });
    }
});

router.post('/ad-hoc-products', async (req, res) => {
    try {
        const product = await createAdHocProduct(req.body);
        res.status(201).json(product);
    } catch (error) {
        console.error('Error creating ad-hoc product:', error);
        res.status(500).json({ error: 'Failed to create ad-hoc product' });
    }
});

// Send Email
router.post('/send-email', async (req, res) => {
    try {
        const { orderId, supplierIds, emailType } = req.body;

        if (!orderId || !supplierIds || !Array.isArray(supplierIds) || supplierIds.length === 0) {
            return res.status(400).json({ error: 'Missing required fields: orderId, supplierIds' });
        }

        if (emailType !== 'quote' && emailType !== 'order') {
            return res.status(400).json({ error: 'emailType must be "quote" or "order"' });
        }

        // Get order
        const orders = await getOrders();
        const order = orders.find(o => o.id === orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Send email to each supplier (with all their products)
        const results = [];
        for (const supplierId of supplierIds) {
            try {
                await sendPriceListEmail(order, supplierId, emailType);
                results.push({ supplierId, success: true });
            } catch (error: any) {
                console.error(`Error sending email to supplier ${supplierId}:`, error);
                results.push({ supplierId, success: false, error: error.message });
            }
        }

        res.json({ results });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

export default router;

