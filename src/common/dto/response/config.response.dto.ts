import { ApiProperty } from '@nestjs/swagger';

export class VPNServerDto {
  @ApiProperty({ type: String, description: 'Server ID' })
  id: string;

  @ApiProperty({ type: String, description: 'Server name' })
  name: string;

  @ApiProperty({ type: String, description: 'Country code or name' })
  country: string;

  @ApiProperty({ type: String, description: 'City name' })
  city: string;

  @ApiProperty({ type: String, description: 'Server address (IP or hostname)' })
  serverAddress: string;

  @ApiProperty({
    type: String,
    description: 'The remote identifier for IKEv2 connection',
  })
  remoteIdentifier?: string;

  @ApiProperty({
    type: String,
    description: 'Credential ID used by this server',
  })
  credentialId: string;

  @ApiProperty({
    type: String,
    description: 'Asset key for flags/icons',
    required: false,
  })
  assetKey?: string;

  @ApiProperty({ type: String, description: 'Flag URL', required: false })
  flagUrl?: string;

  @ApiProperty({
    type: Object,
    description: 'Geographic coordinates',
    required: false,
  })
  coordinates?: any;

  @ApiProperty({
    type: Boolean,
    description: 'Is this the default server?',
    required: false,
  })
  isDefault?: boolean;

  @ApiProperty({ type: Number, description: 'Sort order', required: false })
  sortOrder?: number;

  @ApiProperty({
    type: Object,
    description: 'Additional metadata',
    required: false,
  })
  metadata?: Record<string, any>;
}

export class VPNCredentialDto {
  @ApiProperty({ type: String, description: 'Credential ID' })
  id: string;

  @ApiProperty({ type: String, description: 'Username' })
  username: string;

  @ApiProperty({ type: String, description: 'Password' })
  password: string;

  @ApiProperty({
    type: String,
    description: 'Shared secret (PSK)',
    required: false,
  })
  sharedSecret?: string;

  @ApiProperty({ type: String, description: 'Certificate', required: false })
  certificate?: string;

  @ApiProperty({
    type: String,
    description: 'Certificate password',
    required: false,
  })
  certificatePassword?: string;

  @ApiProperty({
    type: Object,
    description: 'Additional metadata',
    required: false,
  })
  metadata?: Record<string, any>;
}

export class VPNRolloutDto {
  @ApiProperty({
    type: String,
    description: 'Minimum app version required',
    required: false,
  })
  minAppVersion?: string;

  @ApiProperty({
    type: String,
    description: 'Maximum app version allowed',
    required: false,
  })
  maxAppVersion?: string;

  @ApiProperty({
    type: Boolean,
    description: 'Allow during review?',
    required: false,
  })
  allowDuringReview?: boolean;

  @ApiProperty({
    type: Number,
    description: 'Staged rollout percentage',
    required: false,
  })
  stagedPercentage?: number;

  @ApiProperty({
    type: [String],
    description: 'Allowed channels',
    required: false,
  })
  channels?: string[];

  @ApiProperty({ type: Object, description: 'Metadata', required: false })
  metadata?: Record<string, string>;
}

export class VPNConfigDto {
  @ApiProperty({
    type: String,
    example: '1.0.0',
    description: 'Config version',
  })
  version: string;

  @ApiProperty({
    type: String,
    example: '2023-01-01T00:00:00.000Z',
    description: 'Last update date',
    required: false,
    nullable: true,
  })
  updatedAt: string | null;

  @ApiProperty({
    type: [VPNServerDto],
    description: 'List of available servers',
  })
  servers: VPNServerDto[];

  @ApiProperty({
    type: [VPNCredentialDto],
    description:
      'List of credentials (only present if authenticated/authorized)',
  })
  credentials: VPNCredentialDto[];

  @ApiProperty({
    type: Object,
    description: 'Feature flags',
    required: false,
    nullable: true,
  })
  featureFlags?: Record<string, boolean> | null;

  @ApiProperty({
    type: () => VPNRolloutDto,
    description: 'Rollout configuration',
    required: false,
    nullable: true,
  })
  rollout?: VPNRolloutDto | null;

  @ApiProperty({ type: Object, description: 'Metadata', required: false })
  metadata?: Record<string, string>;
}

export class VPNConfigResponseDto {
  @ApiProperty({
    type: String,
    example: 'ok',
    description: 'Status of the request',
  })
  status: 'ok' | 'not-modified';

  @ApiProperty({
    type: VPNConfigDto,
    description: 'VPN Configuration object',
    required: false,
  })
  config?: VPNConfigDto;

  @ApiProperty({ type: String, description: 'ETag for caching' })
  etag: string;
}

export class VPNCredentialsResponseDto {
  @ApiProperty({ type: String, description: 'Server geographic location' })
  serverAddress: string;

  @ApiProperty({
    type: String,
    description: 'Remote identifier',
    required: false,
  })
  remoteIdentifier?: string;

  @ApiProperty({ type: String, description: 'Username' })
  username: string;

  @ApiProperty({ type: String, description: 'Password' })
  password: string;

  @ApiProperty({ type: String, description: 'Shared secret', required: false })
  sharedSecret?: string;

  @ApiProperty({ type: String, description: 'Certificate', required: false })
  certificate?: string;

  @ApiProperty({
    type: String,
    description: 'Certificate password',
    required: false,
  })
  certificatePassword?: string;
}

export class ActiveNodeDto {
  @ApiProperty({ type: String, description: 'Node ID', example: 'us-east-1' })
  node_id: string;

  @ApiProperty({
    type: String,
    description: 'Geographic region of the node',
    example: 'Lagos, Nigeria',
  })
  region: string;
}

export class ActiveNodesResponseDto {
  @ApiProperty({
    type: String,
    example: 'ok',
    description: 'Status of the request',
  })
  status: string;

  @ApiProperty({
    type: [ActiveNodeDto],
    description: 'List of online VPN nodes',
  })
  nodes: ActiveNodeDto[];
}

export class WireGuardCredentialsResponseDto {
  @ApiProperty({
    type: String,
    description: 'WireGuard public key of the server',
    example: 'abcd...xyz',
  })
  publicKey: string;

  @ApiProperty({
    type: String,
    description: 'Public IP address of the server',
    example: '1.2.3.4',
  })
  ip: string;

  @ApiProperty({
    type: String,
    description: 'Internal IP address assigned to the client',
    example: '10.66.0.2/32',
  })
  internalIp: string;
}
