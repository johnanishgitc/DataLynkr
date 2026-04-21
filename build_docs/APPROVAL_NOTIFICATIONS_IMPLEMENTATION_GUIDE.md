# Approval Notifications Implementation Guide

## Goal

Send a mobile push notification immediately when a new approval request is raised, but only to users who are eligible approvers for the same company connection.

In this project, eligibility is **not role-based**. A user is eligible only when:

1. `voucher_authorization` module is enabled for that user on that company, and
2. `def_apprvrej` permission is granted.

This matches the existing client access logic where approvals actions are gated by `approvals_def_apprvrej`.

---

## Existing App Context (Current Behavior)

The app already has the following API flow:

- Request creation endpoints:
  - `api/tally/place_order` (Order Entry)
  - `api/tally/vendor-mang/payment-voucher/create` (Payments, Collections, Expense Claims)
- Approval list endpoint:
  - `api/tally/pend-vch-auth`
- User access endpoint:
  - `api/access-control/user-access`

The mobile app already stores company context and sends company identifiers in payloads:

- `tallyloc_id`
- `company`
- `guid`

These fields must be used as the tenant key for notification routing.

---

## Architecture Overview

## Components

1. **Mobile App (React Native)**
   - Gets FCM token
   - Registers token with backend
   - Handles notification tap and navigates to Approvals

2. **Backend API**
   - Saves device tokens
   - Raises requests (existing APIs)
   - Resolves eligible approvers via permission rules
   - Sends push via Firebase Admin SDK

3. **Permission Source**
   - Access-control data (`voucher_authorization` + `def_apprvrej`)
   - Stored/cached in backend table for fast routing (recommended)

4. **Push Provider**
   - Firebase Cloud Messaging (FCM)
   - Android + iOS via one backend provider call

## High-Level Sequence

1. User logs in on mobile.
2. App gets FCM token and registers token with backend.
3. Sales user raises request from one source module:
   - `order_entry`
   - `payments`
   - `collections`
   - `expense_claims`
4. Backend persists voucher/request (existing behavior).
5. Backend resolves eligible approvers for same `tallyloc_id/company/guid`.
6. Backend pushes notification to those users' active tokens only.
7. Approver taps notification -> app opens Approvals and refreshes list.

---

## Data Model and Schema

Use three logical data areas:

1. Device tokens
2. User-company approval eligibility
3. Notification delivery audit

## 1) Device Tokens

```sql
CREATE TABLE user_device_tokens (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id VARCHAR(128) NOT NULL,
  user_email VARCHAR(255) NULL,
  platform VARCHAR(16) NOT NULL CHECK (platform IN ('android', 'ios')),
  device_token TEXT NOT NULL,
  device_id VARCHAR(128) NULL,
  app_version VARCHAR(32) NULL,
  os_version VARCHAR(32) NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_token)
);
```

Recommended indexes:

```sql
CREATE INDEX idx_udt_user_active ON user_device_tokens (user_id, is_active);
CREATE INDEX idx_udt_last_seen ON user_device_tokens (last_seen_at);
```

Notes:

- Keep one row per token (`UNIQUE device_token`) to avoid duplicates.
- Update token row on re-register (rotate ownership/company mapping elsewhere if needed).

## 2) User-Company Approval Access (Permission Cache)

```sql
CREATE TABLE user_company_approval_access (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id VARCHAR(128) NOT NULL,
  user_email VARCHAR(255) NULL,
  tallyloc_id BIGINT NOT NULL,
  company VARCHAR(255) NOT NULL,
  guid VARCHAR(255) NOT NULL,
  module_voucher_authorization_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve_reject BOOLEAN NOT NULL DEFAULT FALSE,
  source_version VARCHAR(64) NULL,
  refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, tallyloc_id, company, guid)
);
```

Recommended indexes:

```sql
CREATE INDEX idx_ucaa_company_eligibility
  ON user_company_approval_access (tallyloc_id, company, guid, can_approve_reject);
```

Eligibility rule:

`eligible = module_voucher_authorization_enabled = true AND can_approve_reject = true`

## 3) Notification Delivery Audit

```sql
CREATE TABLE approval_notification_events (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  event_id VARCHAR(64) NOT NULL UNIQUE,
  source_module VARCHAR(32) NOT NULL,
  tallyloc_id BIGINT NOT NULL,
  company VARCHAR(255) NOT NULL,
  guid VARCHAR(255) NOT NULL,
  raised_by_user_id VARCHAR(128) NULL,
  raised_by_email VARCHAR(255) NULL,
  voucher_number VARCHAR(64) NULL,
  voucher_master_id VARCHAR(64) NULL,
  request_payload JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

```sql
CREATE TABLE approval_notification_deliveries (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  event_id VARCHAR(64) NOT NULL,
  recipient_user_id VARCHAR(128) NOT NULL,
  device_token TEXT NOT NULL,
  fcm_message_id VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL, -- sent | failed | invalid_token | skipped
  error_code VARCHAR(128) NULL,
  error_message TEXT NULL,
  delivered_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

```sql
CREATE INDEX idx_and_event ON approval_notification_deliveries (event_id);
CREATE INDEX idx_and_recipient ON approval_notification_deliveries (recipient_user_id, created_at);
```

---

## API Contracts

## A) Register Device Token

Endpoint:

- `POST /api/notifications/register-device`

Request:

```json
{
  "deviceToken": "fcm-token",
  "platform": "android",
  "deviceId": "optional-uuid",
  "appVersion": "1.4.1",
  "osVersion": "Android 15"
}
```

Auth:

- Required (Bearer token).
- Resolve `user_id` and `user_email` from auth context.

Behavior:

- Upsert token row.
- Set `is_active = true`.
- Update `last_seen_at`.

Response:

```json
{
  "success": true
}
```

## B) Unregister Device Token

Endpoint:

- `POST /api/notifications/unregister-device`

Request:

```json
{
  "deviceToken": "fcm-token"
}
```

Behavior:

- Mark row inactive for that token.

## C) Optional Token Heartbeat

Endpoint:

- `POST /api/notifications/token-heartbeat`

Use when app resumes to keep `last_seen_at` fresh.

---

## Permission Resolution Strategy

## Authoritative Rule

A user receives approval push for company `(tallyloc_id, company, guid)` only if:

1. user has that company access and
2. `voucher_authorization` is enabled and
3. permission `def_apprvrej` is granted.

## How to Build/Refresh `user_company_approval_access`

Choose one:

1. **Event-driven sync** (best): update cache on configuration change event.
2. **Scheduled sync**: periodic job pulls all users/company mappings.
3. **On-demand fallback**: if cache missing/stale, fetch from `user-access` API per user then persist.

Recommended stale policy:

- TTL for cached eligibility: 5-15 minutes
- Hard refresh after configuration update events

---

## Notification Trigger Points

Trigger after successful creation on:

- `api/tally/place_order`
- `api/tally/vendor-mang/payment-voucher/create`

Map source module:

- `Order Entry` -> `order_entry`
- `Payments` -> `payments`
- `Collections` -> `collections`
- `Expense Claims` -> `expense_claims`

Note:

- `payment-voucher/create` serves multiple source screens. Include an explicit field in request or server context to identify source module.

---

## Notification Payload Design

Title/body:

- title: `New approval request`
- body: `Payments voucher 12345 needs approval`

Data payload (all string values):

```json
{
  "type": "approval_request",
  "sourceModule": "payments",
  "tallyloc_id": "101",
  "company": "ABC Pvt Ltd",
  "guid": "3f2c...",
  "voucherNumber": "12345",
  "voucherMasterId": "998877",
  "eventId": "appr_ntf_20260420_abcdef"
}
```

Why include tenant keys in payload:

- Safely route to correct company context after tap.
- Debug mismatches during QA.

---

## Backend Pseudocode

## 1) Trigger from Request-Creation Endpoint

```ts
async function createOrderHandler(req, res) {
  const result = await createOrderInTallyAndDb(req.body); // existing flow

  if (!result.success) return res.status(400).json(result);

  const event = {
    sourceModule: "order_entry",
    tallyloc_id: req.body.tallyloc_id,
    company: req.body.company,
    guid: req.body.guid,
    voucherNumber: result.data?.voucherNumber ?? null,
    voucherMasterId: result.data?.lastVchId ?? null,
    raisedByUserId: req.auth.userId,
    raisedByEmail: req.auth.email
  };

  // fire-and-forget (queue recommended)
  enqueueApprovalNotificationEvent(event);

  return res.json(result);
}
```

## 2) Queue Worker

```ts
async function processApprovalNotificationEvent(event) {
  const eventId = generateEventId();
  await auditEvents.insert({ event_id: eventId, ...event });

  const eligibleUsers = await db.query(`
    SELECT user_id
    FROM user_company_approval_access
    WHERE tallyloc_id = :tallyloc_id
      AND company = :company
      AND guid = :guid
      AND module_voucher_authorization_enabled = TRUE
      AND can_approve_reject = TRUE
  `, event);

  if (eligibleUsers.length === 0) {
    return;
  }

  const userIds = eligibleUsers.map(u => u.user_id);

  const tokens = await db.query(`
    SELECT user_id, device_token, platform
    FROM user_device_tokens
    WHERE user_id IN (:userIds)
      AND is_active = TRUE
  `, { userIds });

  // Optional: exclude raiser from recipients
  const filteredTokens = tokens.filter(t => t.user_id !== event.raisedByUserId);

  if (filteredTokens.length === 0) return;

  const fcmPayload = {
    notification: {
      title: "New approval request",
      body: `${toLabel(event.sourceModule)} voucher ${event.voucherNumber ?? ""} needs approval`
    },
    data: {
      type: "approval_request",
      sourceModule: event.sourceModule,
      tallyloc_id: String(event.tallyloc_id),
      company: event.company,
      guid: event.guid,
      voucherNumber: String(event.voucherNumber ?? ""),
      voucherMasterId: String(event.voucherMasterId ?? ""),
      eventId
    },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default" } } }
  };

  const response = await fcm.sendEachForMulticast({
    ...fcmPayload,
    tokens: filteredTokens.map(t => t.device_token)
  });

  // persist outcomes + deactivate invalid tokens
  for (let i = 0; i < response.responses.length; i++) {
    const r = response.responses[i];
    const tokenRow = filteredTokens[i];

    if (r.success) {
      await deliveries.insert({
        event_id: eventId,
        recipient_user_id: tokenRow.user_id,
        device_token: tokenRow.device_token,
        status: "sent",
        fcm_message_id: r.messageId,
        delivered_at: now()
      });
      continue;
    }

    const code = r.error?.code ?? "unknown";
    const message = r.error?.message ?? "unknown";
    const invalid = isInvalidTokenError(code);

    await deliveries.insert({
      event_id: eventId,
      recipient_user_id: tokenRow.user_id,
      device_token: tokenRow.device_token,
      status: invalid ? "invalid_token" : "failed",
      error_code: code,
      error_message: message
    });

    if (invalid) {
      await db.execute(`
        UPDATE user_device_tokens
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE device_token = :token
      `, { token: tokenRow.device_token });
    }
  }
}
```

## 3) Eligibility Sync Pseudocode

```ts
async function refreshUserCompanyApprovalAccess(userId, companyCtx) {
  const access = await accessControlApi.getUserAccess({
    userId,
    tallylocId: companyCtx.tallyloc_id,
    co_guid: companyCtx.guid
  });

  const modules = access.data?.modules ?? [];
  const va = modules.find(m => lower(m.module_name) === "voucher_authorization");
  const moduleEnabled = toBool(va?.is_enabled ?? va?.enabled ?? va?.is_granted ?? va?.granted ?? true);

  let canApproveReject = false;
  const perms = va?.permissions ?? [];
  for (const p of perms) {
    const key = String(p.permission_key ?? p.permission_name ?? "").trim();
    if (key === "def_apprvrej") {
      canApproveReject = toBool(p.is_granted ?? p.granted ?? p.value);
      break;
    }
  }

  await upsertUserCompanyApprovalAccess({
    user_id: userId,
    tallyloc_id: companyCtx.tallyloc_id,
    company: companyCtx.company,
    guid: companyCtx.guid,
    module_voucher_authorization_enabled: moduleEnabled,
    can_approve_reject: canApproveReject,
    refreshed_at: now()
  });
}
```

---

## Frontend Integration Blueprint

## Dependencies

- `@react-native-firebase/app`
- `@react-native-firebase/messaging`

## App Startup / Login Flow

1. Request permission (Android 13+, iOS).
2. Get FCM token.
3. Call `POST /notifications/register-device`.
4. Listen token refresh and re-register.

Pseudocode:

```ts
async function registerPushToken() {
  const authStatus = await messaging().requestPermission();
  const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED
    || authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!enabled) return;

  const token = await messaging().getToken();
  await apiService.registerDevice({
    deviceToken: token,
    platform: Platform.OS,
    appVersion: APP_VERSION,
    osVersion: DeviceInfo.getSystemVersion()
  });
}

messaging().onTokenRefresh(async (newToken) => {
  await apiService.registerDevice({ deviceToken: newToken, platform: Platform.OS });
});
```

## Notification Tap Routing

Pseudocode:

```ts
function handleApprovalNotificationOpen(remoteMessage) {
  const data = remoteMessage?.data ?? {};
  if (data.type !== "approval_request") return;

  // optionally switch company context if required by payload
  // then navigate to approvals
  navigationRef.navigate("MainTabs");
  navigationRef.navigate("ApprovalsTab");
  navigationRef.navigate("ApprovalsScreen", { refreshToken: Date.now() });
}

messaging().onNotificationOpenedApp(handleApprovalNotificationOpen);
const initial = await messaging().getInitialNotification();
if (initial) handleApprovalNotificationOpen(initial);
```

## Logout Cleanup

On logout:

1. call `unregister-device` with token
2. sign out locally

---

## Idempotency and Duplicate Control

Potential duplicate sources:

- API retries
- queue retries
- temporary FCM errors

Controls:

1. Generate deterministic `event_id` or keep dedupe key:
   - `source_module + voucher_master_id + created_date`
2. `approval_notification_events.event_id` unique constraint
3. Skip if event already processed

---

## Error Handling Matrix

1. **No eligible approver users**
   - Behavior: skip push; no API failure
   - Audit status: `skipped_no_recipient`

2. **Eligible users but no active tokens**
   - Behavior: skip push; no API failure
   - Audit status: `skipped_no_token`

3. **FCM transient failure**
   - Retry with exponential backoff (queue retries)

4. **Invalid token**
   - Mark token inactive immediately

5. **Permission cache stale/missing**
   - On-demand refresh fallback before final skip

6. **Notification subsystem down**
   - Never fail request creation endpoint
   - Log and retry asynchronously

---

## Security and Compliance

1. Do not trust client for recipient targeting.
2. Resolve eligibility server-side only.
3. Include only non-sensitive info in push body.
4. Keep detailed info for in-app fetch (`pend-vch-auth`) after auth.
5. Ensure tenant scoping always uses all keys:
   - `tallyloc_id`
   - `company`
   - `guid`

---

## Observability

Track metrics:

1. `approval_notifications.events_created`
2. `approval_notifications.recipients_resolved`
3. `approval_notifications.sent`
4. `approval_notifications.failed`
5. `approval_notifications.invalid_token`
6. `approval_notifications.latency_ms` (raise request -> send attempt)

Suggested structured logs:

```json
{
  "event": "approval_notification_dispatch",
  "eventId": "appr_ntf_...",
  "sourceModule": "payments",
  "tallyloc_id": 101,
  "company": "ABC Pvt Ltd",
  "guid": "3f2c...",
  "eligibleUsers": 4,
  "tokenCount": 6,
  "successCount": 5,
  "failureCount": 1
}
```

---

## Rollout Plan

## Phase 1 - Backend Foundation

1. Add schemas and migrations.
2. Add register/unregister token APIs.
3. Add FCM service + queue worker.
4. Add audit tables and logs.

## Phase 2 - Eligibility Wiring

1. Build permission cache refresh job.
2. Implement strict eligibility query.
3. Add on-demand fallback refresh.

## Phase 3 - Client Integration

1. Add RN Firebase messaging.
2. Register token on login/app start.
3. Handle tap navigation and refresh approvals.

## Phase 4 - Hardening

1. Retry/backoff policy.
2. Invalid token cleanup.
3. dashboards + alerts.

---

## QA / Test Plan

## Functional Cases

1. User with `def_apprvrej=true` receives push.
2. User without `def_apprvrej` does not receive push.
3. `voucher_authorization` disabled user does not receive push.
4. Different company user does not receive push.
5. Raiser exclusion works (if enabled).

## Source Coverage

1. Order Entry request -> push delivered.
2. Payments request -> push delivered.
3. Collections request -> push delivered.
4. Expense Claims request -> push delivered.

## Device/State Cases

1. App foreground: in-app behavior expected.
2. App background: system notification shown.
3. App killed: tap opens app and navigates Approvals.

## Failure Cases

1. Invalid token deactivated.
2. FCM temporary outage retries.
3. Permission cache missing uses fallback refresh.

---

## Optional Enhancements

1. Badge counts on Approvals tab.
2. Notification preferences (mute by module).
3. Quiet hours and digest mode.
4. Real-time socket fallback when app is open.
5. SLA-based reminder notifications for pending approvals.

---

## Implementation Notes Specific to This Repository

1. Keep existing approval list source unchanged:
   - `api/tally/pend-vch-auth`
2. Use existing tenant identifiers already sent by creation APIs:
   - `tallyloc_id`, `company`, `guid`
3. Use existing access-control semantics:
   - module: `voucher_authorization`
   - permission key: `def_apprvrej`
4. For `payment-voucher/create`, include/derive explicit `sourceModule` to distinguish:
   - `payments`, `collections`, `expense_claims`

---

## Definition of Done

Feature is complete when all are true:

1. Device token register/unregister endpoints live.
2. Notification event generated on all 4 request sources.
3. Recipients are filtered only by permission-based eligibility.
4. Push arrives on eligible approver devices.
5. Tap opens Approvals and refreshes vouchers list.
6. Invalid tokens auto-deactivate.
7. Audit logs/tables show per-recipient delivery status.
8. Integration tests and QA matrix pass.

