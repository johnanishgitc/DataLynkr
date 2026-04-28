# Geo-Tracking Salesperson Assignment Schema

This document outlines the finalized MySQL schema and API documentation for the Geo-Tracking module.

## 1. Database Schema (MySQL)

### Table: `geo_tracking_orders`
Parent table storing the assignment metadata.

| Column | Type | Description |
| :--- | :--- | :--- |
| `masterid` | `INT` | Primary Key (Assignment ID) |
| `tallyloc_id` | `INT` | Tally Location ID |
| `company` | `VARCHAR(255)` | Company Name |
| `guid` | `VARCHAR(255)` | Company GUID |
| `id` | `INT` | Salesperson User ID |
| `name` | `VARCHAR(255)` | Salesperson Name |
| `email` | `VARCHAR(255)` | Salesperson Email |
| `is_active` | `BOOLEAN` | Active status |
| `created_at` | `TIMESTAMP` | Record creation time |
| `updated_at` | `TIMESTAMP` | Record last update time |

### Table: `geo_tracking_customers`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INT` | PK |
| `geo_tracking_masterid` | `INT` | FK → `geo_tracking_orders.masterid` |
| `customer_name` | `VARCHAR(255)` | Assigned customer |

### Table: `geo_tracking_days`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INT` | PK |
| `geo_tracking_masterid` | `INT` | FK → `geo_tracking_orders.masterid` |
| `day_of_week` | `VARCHAR(20)` | Scheduled day |

### Table: `geo_tracking_dates`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INT` | PK |
| `geo_tracking_masterid` | `INT` | FK → `geo_tracking_orders.masterid` |
| `scheduled_date` | `DATE` | Scheduled date |

---

## 2. API Endpoints

### **Create Assignment**
`POST /api/geo-tracking/create`

**Payload:**
```json
{
  "tallyloc_id": 97,
  "company": "Data Lynkr",
  "guid": "...",
  "id": 92,
  "name": "JAG",
  "email": "sales@example.com",
  "customers": ["..."],
  "days": ["Monday"],
  "dates": ["2026-04-24", "2026-04-26"]
}
```

### **List Assignments**
`POST /api/geo-tracking/list`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "masterid": 1,
      "id": 92,
      "name": "JAG",
      "email": "sales@example.com",
      "company": "Data Lynkr",
      "customers": ["..."],
      "days": ["Monday"],
      "dates": ["2026-04-24", "2026-04-26"]
    }
  ]
}
```

### **Update Assignment**
`PUT /api/geo-tracking/update`
**Payload:** Same as Create, must include `masterid`.

### **Delete Assignment**
`DELETE /api/geo-tracking/delete`
**Payload:** `{ "masterid": 1, "tallyloc_id": 97, "company": "...", "guid": "..." }`
