/**
 * Migration: מילוי orderStatusId ו-statusHistory[].statusId לפי orderStatus/status (label)
 *
 * טוען statusConfigs ממסד הנתונים, וממלא orderStatusId לכל הזמנה לפי מיפוי label→id.
 * כמו כן ממלא statusId ב-statusHistory לכל entry לפי status (label).
 * orderStatus ו-status נשארים לצורך fallback/legacy.
 *
 * הרצה: מהתיקייה server: npx tsx scripts/migrate-order-status-to-id.ts
 */

import 'dotenv/config';
import { MongoClient, Db, type AnyBulkWriteOperation, type Document } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || '';
const DB_NAME = process.env.DB_NAME || 'elishlatim';

interface StatusConfigDoc {
    _id?: unknown;
    id: string;
    label: string;
}

async function loadStatusConfigs(db: Db): Promise<Map<string, string>> {
    const col = db.collection<StatusConfigDoc>('statusConfigs');
    const docs = await col.find({}).toArray();
    const labelToId = new Map<string, string>();
    for (const d of docs) {
        if (d.label) labelToId.set(d.label.trim(), d.id);
    }
    return labelToId;
}

async function createBackup(db: Db): Promise<string> {
    const ordersCol = db.collection('orders');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const backupColName = `orders_backup_${dateStr}_${timeStr}`;
    const docs = await ordersCol.find({}).toArray();
    const backupCol = db.collection(backupColName);
    if (docs.length > 0) {
        await backupCol.insertMany(docs);
    }
    console.log(`גיבוי נוצר: ${backupColName} (${docs.length} מסמכים)`);
    return backupColName;
}

async function runMigration(db: Db): Promise<void> {
    const labelToId = await loadStatusConfigs(db);
    console.log(`\nנטענו ${labelToId.size} סטטוסים מהגדרות`);

    const ordersCol = db.collection('orders');
    const orders = await ordersCol.find({}).toArray();
    const bulkOps: AnyBulkWriteOperation<Document>[] = [];
    let countOrderStatus = 0;
    let countHistory = 0;
    const unmappedLabels = new Set<string>();

    for (const order of orders) {
        const updates: Record<string, unknown> = {};
        let changed = false;

        // orderStatusId
        const orderStatus = (order.orderStatus as string)?.trim?.() || '';
        if (orderStatus && !order.orderStatusId) {
            const id = labelToId.get(orderStatus);
            if (id) {
                updates.orderStatusId = id;
                countOrderStatus++;
                changed = true;
            } else {
                unmappedLabels.add(orderStatus);
            }
        }

        // statusHistory[].statusId
        const statusHistory = order.statusHistory as Array<{ status: string; statusId?: string; startDate?: Date; endDate?: Date }> | undefined;
        if (statusHistory && Array.isArray(statusHistory) && statusHistory.length > 0) {
            const newHistory = statusHistory.map(entry => {
                const label = (entry.status as string)?.trim?.() || '';
                if (label && !entry.statusId) {
                    const sid = labelToId.get(label);
                    if (sid) {
                        countHistory++;
                        changed = true;
                        return { ...entry, statusId: sid };
                    }
                    unmappedLabels.add(label);
                }
                return entry;
            });
            updates.statusHistory = newHistory;
        }

        if (changed) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: order._id },
                    update: { $set: updates },
                },
            });
        }
    }

    if (bulkOps.length > 0) {
        await ordersCol.bulkWrite(bulkOps);
    }

    console.log(`\nעודכנו ${bulkOps.length} הזמנות`);
    console.log(`  orderStatusId: ${countOrderStatus} שדות`);
    console.log(`  statusHistory[].statusId: ${countHistory} רשומות`);
    if (unmappedLabels.size > 0) {
        console.log('\nתוויות ללא התאמה (לא עודכנו):');
        for (const l of [...unmappedLabels].sort()) {
            console.log(`  "${l}"`);
        }
    }
}

async function main(): Promise<void> {
    if (!MONGO_URI) {
        console.error('שגיאה: MONGO_URI לא הוגדר. ודא שקובץ .env קיים ומוגדר.');
        process.exit(1);
    }

    console.log('=== מיגרציית orderStatusId ===');
    console.log(`מסד נתונים: ${DB_NAME}`);

    const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
    });

    try {
        await client.connect();
        const db = client.db(DB_NAME);

        console.log('\nיוצר גיבוי...');
        await createBackup(db);

        console.log('\nמבצע מיגרציה...');
        await runMigration(db);

        console.log('\nהמיגרציה הושלמה בהצלחה.');
    } catch (error) {
        console.error('שגיאה:', error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

main();
