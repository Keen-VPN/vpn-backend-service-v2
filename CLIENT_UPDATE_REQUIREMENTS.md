# Client Update Requirements for Church & State Model

## Current State Analysis

### ✅ Backend Status
- **VPN Credentials Endpoint**: ✅ Implemented (`POST /api/config/vpn/credentials`)
- **Anonymous Session Endpoint**: ✅ Implemented (`POST /api/connection/session/anonymous`)
- **Blind Signature Support**: ✅ Complete

### ❌ Client Status (iOS & macOS)

#### VPN Credentials
- **Current**: Using static credentials from `/config/vpn` endpoint
  - Username: `"client"` (hardcoded)
  - Password: `"KeenVPNClient2024Secure"` (hardcoded)
  - Same credentials for all users
- **Needs Update**: Use blind-signed tokens to get credentials from `/api/config/vpn/credentials`

#### Connection Sessions
- **Current**: Using authenticated sessions with user email
  - Endpoint: `POST /api/connection/session`
  - Includes: `email`, `userId` (from session token)
  - **NOT anonymous** - user is identifiable
- **Needs Update**: Can optionally use anonymous sessions (`POST /api/connection/session/anonymous`)

## What Needs to Be Updated

### 1. VPN Credentials Flow (Required for Church & State)

**Current Flow:**
```
1. App fetches VPN config from /config/vpn
2. Gets static credentials (username: "client", password: "KeenVPNClient2024Secure")
3. Stores in Keychain
4. Uses for VPN connection
```

**New Flow (Church & State):**
```
1. App generates random token
2. App blinds token and gets signature from /api/auth/vpn-token
3. App unblinds signature
4. App requests credentials: POST /api/config/vpn/credentials
   {
     "token": "base64-token",
     "signature": "base64-unblinded-signature",
     "serverId": "us-east"
   }
5. Backend returns token-based credentials (no user ID)
6. App stores token-based credentials in Keychain
7. App uses token-based credentials for VPN connection
```

**Files to Update:**
- `Apps/KeenVPN_iOS/KeenVPNMobile/VPNManager.swift`
- `Apps/KeenVPN_macOS/keenVPN/VPNManager.swift`
- `Apps/KeenVPN_iOS/KeenVPNMobile/APIService.swift`
- `Apps/KeenVPN_macOS/keenVPN/APIService.swift`
- `Apps/KeenVPN_iOS/KeenVPNMobile/VPNConfigService.swift` (if used)
- `Apps/KeenVPN_macOS/keenVPN/VPNConfigService.swift` (if used)

### 2. Connection Sessions (Optional - Privacy Enhancement)

**Current State:**
- Sessions are **NOT anonymous**
- They include user email and are linked to user ID
- Endpoint: `POST /api/connection/session`

**If Making Anonymous:**
- Use `POST /api/connection/session/anonymous`
- Requires blind-signed token (same token used for credentials)
- Sessions marked with `isAnonymized: true`
- No user ID sent

**Files to Update (if making anonymous):**
- `Apps/KeenVPN_iOS/KeenVPNMobile/VPNManager.swift` - `recordConnectionSessionToBackend()`
- `Apps/KeenVPN_macOS/keenVPN/VPNManager.swift` - `recordConnectionSession()`
- `Apps/KeenVPN_iOS/KeenVPNMobile/APIService.swift` - Add `recordAnonymousSession()`
- `Apps/KeenVPN_macOS/keenVPN/APIService.swift` - Add `recordAnonymousSession()`

## Implementation Checklist

### VPN Credentials (Required)
- [ ] Add `getVPNCredentials(token:signature:serverId:)` method to APIService (iOS & macOS)
- [ ] Update VPN connection flow to:
  - Generate blind-signed token before connecting
  - Request credentials from `/api/config/vpn/credentials`
  - Store token-based credentials in Keychain
  - Use token-based credentials for VPN connection
- [ ] Remove dependency on static credentials from `/config/vpn`
- [ ] Ensure no user ID is sent to VPN nodes

### Connection Sessions (Optional)
- [ ] Add `recordAnonymousSession()` method to APIService (iOS & macOS)
- [ ] Update session recording to use anonymous endpoint
- [ ] Use same blind-signed token for both credentials and sessions
- [ ] Remove user email from session recording

## Key Points

1. **VPN Credentials MUST be updated** for Church & State model
   - This is the core requirement
   - No user ID should be sent to VPN nodes
   - Credentials must be token-based

2. **Connection Sessions are OPTIONAL**
   - They don't automatically become anonymous
   - Current sessions include user email and are linked to user ID
   - Can be updated separately for privacy enhancement

3. **Token Reuse**
   - Same blind-signed token can be used for:
     - Getting VPN credentials
     - Recording anonymous sessions (if implemented)
   - Token should be generated once per connection attempt

## Privacy Impact

### Current State
- ❌ VPN credentials: Static, shared by all users
- ❌ Connection sessions: Include user email, linked to user ID
- ❌ User identifiable in both credentials and sessions

### After VPN Credentials Update (Church & State)
- ✅ VPN credentials: Token-based, no user ID
- ⚠️ Connection sessions: Still include user email (unless updated)
- ✅ User not identifiable in VPN connection

### After Both Updates
- ✅ VPN credentials: Token-based, no user ID
- ✅ Connection sessions: Anonymous, no user ID
- ✅ Complete privacy separation

## Next Steps

1. **Immediate (Required)**: Update VPN credentials flow to use blind-signed tokens
2. **Optional**: Update connection sessions to use anonymous endpoint
3. **Testing**: Verify no user ID is sent to VPN nodes
4. **Verification**: Confirm credentials are token-based and unique per token

