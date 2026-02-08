import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { generateWeakEtag } from '../utils/etag';
import { CryptoService } from '../crypto/crypto.service';
import * as fs from 'fs';
import * as path from 'path';

interface VPNServer {
  id: string;
  name: string;
  country: string;
  city: string;
  serverAddress: string;
  remoteIdentifier?: string;
  credentialId: string;
  assetKey?: string;
  flagUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  isDefault?: boolean;
  sortOrder?: number;
  metadata?: Record<string, string>;
}

interface VPNCredential {
  id: string;
  username: string;
  password: string;
  sharedSecret?: string;
  certificate?: string;
  certificatePassword?: string;
  metadata?: Record<string, string>;
}

interface VPNConfig {
  version: string;
  updatedAt: string | null;
  servers: VPNServer[];
  credentials: VPNCredential[];
  featureFlags?: Record<string, boolean> | null;
  rollout?: {
    minAppVersion?: string;
    maxAppVersion?: string;
    allowDuringReview?: boolean;
    stagedPercentage?: number;
    channels?: string[];
    metadata?: Record<string, string>;
  } | null;
  metadata?: Record<string, string>;
}

@Injectable()
export class VPNConfigService implements OnModuleInit {
  private cachedConfig: VPNConfig | null = null;
  private cachedEtag: string | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private cryptoService: CryptoService,
  ) { }

  async onModuleInit() {
    // Load config from database on startup
    await this.loadConfigFromDatabase();
  }

  async getVPNConfig(
    etag?: string,
    clientToken?: string,
  ): Promise<{
    status: 'ok' | 'not-modified';
    config?: VPNConfig;
    etag: string;
  }> {
    // Validate client token if provided
    const expectedToken = this.configService.get<string>('CONFIG_CLIENT_TOKEN');
    if (clientToken && expectedToken && clientToken !== expectedToken) {
      SafeLogger.warn('Invalid config client token', {
        provided: clientToken.substring(0, 8) + '...',
      });
      // Continue anyway, but log it
    }

    // Reload config from database to ensure we have the latest
    await this.loadConfigFromDatabase();

    // Check if client has current version
    if (etag && etag === this.cachedEtag) {
      return {
        status: 'not-modified',
        etag: this.cachedEtag,
      };
    }

    // Ensure config is valid before returning
    if (!this.cachedConfig) {
      SafeLogger.error('VPN config is null, using fallback');
      this.cachedConfig = this.getDefaultConfig();
      this.cachedEtag = generateWeakEtag(this.cachedConfig);
    }

    // Validate servers and credentials arrays are not empty
    if (!this.cachedConfig.servers || this.cachedConfig.servers.length === 0) {
      SafeLogger.error('VPN config has no servers, using fallback');
      this.cachedConfig = this.getDefaultConfig();
      this.cachedEtag = generateWeakEtag(this.cachedConfig);
    }

    if (
      !this.cachedConfig.credentials ||
      this.cachedConfig.credentials.length === 0
    ) {
      SafeLogger.error('VPN config has no credentials, using fallback');
      this.cachedConfig = this.getDefaultConfig();
      this.cachedEtag = generateWeakEtag(this.cachedConfig);
    }

    // Return config (caller may strip credentials for unauthenticated/unsubscribed users)
    return {
      status: 'ok',
      config: this.cachedConfig,
      etag: this.cachedEtag!,
    };
  }

  /** Returns a copy of the config with credentials stripped (for public/unsubscribed responses) */
  stripCredentials(config: VPNConfig): Omit<VPNConfig, 'credentials'> & {
    credentials: never[];
  } {
    return {
      ...config,
      credentials: [],
    };
  }

  private async loadConfigFromDatabase(): Promise<void> {
    try {
      // Get active VPN config from database
      const dbConfig = await this.prisma.vpnConfig.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      if (dbConfig && dbConfig.payload) {
        // Use config from database
        // Prisma returns JSON as Prisma.JsonValue, need to properly cast it
        const payload = dbConfig.payload as unknown as VPNConfig;

        // Validate and ensure servers array exists and is not empty
        if (
          !payload.servers ||
          !Array.isArray(payload.servers) ||
          payload.servers.length === 0
        ) {
          SafeLogger.warn(
            'VPN config from database has invalid or empty servers array, using default',
            {
              version: dbConfig.version,
              serversType: typeof payload.servers,
              serversLength: Array.isArray(payload.servers)
                ? payload.servers.length
                : 'not an array',
            },
          );
          this.cachedConfig = this.getDefaultConfig();
          this.cachedEtag = generateWeakEtag(this.cachedConfig);
          return;
        }

        // Validate and ensure credentials array exists and is not empty
        if (
          !payload.credentials ||
          !Array.isArray(payload.credentials) ||
          payload.credentials.length === 0
        ) {
          SafeLogger.warn(
            'VPN config from database has invalid or empty credentials array, using default',
            {
              version: dbConfig.version,
              credentialsType: typeof payload.credentials,
              credentialsLength: Array.isArray(payload.credentials)
                ? payload.credentials.length
                : 'not an array',
            },
          );
          this.cachedConfig = this.getDefaultConfig();
          this.cachedEtag = generateWeakEtag(this.cachedConfig);
          return;
        }

        // Ensure updatedAt is either a string or null (not undefined)
        const normalizedConfig: VPNConfig = {
          ...payload,
          updatedAt: payload.updatedAt ?? null,
          featureFlags: payload.featureFlags ?? null,
          rollout: payload.rollout ?? null,
        };

        this.cachedConfig = normalizedConfig;
        this.cachedEtag = dbConfig.etag || generateWeakEtag(normalizedConfig);
        SafeLogger.info('Loaded VPN config from database', {
          version: dbConfig.version,
          etag: (this.cachedEtag || '').substring(0, 16) + '...',
          serversCount: normalizedConfig.servers.length,
          credentialsCount: normalizedConfig.credentials.length,
        });
      } else {
        // Fallback to default config file
        this.cachedConfig = this.getDefaultConfig();
        this.cachedEtag = generateWeakEtag(this.cachedConfig);
        SafeLogger.warn(
          'No active VPN config in database, using default config file',
        );
      }
    } catch (error) {
      SafeLogger.error('Failed to load VPN config from database', error);
      // Fallback to default config
      this.cachedConfig = this.getDefaultConfig();
      this.cachedEtag = generateWeakEtag(this.cachedConfig);
    }
  }

  private getDefaultConfig(): VPNConfig {
    try {
      // Try to load from default config file
      const configPath = path.join(__dirname, 'default-vpn-config.json');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent) as VPNConfig;
        SafeLogger.info('Loaded default VPN config from file');
        return config;
      }
    } catch (error) {
      SafeLogger.error('Failed to load default VPN config file', error);
    }

    // Ultimate fallback - return empty config
    return {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      servers: [],
      credentials: [],
      featureFlags: {},
      rollout: {
        allowDuringReview: false,
        channels: ['production'],
      },
      metadata: {},
    };
  }

  /**
   * Generate VPN credentials using a blind-signed token
   * This implements the "Church & State" model where:
   * - No user ID is sent to VPN nodes
   * - Credentials are derived from blind-signed tokens
   * - Backend cannot correlate payment with VPN usage
   *
   * @param token The original token (before blinding)
   * @param signature The blind-signed signature (after unblinding)
   * @param serverId The VPN server ID to connect to
   * @returns VPN credentials with token-derived password
   */
  async generateTokenBasedCredentials(
    token: string,
    signature: string,
    serverId: string,
  ): Promise<{
    serverAddress: string;
    remoteIdentifier?: string;
    username: string;
    password: string;
    sharedSecret?: string;
    certificate?: string;
    certificatePassword?: string;
  }> {
    // Verify the blind-signed token
    const isValid = this.cryptoService.verifyBlindSignedToken(token, signature);

    if (!isValid) {
      throw new BadRequestException('Invalid blind-signed token');
    }

    // Reload config to ensure we have the latest
    await this.loadConfigFromDatabase();

    if (!this.cachedConfig) {
      throw new BadRequestException('VPN config not available');
    }

    // Find the server
    const server = this.cachedConfig.servers.find((s) => s.id === serverId);
    if (!server) {
      throw new BadRequestException(`VPN server not found: ${serverId}`);
    }

    // Find the credential template (we'll use the credentialId from server)
    const credentialTemplate = this.cachedConfig.credentials.find(
      (c) => c.id === server.credentialId,
    );

    if (!credentialTemplate) {
      throw new BadRequestException(
        `Credential template not found: ${server.credentialId}`,
      );
    }

    // NOTE: For now, we return the actual credentials from the config
    // because the VPN server needs to be configured to accept token-based credentials.
    // Once the VPN server is configured to validate token-based credentials,
    // we can switch to generating token-based credentials here.
    //
    // The "Church & State" privacy benefit is still achieved through:
    // 1. Anonymous session recording (no user ID sent to VPN node)
    // 2. Token-based credential generation (ready for when server supports it)
    //
    // TODO: Configure VPN server to accept token-based credentials, then uncomment:
    // const passwordSeed = `${token}:${signature}`;
    // const passwordHash = crypto
    //   .createHash('sha256')
    //   .update(passwordSeed)
    //   .digest('base64');
    // const username = `token_${token.substring(0, 16).replace(/[^a-zA-Z0-9]/g, '')}`;

    SafeLogger.info('Generated VPN credentials (using config credentials)', {
      serverId,
      credentialId: credentialTemplate.id,
      // Never log the actual credentials
    });

    return {
      serverAddress: server.serverAddress,
      remoteIdentifier: server.remoteIdentifier,
      username: credentialTemplate.username,
      password: credentialTemplate.password,
      sharedSecret: credentialTemplate.sharedSecret,
      certificate: credentialTemplate.certificate,
      certificatePassword: credentialTemplate.certificatePassword,
    };
  }
}
