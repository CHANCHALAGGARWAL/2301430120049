# Notification System Design

## Stage 1

### REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/notifications | Create a new notification |
| GET | /api/v1/notifications/:studentId | Get all notifications for a student |
| GET | /api/v1/notifications/:studentId/unread | Get unread notifications |
| PUT | /api/v1/notifications/:id/read | Mark a notification as read |
| PUT | /api/v1/notifications/read-all/:studentId | Mark all notifications as read |
| DELETE | /api/v1/notifications/:id | Delete a notification |

---

### JSON Request & Response Structures

#### POST /api/v1/notifications
**Request Body:**
```json
{
  "studentId": "string",
  "type": "Event | Result | Placement",
  "message": "string",
  "timestamp": "ISO8601 datetime string"
}
```
**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "studentId": "string",
    "type": "Placement",
    "message": "CSX Corporation hiring",
    "isRead": false,
    "timestamp": "2026-04-22T17:51:18Z"
  }
}
```

#### GET /api/v1/notifications/:studentId
**Headers:**
```
Authorization: Bearer <token>
```
**Response (200):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "type": "Result",
        "message": "mid-sem",
        "isRead": false,
        "timestamp": "2026-04-22T17:51:30Z"
      }
    ],
    "total": 10,
    "unreadCount": 3
  }
}
```

#### PUT /api/v1/notifications/:id/read
**Headers:**
```
Authorization: Bearer <token>
```
**Response (200):**
```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {
    "id": "uuid",
    "isRead": true
  }
}
```

#### DELETE /api/v1/notifications/:id
**Headers:**
```
Authorization: Bearer <token>
```
**Response (200):**
```json
{
  "success": true,
  "message": "Notification deleted successfully"
}
```

---

### Real-Time Notification Mechanism

**Chosen Approach: Server-Sent Events (SSE)**

**Endpoint:**
```
GET /api/v1/notifications/stream/:studentId
```

**Why SSE over WebSockets:**
- Notifications are one-directional (server → client), so WebSockets are overkill
- SSE is simpler to implement, uses standard HTTP, and auto-reconnects
- Lower overhead compared to WebSocket handshake
- Natively supported in browsers without extra libraries

**SSE Flow:**
1. Frontend opens a persistent SSE connection on page load
2. Server pushes new notification events in real-time
3. Frontend displays a toast/badge update instantly
4. On disconnect, browser auto-reconnects

**SSE Event Format:**
```
event: notification
data: {"id":"uuid","type":"Placement","message":"TCS hiring drive","timestamp":"2026-06-08T10:00:00Z"}
```

---

## Stage 2

### Chosen Database: PostgreSQL (Relational)

**Why PostgreSQL:**
- Structured notification data with defined fields (type, studentId, isRead, timestamp)
- Strong ACID compliance ensures no notification is lost
- Excellent support for indexing, which is critical for this use case
- Scales well with proper indexing and partitioning

### DB Schema

```sql
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  roll_no VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast unread notification fetch per student
CREATE INDEX idx_notifications_student_unread 
  ON notifications(student_id, is_read, created_at DESC);

-- Index for notification type filtering
CREATE INDEX idx_notifications_type 
  ON notifications(type);
```

### Problems as Data Volume Increases

| Problem | Cause | Solution |
|---------|-------|----------|
| Slow reads | Full table scan on large notifications table | Composite indexes on (student_id, is_read) |
| Storage bloat | Old notifications never deleted | Archiving + TTL policy |
| Write bottleneck | Bulk inserts for 50,000 students | Message queues (Redis/RabbitMQ) |
| Connection overload | Too many concurrent DB connections | Connection pooling (PgBouncer) |

### SQL Queries

**Fetch unread notifications for a student:**
```sql
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at DESC;
```

**Fetch students who got a Placement notification in last 7 days:**
```sql
SELECT DISTINCT s.id, s.name, s.email, s.roll_no
FROM students s
JOIN notifications n ON s.id = n.student_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

---

## Stage 3

### Query Analysis

**Original Query:**
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

### Is this query accurate?
The query is logically correct — it fetches unread notifications for a student and sorts by oldest first. However, it has performance issues.

### Why is it slow?

1. **`SELECT *`** fetches all columns including large TEXT fields unnecessarily
2. **No index** on `(studentID, isRead)` means a full table scan on 5,000,000 rows
3. With 50,000 students and millions of notifications, this is extremely expensive
4. **Computation cost: O(n)** — linear scan across entire table

### Is adding indexes on every column a good idea?

**No.** This advice is ineffective and harmful because:
- Every index slows down INSERT/UPDATE/DELETE operations
- Indexes consume significant disk space
- The query planner can only use a limited number of indexes per query
- Random indexes without query analysis provide no benefit

### Fix: Targeted Composite Index

```sql
-- Create a targeted composite index
CREATE INDEX idx_notifications_student_unread 
  ON notifications(student_id, is_read, created_at ASC);

-- Optimized query
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at ASC;
```

This reduces cost from **O(n) full scan** to **O(log n + k)** where k = matching rows.

### Query: Students with Placement notification in last 7 days

```sql
SELECT DISTINCT s.id, s.name, s.email
FROM students s
JOIN notifications n ON s.id = n.student_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

---

## Stage 4

### Problem
Notifications are fetched from DB on every page load for every student, overwhelming the database.

### Suggested Solutions

#### Solution 1: Redis Caching (Recommended)

**Approach:**
- Cache each student's notifications in Redis with a TTL of 60 seconds
- On page load, check Redis first; only hit DB on cache miss
- Invalidate cache when a new notification arrives or is marked read

**Tradeoffs:**
| Pro | Con |
|-----|-----|
| Drastically reduces DB load | Slight staleness (up to TTL seconds) |
| Sub-millisecond reads | Extra infrastructure (Redis server) |
| Easy to implement | Cache invalidation complexity |

**Pseudocode:**
```
function getNotifications(studentId):
  cached = redis.get("notifications:" + studentId)
  if cached: return cached

  data = db.query("SELECT ... WHERE student_id = ?", studentId)
  redis.set("notifications:" + studentId, data, TTL=60)
  return data
```

#### Solution 2: Pagination

Fetch notifications in pages instead of all at once:
```
GET /api/v1/notifications/:studentId?page=1&limit=20
```

**Tradeoffs:**
| Pro | Con |
|-----|-----|
| Reduces data transferred per request | Requires frontend pagination UI |
| Works without extra infrastructure | Student may miss newer notifications |

#### Solution 3: Combination (Best for Production)

Use **Redis caching + Pagination** together:
- Cache the first page (most recent 20 notifications) per student
- Fetch older pages directly from DB (rare operation)
- Invalidate cache on new notification via SSE event

---

## Stage 5

### Shortcomings of Original Implementation

```python
function notify_all(student_ids: array, message: string):
  for student_id in student_ids:
    send_email(student_id, message)  
    save_to_db(student_id, message)  
    push_to_app(student_id, message) 
```

**Problems:**
1. **Sequential processing** — 50,000 students processed one by one; extremely slow
2. **No fault tolerance** — if `send_email` fails at student #200, remaining 49,800 are skipped
3. **Email and DB are coupled** — if DB insert fails, email already sent; inconsistent state
4. **No retry mechanism** — failed sends are permanently lost
5. **Blocking operation** — server is locked until all 50,000 are processed

### Should email and DB save happen together?

**Yes, they should be atomic or at least eventually consistent.** If an email is sent but DB save fails, the student gets notified but the system has no record — this breaks audit trails. Ideally, save to DB first, then trigger email asynchronously.

### Redesigned Implementation

**Use a Message Queue (e.g., Redis Queue / BullMQ):**

```typescript
async function notify_all(student_ids: string[], message: string): Promise<void> {
  Log("backend", "info", "service", `notify_all triggered for ${student_ids.length} students`);
  
  const jobs = student_ids.map(student_id => ({
    name: "send-notification",
    data: { student_id, message }
  }));

  await notificationQueue.addBulk(jobs);
  Log("backend", "info", "service", `${jobs.length} jobs enqueued successfully`);
}

notificationQueue.process("send-notification", 100, async (job) => {
  const { student_id, message } = job.data;

  try {
    await save_to_db(student_id, message);
    Log("backend", "info", "db", `Notification saved to DB for student ${student_id}`);

    await send_email(student_id, message);
    Log("backend", "info", "service", `Email sent to student ${student_id}`);

    await push_to_app(student_id, message);
    Log("backend", "info", "middleware", `Real-time push sent to student ${student_id}`);

  } catch (error) {
    Log("backend", "error", "service", `Failed for student ${student_id}: ${error.message}`);
    throw error; 
  }
});
```

**Key Improvements:**
| Issue | Fix |
|-------|-----|
| Sequential processing | Parallel workers (100 at a time) |
| No fault tolerance | Automatic retry on failure |
| Coupled operations | DB save before email (ordered) |
| Blocking server | Async queue, server returns immediately |
| No observability | Logging at every step |
