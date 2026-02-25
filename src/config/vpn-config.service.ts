import {
  Injectable,
  OnModuleInit,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NodeStatus } from '@prisma/client';
import { SafeLogger } from '../common/utils/logger.util';
import { CryptoService } from '../crypto/crypto.service';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface VPNServer {
  id: string;
  publicKey: string;
  ip: string;
}

// Redundant, removed VPNCredential interface

export interface VPNConfig {
  version: string;
  updatedAt: string | null;
  servers: VPNServer[];
  featureFlags?: Record<string, boolean> | null;
  rollout?: {
    minAppVersion?: string;
    maxAppVersion?: string;
    allowDuringReview?: boolean;
    stagedPercentage?: number;
    channels?: string[];
    metadata?: Record<string, string>;
  } | null;
}

@Injectable()
export class VPNConfigService implements OnModuleInit {
  private cachedConfig: VPNConfig | null = null;
  private currentEtag: string | null = null;

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
  ) {}

  async onModuleInit() {
    // No initial load needed if we fetch live
  }

  async getVPNConfig(
    etag?: string,
    clientToken?: string,
  ): Promise<{
    status: 'ok' | 'not-modified';
    config: VPNConfig;
    etag: string;
  }> {
    if (
      clientToken &&
      clientToken !== this.configService.get('CONFIG_CLIENT_TOKEN')
    ) {
      SafeLogger.warn('Invalid config client token', { clientToken });
    }

    if (!this.cachedConfig) {
      await this.loadConfigFromDatabase();
    }

    if (etag && etag === this.currentEtag) {
      return {
        status: 'not-modified',
        config: this.cachedConfig!,
        etag: this.currentEtag,
      };
    }

    return {
      status: 'ok',
      config: this.cachedConfig!,
      etag: this.currentEtag!,
    };
  }

  async getActiveNodesSimplified() {
    if (!this.cachedConfig) {
      await this.loadConfigFromDatabase();
    }
    return this.cachedConfig?.servers || [];
  }

  async processVpnConnection(
    token: string,
    signature: string,
    serverId: string,
    clientPublicKey: string,
  ): Promise<{ publicKey: string; ip: string }> {
    // 1. Validate blind-signed token
    const isValid = this.cryptoService.verifyBlindSignedToken(token, signature);
    if (!isValid) {
      throw new BadRequestException('Invalid blind-signed token');
    }

    // 2. Find the node
    const node = await this.prisma.node.findUnique({
      where: { id: serverId },
    });

    if (!node || !node.ip) {
      throw new BadRequestException('VPN node not found or has no IP');
    }

    // 3. Check if client is already registered
    const existingClient = await this.prisma.nodeClient.findFirst({
      where: {
        nodeId: serverId,
        clientPublicKey: clientPublicKey,
      },
    });

    if (existingClient) {
      return { publicKey: node.publicKey, ip: node.ip };
    }

    // 4. Register client on node daemon
    try {
      const nodeDaemonUrl = `http://${node.ip}:8080/peers`; // Port 8080 as confirmed
      const response = await axios.post(
        nodeDaemonUrl,
        {
          publicKey: clientPublicKey,
          allowedIps: '10.0.0.2/32', // TODO: Dynamically assign internal IP
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.NODE_TOKEN}`,
          },
          timeout: 5000,
        },
      );

      if (response.status !== 201 && response.status !== 200) {
        throw new Error(`Node daemon returned status ${response.status}`);
      }

      // 5. Store node-client relationship
      await this.prisma.nodeClient.create({
        data: {
          nodeId: serverId,
          clientPublicKey: clientPublicKey,
          allowedIps: '10.0.0.2/32',
        },
      });

      return { publicKey: node.publicKey, ip: node.ip };
    } catch (error) {
      SafeLogger.error('Failed to register peer on node daemon', {
        serverId,
        nodeIp: node.ip,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new BadRequestException(
        'Failed to establish connection with VPN node',
      );
    }
  }

  async generateTokenBasedCredentials(
    token: string,
    signature: string,
    serverId: string,
  ): Promise<any> {
    const isValid = this.cryptoService.verifyBlindSignedToken(token, signature);
    if (!isValid) {
      throw new BadRequestException('Invalid blind-signed token');
    }

    if (!this.cachedConfig) {
      await this.loadConfigFromDatabase();
    }

    const server = this.cachedConfig?.servers.find((s) => s.id === serverId);
    if (!server) {
      throw new BadRequestException(`VPN server not found: ${serverId}`);
    }

    // Mocking legacy credential lookup for compatibility
    return {
      serverAddress: server.ip,
      remoteIdentifier: 'keenvpn-node',
      username: 'vpnuser',
      password: 'vpnpassword',
      sharedSecret: 'vpnsecret',
    };
  }

  stripCredentials(config: VPNConfig): VPNConfig {
    return {
      ...config,
      servers: config.servers.map((s) => ({ ...s })),
      // @ts-expect-error - credentials removed from interface but might be in object
      credentials: [],
    };
  }

  private async loadConfigFromDatabase(): Promise<VPNConfig> {
    try {
      const nodes = await this.prisma.node.findMany({
        where: { status: NodeStatus.ONLINE },
        select: {
          id: true,
          publicKey: true,
          ip: true,
        },
      });

      const config: VPNConfig = {
        version: 'live-1.0',
        updatedAt: new Date().toISOString(),
        servers: nodes.map((n) => ({
          id: n.id,
          publicKey: n.publicKey,
          ip: n.ip || '',
        })),
        featureFlags: null,
        rollout: null,
      };

      this.cachedConfig = config;
      this.currentEtag = crypto
        .createHash('md5')
        .update(JSON.stringify(config))
        .digest('hex');

      return config;
    } catch (error) {
      SafeLogger.error('Failed to load VPN config from database', error);
      this.cachedConfig = this.getDefaultConfig();
      this.currentEtag = 'manual-fallback';
      return this.cachedConfig;
    }
  }

  private getDefaultConfig(): VPNConfig {
    try {
      const configPath = path.join(
        process.cwd(),
        'config',
        'default-vpn-config.json',
      );
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8')) as VPNConfig;
      }
    } catch (error) {
      SafeLogger.error('Failed to load default VPN config file', error);
    }
    return {
      version: 'fallback-1.0',
      updatedAt: new Date().toISOString(),
      servers: [],
    };
  }
}
