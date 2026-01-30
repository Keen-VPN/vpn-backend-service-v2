import { IsString, IsNotEmpty, IsBase64 } from 'class-validator';

export class VpnCredentialDto {
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  token: string; // The original token (before blinding)

  @IsString()
  @IsNotEmpty()
  @IsBase64()
  signature: string; // The blind-signed signature (after unblinding)

  @IsString()
  @IsNotEmpty()
  serverId: string; // The VPN server ID to connect to
}
