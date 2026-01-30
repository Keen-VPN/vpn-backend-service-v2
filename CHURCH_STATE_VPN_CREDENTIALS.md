# Church & State Model - VPN Credentials Implementation

## ✅ Implementation Complete

The backend now supports generating VPN credentials using blind-signed tokens, implementing the "Church & State" model where no user ID is sent to VPN nodes.

## 📋 What Was Implemented

### 1. VPN Credential DTO

**File**: `src/common/dto/vpn-credential.dto.ts`

New DTO for credential requests:
- `token`: Base64-encoded original token (before blinding)
- `signature`: Base64-encoded blind-signed signature (after unblinding)
- `serverId`: VPN server ID to connect to

### 2. Token-Based Credential Generation

**File**: `src/config/vpn-config.service.ts`

Added `generateTokenBasedCredentials()` method:
- Verifies blind-signed token using CryptoService
- Finds the requested VPN server
- Generates username from token (deterministic, unique per token)
- Generates password from token + signature hash (SHA-256)
- Returns credentials with no user ID
- Includes all server connection details

### 3. VPN Credentials Endpoint

**File**: `src/config/vpn-config.controller.ts`

New endpoint:
```
POST /api/config/vpn/credentials
```

- **Auth**: None (public endpoint, but requires valid blind-signed token)
- **Rate Limit**: 50 requests per minute
- **Request Body**: `VpnCredentialDto`
- **Response**: VPN credentials (username, password, serverAddress, etc.)

### 4. Module Integration

**File**: `src/config/vpn-config.module.ts`

- Added `CryptoModule` import to enable token verification

## 🔒 Security Features

1. **Token Verification**: All credential requests must include a valid blind-signed token
2. **No User ID**: Credentials are generated without any user identification
3. **Deterministic Generation**: Same token always produces same credentials
4. **Rate Limiting**: 50 requests per minute to prevent abuse
5. **Input Validation**: DTO validation ensures proper data format

## 📊 How It Works

### Flow Diagram

```
1. Client generates random token
   ↓
2. Client blinds token and gets signature from /api/auth/vpn-token
   ↓
3. Client unblinds signature
   ↓
4. Client requests credentials: POST /api/config/vpn/credentials
   {
     "token": "base64-token",
     "signature": "base64-unblinded-signature",
     "serverId": "us-east"
   }
   ↓
5. Backend verifies token signature
   ↓
6. Backend generates credentials:
   - username: derived from token
   - password: SHA-256(token + signature)
   ↓
7. Client receives credentials (no user ID)
   ↓
8. Client connects to VPN using token-based credentials
```

### Credential Generation

**Username**: `token_{first16chars}` (sanitized)
- Derived from token prefix
- Unique per token
- No user information

**Password**: `SHA-256(token + signature)`
- Deterministic hash
- Same token always produces same password
- No user information

**Server Details**: From VPN config
- Server address
- Remote identifier (if any)
- Shared secret, certificate (if configured)

## 🔗 API Usage

### Request Example

```bash
POST /api/config/vpn/credentials
Content-Type: application/json

{
  "token": "base64-encoded-original-token",
  "signature": "base64-encoded-blind-signed-signature",
  "serverId": "us-east"
}
```

### Success Response

```json
{
  "serverAddress": "3.225.112.116",
  "remoteIdentifier": null,
  "username": "token_abc123def456",
  "password": "sha256-hash-of-token+signature",
  "sharedSecret": null,
  "certificate": null,
  "certificatePassword": null
}
```

### Error Response

```json
{
  "statusCode": 400,
  "message": "Invalid blind-signed token",
  "error": "Bad Request"
}
```

## ✅ Acceptance Criteria Met

1. **✅ Connect flow requests Blind Token**
   - Endpoint `/api/config/vpn/credentials` accepts token and signature
   - Token must be blind-signed and verified

2. **✅ VPN Credentials use Unblinded Token**
   - Password is derived from unblinded token + signature
   - Username is derived from token
   - All credentials are token-based

3. **✅ No User ID is sent to VPN Node**
   - Credentials contain no user identification
   - Only token-derived values are used
   - Backend cannot correlate credentials to users

## 🔐 Privacy Benefits

✅ **Unlinkability**: Backend cannot correlate payment with VPN usage
✅ **Anonymity**: Credentials contain no user information
✅ **Security**: Token verification prevents abuse
✅ **Deterministic**: Same token always produces same credentials (for reconnection)

## 📝 Files Modified

### New Files
- `src/common/dto/vpn-credential.dto.ts`

### Modified Files
- `src/config/vpn-config.service.ts` - Added credential generation
- `src/config/vpn-config.controller.ts` - Added credentials endpoint
- `src/config/vpn-config.module.ts` - Added CryptoModule import

## 🚀 Next Steps (Client-Side)

The client needs to:
1. Generate blind-signed token (already implemented)
2. Request credentials from `/api/config/vpn/credentials`
3. Use token-based credentials for VPN connection
4. Never send user ID to VPN nodes

## 📈 Benefits

1. **Privacy**: Users can connect without revealing identity
2. **Security**: Token verification prevents unauthorized access
3. **Compliance**: Supports privacy regulations (GDPR, etc.)
4. **Separation**: Clear separation between auth service and VPN service

## ✅ Status

**Implementation Status**: ✅ Complete and Ready for Testing

All backend components are implemented and integrated. The endpoint is ready for use by the client application.

