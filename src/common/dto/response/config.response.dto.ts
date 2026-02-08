import { ApiProperty } from '@nestjs/swagger';

export class VPNServerDto {
    @ApiProperty({ description: 'Server ID' })
    id: string;

    @ApiProperty({ description: 'Server name' })
    name: string;

    @ApiProperty({ description: 'Country code or name' })
    country: string;

    @ApiProperty({ description: 'City name' })
    city: string;

    @ApiProperty({ description: 'Server address (IP or hostname)' })
    serverAddress: string;

    @ApiProperty({ description: 'Remote identifier', required: false })
    remoteIdentifier?: string;

    @ApiProperty({ description: 'Credential ID used by this server' })
    credentialId: string;

    @ApiProperty({ description: 'Asset key for flags/icons', required: false })
    assetKey?: string;

    @ApiProperty({ description: 'Flag URL', required: false })
    flagUrl?: string;

    @ApiProperty({ description: 'Geographic coordinates', required: false })
    coordinates?: any;

    @ApiProperty({ description: 'Is this the default server?', required: false })
    isDefault?: boolean;

    @ApiProperty({ description: 'Sort order', required: false })
    sortOrder?: number;

    @ApiProperty({ description: 'Additional metadata', required: false })
    metadata?: Record<string, string>;
}

export class VPNCredentialDto {
    @ApiProperty({ description: 'Credential ID' })
    id: string;

    @ApiProperty({ description: 'Username' })
    username: string;

    @ApiProperty({ description: 'Password' })
    password: string;

    @ApiProperty({ description: 'Shared secret (PSK)', required: false })
    sharedSecret?: string;

    @ApiProperty({ description: 'Certificate', required: false })
    certificate?: string;

    @ApiProperty({ description: 'Certificate password', required: false })
    certificatePassword?: string;

    @ApiProperty({ description: 'Additional metadata', required: false })
    metadata?: Record<string, string>;
}

export class VPNRolloutDto {
    @ApiProperty({ description: 'Minimum app version required', required: false })
    minAppVersion?: string;

    @ApiProperty({ description: 'Maximum app version allowed', required: false })
    maxAppVersion?: string;

    @ApiProperty({ description: 'Allow during review?', required: false })
    allowDuringReview?: boolean;

    @ApiProperty({ description: 'Staged rollout percentage', required: false })
    stagedPercentage?: number;

    @ApiProperty({ description: 'Allowed channels', required: false })
    channels?: string[];

    @ApiProperty({ description: 'Metadata', required: false })
    metadata?: Record<string, string>;
}

export class VPNConfigDto {
    @ApiProperty({ description: 'Config version' })
    version: string;

    @ApiProperty({ description: 'Last updated timestamp', required: false, nullable: true })
    updatedAt: string | null;

    @ApiProperty({ type: [VPNServerDto], description: 'List of available servers' })
    servers: VPNServerDto[];

    @ApiProperty({ type: [VPNCredentialDto], description: 'List of credentials (only present if authenticated/authorized)' })
    credentials: VPNCredentialDto[];

    @ApiProperty({ description: 'Feature flags', required: false, nullable: true })
    featureFlags?: Record<string, boolean> | null;

    @ApiProperty({ type: VPNRolloutDto, description: 'Rollout configuration', required: false, nullable: true })
    rollout?: VPNRolloutDto | null;

    @ApiProperty({ description: 'Metadata', required: false })
    metadata?: Record<string, string>;
}

export class VPNConfigResponseDto {
    @ApiProperty({ example: 'ok', description: 'Status of the request' })
    status: 'ok' | 'not-modified';

    @ApiProperty({ type: VPNConfigDto, description: 'VPN Configuration object', required: false })
    config?: VPNConfigDto;

    @ApiProperty({ description: 'ETag for caching' })
    etag: string;
}

export class VPNCredentialsResponseDto {
    @ApiProperty({ description: 'Server address' })
    serverAddress: string;

    @ApiProperty({ description: 'Remote identifier', required: false })
    remoteIdentifier?: string;

    @ApiProperty({ description: 'Username' })
    username: string;

    @ApiProperty({ description: 'Password' })
    password: string;

    @ApiProperty({ description: 'Shared secret', required: false })
    sharedSecret?: string;

    @ApiProperty({ description: 'Certificate', required: false })
    certificate?: string;

    @ApiProperty({ description: 'Certificate password', required: false })
    certificatePassword?: string;
}
