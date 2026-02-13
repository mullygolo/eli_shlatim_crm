/**
 * Migration: עדכון שמות סטטוסים בהזמנות ו-statusHistory
 * 
 * מעדכן orderStatus ו-statusHistory[].status לפי מיפוי משמות ישנים לשמות חדשים.
 * לא משנה תאריכים (dealStartDate, statusHistory[].startDate וכו').
 * 
 * הרצה: מהתיקייה server: npx tsx scripts/migrate-order-statuses.ts
 */

import 'dotenv/config';
import { MongoClient, Db, type AnyBulkWriteOperation, type Document } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || '';
const DB_NAME = process.env.DB_NAME || 'elishlatim';

const MAPPINGS: { from: string; to: string }[] = [
  { from: "נאסף/נשלח", to: "נאסף ע\"י הלקוח" },
  { from: "נאסף", to: "נאסף ע\"י הלקוח" },
  { from: "נאסף בהצלחה", to: "נאסף ע\"י הלקוח" },
  { from: "סופק", to: "נשלח ללקוח בהצלחה" },
  { from: "נשלח ללקוח", to: "נשלח ללקוח בהצלחה" },
  { from: "מוכן, הותקן", to: "הותקן בהצלחה" },
  { from: "מוכן", to: "מוכן (לא להשתמש בסטטוס הזה יותר)" },
  { from: "ממתין לאיסוף", to: "ממתין לאיסוף ע\"י הלקוח" },
  { from: "הצעת מחיר", to: "נשלחה הצעת מחיר" },
  { from: "נשלח הצעת מחיר", to: "נשלחה הצעת מחיר" },
  { from: "תקלה/ בעיה לטיפול", to: "תקלה/ בעיה לטיפול (לא להשתמש בסטטוס הזה יותר)" },
];

async function runMigration(db: Db): Promise<void> {
  const ordersCol = db.collection('orders');
  const totalOrders = await ordersCol.countDocuments();
  console.log(`\nסה"כ הזמנות במערכת: ${totalOrders}`);

  // דיווח: אילו סטטוסים קיימים בהזמנות (ניתן להסיר לאחר המיגרציה)
  const statusCounts = await ordersCol.aggregate([
    { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();
  console.log('\nסטטוסים בהזמנות:');
  for (const s of statusCounts as { _id: string; count: number }[]) {
    const willUpdate = MAPPINGS.some(m => m.from === s._id);
    console.log(`  "${s._id}": ${s.count} הזמנות${willUpdate ? ' ✓ יועדכן' : ''}`);
  }
  console.log('');

  const orders = await ordersCol.find({}).toArray();
  const bulkOps: AnyBulkWriteOperation<Document>[] = [];
  const changesByMapping: Record<string, number> = {};

  for (const order of orders) {
    let changed = false;
    const updates: Record<string, unknown> = {};

    // עדכון orderStatus
    const statusMapping = MAPPINGS.find(m => m.from === order.orderStatus);
    if (statusMapping) {
      updates.orderStatus = statusMapping.to;
      changed = true;
      const key = `${statusMapping.from} → ${statusMapping.to}`;
      changesByMapping[key] = (changesByMapping[key] || 0) + 1;
    }

    // עדכון statusHistory
    const statusHistory = order.statusHistory as Array<{ status: string; startDate?: Date; endDate?: Date }> | undefined;
    if (statusHistory && Array.isArray(statusHistory) && statusHistory.length > 0) {
      const newHistory = statusHistory.map(entry => {
        const map = MAPPINGS.find(m => m.from === entry.status);
        if (map) {
          changed = true;
          return { ...entry, status: map.to };
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

  console.log(`\nעודכנו ${bulkOps.length} הזמנות\n`);
  if (Object.keys(changesByMapping).length > 0) {
    console.log('פירוט לפי מיפוי:');
    for (const [key, count] of Object.entries(changesByMapping)) {
      console.log(`  ${key}: ${count} הזמנות`);
    }
  }
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

async function main(): Promise<void> {
  if (!MONGO_URI) {
    console.error('שגיאה: MONGO_URI לא הוגדר. ודא שקובץ .env קיים ומוגדר.');
    process.exit(1);
  }

  console.log('=== מיגרציית סטטוסים ===');
  console.log(`מסד נתונים: ${DB_NAME}`);

  const client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // גיבוי
    console.log('\nיוצר גיבוי...');
    await createBackup(db);

    // הרצת מיגרציה
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
