# Missing Backend Endpoints Analysis

This document lists all API endpoints that the macOS VPN app expects but are missing from the backend.

## Summary

**Total Missing Endpoints: 7**

1. `DELETE /auth/delete-account` (app calls this, backend has `/user/account`)
2. `POST /subscription/status-session`
3. `POST /subscription/cancel`
4. `POST /connection/session`
5. `GET /connection/sessions/{email}`
6. `GET /connection/stats/{email}`
7. `GET /config/vpn`

---

## 1. DELETE /auth/delete-account

**Status:** Endpoint mismatch - App calls `/auth/delete-account` but backend has `/user/account`

**App Expects:**
- Path: `DELETE /auth/delete-account`
- Auth: Bearer token (sessionToken) in Authorization header
- Body: `{ email: string, userId: string }`
- Response: `{ success: boolean, message?: string, error?: string }`

**Backend Has:**
- Path: `DELETE /user/account`
- Auth: FirebaseAuthGuard (Bearer token in header)
- Response: Account deletion response

**Action Required:** Either:
- Add `DELETE /auth/delete-account` endpoint that uses SessionAuthGuard, OR
- Update macOS app to call `/user/account` instead

---

## 2. POST /subscription/status-session

**Status:** MISSING

**Request:**
```json
{
  "sessionToken": "string"
}
```

**Response:**
```json
{
  "success": true,
  "hasActiveSubscription": true,
  "subscription": {
    "status": "active",
    "endDate": "2024-12-31T23:59:59.000Z",
    "cancelAtPeriodEnd": false,
    "subscriptionType": "stripe"
  },
  "trial": {
    "trialActive": false,
    "trialEndsAt": null,
    "daysRemaining": 0,
    "isPaid": true,
    "tier": null
  }
}
```

**Notes:**
- Uses session token authentication (not Firebase token)
- Should return subscription status and trial information
- `cancelAtPeriodEnd` can be Bool or Int (0/1)

---

## 3. POST /subscription/cancel

**Status:** MISSING

**Request:**
- Auth: Bearer token (sessionToken) in Authorization header OR sessionToken in body
- Body (optional): `{ sessionToken?: string }`

**Response:**
```json
{
  "success": true,
  "message": "Subscription cancelled successfully",
  "error": null
}
```

**Notes:**
- Should cancel the user's active subscription
- Can accept sessionToken in Authorization header or body

---

## 4. POST /connection/session

**Status:** MISSING

**Request:**
```json
{
  "email": "user@example.com",
  "session_start": "2024-01-15T10:00:00.000Z",
  "session_end": "2024-01-15T11:00:00.000Z", // optional
  "duration_seconds": 3600,
  "platform": "macOS",
  "app_version": "1.2.5",
  "server_location": "US - New York", // optional
  "server_address": "vpn.example.com", // optional
  "subscription_tier": "premium", // optional
  "bytes_transferred": 1024000 // optional
}
```

**Response:**
```json
{
  "success": true
}
```

**Notes:**
- Auth: Bearer token (sessionToken) in Authorization header
- Records VPN connection sessions for analytics
- All fields except email, session_start, duration_seconds, and platform are optional

---

## 5. GET /connection/sessions/{email}

**Status:** MISSING

**Request:**
- Path: `/connection/sessions/{email}?limit=50&offset=0`
- Query params: `limit` (default 50), `offset` (default 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "session_start": "2024-01-15T10:00:00.000Z",
      "session_end": "2024-01-15T11:00:00.000Z",
      "duration_seconds": 3600,
      "platform": "macOS",
      "app_version": "1.2.5"
    }
  ]
}
```

**Notes:**
- Returns paginated list of connection sessions for a user
- Should be ordered by most recent first

---

## 6. GET /connection/stats/{email}

**Status:** MISSING

**Request:**
- Path: `/connection/stats/{email}`

**Response:**
```json
{
  "success": true,
  "data": {
    "total_sessions": 150,
    "total_duration_seconds": 540000,
    "average_duration_seconds": 3600,
    "platform_breakdown": {
      "macOS": {
        "sessions": 100,
        "total_duration": 360000
      }
    }
  }
}
```

**Notes:**
- Returns aggregated connection statistics for a user
- Includes platform breakdown

---

## 7. GET /config/vpn

**Status:** MISSING

**Request:**
- Headers:
  - `If-None-Match`: etag (optional, for 304 Not Modified)
  - `X-Config-Client`: client token (optional)
  - `Accept`: application/json

**Response (200):**
```json
{
  "version": "1.0.0",
  "updatedAt": "2024-01-15T10:00:00.000Z",
  "servers": [
    {
      "id": "us-ny-01",
      "name": "New York",
      "country": "US",
      "city": "New York",
      "serverAddress": "vpn.example.com",
      "remoteIdentifier": "vpn.example.com",
      "credentialId": "cred-1",
      "assetKey": "us",
      "flagUrl": "https://example.com/flags/us.png",
      "coordinates": {
        "lat": 40.7128,
        "lng": -74.0060
      },
      "isDefault": true,
      "sortOrder": 1,
      "metadata": {}
    }
  ],
  "credentials": [
    {
      "username": "user123",
      "password": "pass123",
      "sharedSecret": "secret",
      "certificate": null,
      "certificatePassword": null,
      "metadata": {}
    }
  ],
  "featureFlags": {
    "newFeature": true
  },
  "rollout": {
    "minAppVersion": "1.0.0",
    "maxAppVersion": "2.0.0",
    "allowDuringReview": false,
    "stagedPercentage": 50,
    "channels": ["production"],
    "metadata": {}
  },
  "metadata": {}
}
```

**Response (304 Not Modified):**
- No body, just status 304 when `If-None-Match` matches current ETag

**Response Headers:**
- `ETag`: etag value for conditional requests

**Notes:**
- Should support ETag-based caching (304 Not Modified)
- Should return VPN server configuration with credentials
- Used for remote configuration management
- Should validate `X-Config-Client` token if provided

---

## Implementation Priority

1. **High Priority:**
   - `GET /config/vpn` - Required for VPN functionality
   - `POST /subscription/status-session` - Required for subscription checks
   - `DELETE /auth/delete-account` - Account management

2. **Medium Priority:**
   - `POST /subscription/cancel` - Subscription management
   - `POST /connection/session` - Analytics tracking

3. **Low Priority:**
   - `GET /connection/sessions/{email}` - User history
   - `GET /connection/stats/{email}` - User statistics

---

## Notes

- All endpoints using session tokens should use `SessionAuthGuard` instead of `FirebaseAuthGuard`
- The app expects `baseURL` to be `/api` (e.g., `https://vpnkeen.netlify.app/api`)
- All endpoints should return proper error responses with `error` field
- Date fields should be ISO8601 format with fractional seconds support

