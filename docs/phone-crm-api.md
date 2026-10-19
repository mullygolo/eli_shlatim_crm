# Phone CRM API

The customer's phone number is the identifier. Send digits only. `0501234567`, `972501234567`, and `+972501234567` all match the same contact.

Base path: `/api/v1/customers`

## Authentication

Every request needs the key from the server environment variable `CRM_PHONE_API_KEY`.

```http
X-Api-Key: <CRM_PHONE_API_KEY>
```

`Authorization: Bearer <CRM_PHONE_API_KEY>` is also accepted. This is not a user login token.

| Status | Meaning |
| --- | --- |
| 401 | Missing or wrong key |
| 503 | `CRM_PHONE_API_KEY` is not set on the server |
| 404 | No customer has this phone |
| 409 | More than one customer has this phone, or POST found an existing customer |
| 400 | Body or phone is invalid |

## GET /api/v1/customers/{phone_number}

Returns the customer, the matching contact, and active orders.

An order is active when its status is a lead, a quote, or an open deal, and it is not a lost status.

```json
{
  "phone": "0501234567",
  "customer": {
    "id": "string",
    "name": "string",
    "businessId": "string | null",
    "website": "string",
    "address": "string",
    "addressStreet": "string | null",
    "addressCity": "string | null",
    "addressZip": "string | null",
    "category": "string",
    "notes": "string",
    "isSpecial": false,
    "paymentMethod": "מזומן",
    "paymentTerms": "string | null",
    "createdAt": "2026-10-20T00:00:00.000Z"
  },
  "contact": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "0501234567",
    "role": "string",
    "contactPreference": "EMAIL"
  },
  "activeOrders": [
    {
      "id": "string",
      "orderNumber": "string",
      "description": "string",
      "date": "2026-10-20T00:00:00.000Z",
      "orderStatus": "נשלח הצעת מחיר",
      "orderStatusId": "st_2",
      "paymentStatus": "לא שולם",
      "type": "הזמנה רגילה"
    }
  ]
}
```

## POST /api/v1/customers

Creates a customer when the phone is new. If the phone already exists, the response is `409` and includes the same customer object as GET.

### Body

| Field | Type | Required | Allowed values |
| --- | --- | --- | --- |
| `phone` | string | yes | At least 6 digits |
| `name` | string | no | Stored name. Defaults to the normalized phone |
| `contactName` | string | no | Contact person. Defaults to `name` |
| `email` | string | no | |
| `role` | string | no | |
| `contactPreference` | string | no | `EMAIL`, `WHATSAPP`, `PHONE` |
| `address` | string | no | |
| `addressStreet` | string | no | |
| `addressCity` | string | no | |
| `addressZip` | string | no | |
| `website` | string | no | |
| `category` | string | no | |
| `notes` | string | no | |
| `businessId` | string | no | Company or ID number |
| `paymentTerms` | string | no | |
| `isSpecial` | boolean | no | Default `false` |
| `paymentMethod` | string | no | See payment methods. Default `OTHER` |

```json
{
  "phone": "0501234567",
  "name": "Studio Ofek",
  "contactName": "Dana Levi",
  "email": "dana@example.com",
  "contactPreference": "WHATSAPP",
  "paymentMethod": "CREDIT_CARD"
}
```

## PATCH /api/v1/customers/{phone_number}

Send only the fields that change. At least one field is required.

Customer fields use the same names and types as POST, except `phone` cannot be changed here.

Interaction fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `callSummary` | string | Appended to the customer notes and, when an order is resolved, added as an order note |
| `orderStatus` | string | New status. Use an id, the Hebrew label, or an English name from the table below |
| `orderId` | string | Order to update. Required when `orderStatus` is sent and the customer has zero or more than one active order |
| `orderNumber` | string | Alternative to `orderId` |

If `orderId` and `orderNumber` are omitted and the customer has exactly one active order, that order is updated.

```json
{
  "orderId": "order-id",
  "orderStatus": "Quote Sent",
  "callSummary": "Asked for a revised price and a pickup date."
}
```

## Order statuses

Send the status `id`, the Hebrew `label`, or the English `name`. The value stored on the order is the Hebrew label plus the id. These are the statuses currently configured in the database.

| id | English name | Hebrew label |
| --- | --- | --- |
| `st_1770948407304` | `New Lead` | ליד חדש |
| `status_1770162871217_d7c89vw` | `Quote Sent` | נשלחה הצעת מחיר |
| `st_1770948515446` | `Waiting for Customer Graphics` | ממתין לגרפיקה מהלקוח |
| `status_1770162871217_og2ky72` | `In Graphics` | בגרפיקה |
| `status_1770162871216_05cjypy` | `In Production` | ירד לביצוע |
| `st_1770949027686` | `Ready for Pickup` | ממתין לאיסוף ע"י הלקוח |
| `status_1770162871216_oheasq3` | `Picked Up` | נאסף ע"י הלקוח |
| `st_1770949095446` | `Ready for Delivery` | ממתין למשלוח |
| `status_1770162871216_e86q49w` | `Shipped` | נשלח ללקוח בהצלחה |
| `st_1770948959318` | `Ready for Installation` | ממתין להתקנה |
| `status_1770162871216_wjsz93s` | `Installed` | הותקן בהצלחה |
| `status_1770162871216_32ztthe` | `Cancelled` or `Too Expensive` | לא רלוונטי/יקר |

Two older statuses remain in the database and can be sent by their Hebrew label or id only: `מוכן (לא להשתמש בסטטוס הזה יותר)` (`status_1770162871216_pnv3qe8`) and `תקלה/ בעיה לטיפול (לא להשתמש בסטטוס הזה יותר)` (`status_1770162871217_flg0bh3`).

`לא רלוונטי/יקר` is a lost status and is not returned in `activeOrders`.

## Payment methods

Send the English key or the Hebrew value.

| Key | Stored value |
| --- | --- |
| `BANK_TRANSFER` | העברה בנקאית |
| `CREDIT_CARD` | כרטיס אשראי |
| `CHECK` | צ'ק |
| `CASH` | מזומן |
| `STANDING_ORDER` | הוראת קבע |
| `BIT` | Bit/PayBox |
| `OTHER` | אחר |

## Payment status values returned on orders

These are read-only in this API: `שולם`, `לא שולם`, `שולם חלקית`.
