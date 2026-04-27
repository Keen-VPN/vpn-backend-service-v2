import {
  Injectable,
  BadRequestException,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NodeStatus } from '@prisma/client';
import { SafeLogger } from '../common/utils/logger.util';
import { CryptoService } from '../crypto/crypto.service';
import axios from 'axios';

export interface VPNServer {
  id: string;
  publicKey: string;
  ip: string;
  healthScore: number;
}

@Injectable()
export class VPNConfigService {
  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
  ) {}

  private getNumberConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key) ?? process.env[key];
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async registerPeerOnNodeDaemon(params: {
    nodeIp: string;
    clientPublicKey: string;
    assignedIp: string;
  }): Promise<void> {
    const nodeDaemonUrl = `http://${params.nodeIp}:8080/peers`;
    const timeoutMs = this.getNumberConfig('NODE_DAEMON_TIMEOUT_MS', 8000);
    const maxAttempts = this.getNumberConfig(
      'NODE_DAEMON_REGISTER_ATTEMPTS',
      2,
    );
    const token =
      this.configService.get<string>('NODE_TOKEN') ?? process.env.NODE_TOKEN;

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await axios.post(
          nodeDaemonUrl,
          {
            publicKey: params.clientPublicKey,
            allowedIps: params.assignedIp,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: timeoutMs,
          },
        );

        if (response.status !== 201 && response.status !== 200) {
          throw new Error(`Node daemon returned status ${response.status}`);
        }

        return;
      } catch (error) {
        lastError = error;
        SafeLogger.warn('Node daemon peer registration attempt failed', {
          nodeIp: params.nodeIp,
          attempt,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private isNodeConnectivityError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const axiosLike = error as {
      code?: string;
      message?: string;
      response?: { status?: number };
    };

    if (!axiosLike.response) {
      // Network-level failures (timeout, refused, DNS, etc.) have no HTTP response.
      return true;
    }

    const status = axiosLike.response.status;
    if (typeof status === 'number' && status >= 500) {
      return true;
    }

    const code = axiosLike.code ?? '';
    const msg = (axiosLike.message ?? '').toLowerCase();
    return (
      code === 'ECONNABORTED' ||
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND' ||
      msg.includes('timeout')
    );
  }

  async getActiveNodesSimplified(): Promise<any[]> {
    const nodes = await this.prisma.node.findMany({
      where: { status: NodeStatus.ONLINE },
      select: {
        id: true,
        region: true,
        latitude: true,
        longitude: true,
        country: true,
        city: true,
        flagUrl: true,
      },
      orderBy: {
        healthScore: 'desc',
      },
    });

    return nodes.map((n) => ({
      node_id: n.id,
      region: n.region,
      latitude: n.latitude,
      longitude: n.longitude,
      country: n.country,
      city: n.city,
      flag_url: n.flagUrl,
    }));
  }

  async processVpnConnection(
    token: string,
    signature: string,
    serverId: string,
    clientPublicKey: string,
  ): Promise<{ publicKey: string; ip: string; internalIp: string }> {
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

    // 3. Find existing relationship (1:1 mapping enforced by @unique clientPublicKey)
    const existingClient = await this.prisma.nodeClient.findUnique({
      where: { clientPublicKey: clientPublicKey },
    });

    let assignedIp: string;
    if (existingClient && existingClient.nodeId === serverId) {
      // Same server, reuse IP
      assignedIp = existingClient.allowedIps;
    } else {
      // Different server or new client: allocate new IP for the target server
      // sequential allocator - Subnet: 10.66.0.0/16. Node is .1, clients from .2
      const clientCount = await this.prisma.nodeClient.count({
        where: { nodeId: serverId },
      });
      const nextIpIndex = clientCount + 2;
      assignedIp = `10.66.${Math.floor(nextIpIndex / 256)}.${nextIpIndex % 256}/32`;
    }

    // 4. Register client on target node daemon (Idempotent)

    // 5. Register client on node daemon
    try {
      await this.registerPeerOnNodeDaemon({
        nodeIp: node.ip,
        clientPublicKey,
        assignedIp,
      });

      // 5. Update or Create node-client relationship (1:1 mapping)
      await this.prisma.nodeClient.upsert({
        where: { clientPublicKey: clientPublicKey },
        update: {
          nodeId: serverId,
          allowedIps: assignedIp,
        },
        create: {
          nodeId: serverId,
          clientPublicKey: clientPublicKey,
          allowedIps: assignedIp,
        },
      });

      return { publicKey: node.publicKey, ip: node.ip, internalIp: assignedIp };
    } catch (error) {
      SafeLogger.error('Failed to register peer on node daemon', {
        serverId,
        nodeIp: node.ip,
        error: error instanceof Error ? error.message : String(error),
      });
      if (this.isNodeConnectivityError(error)) {
        throw new ServiceUnavailableException(
          'VPN node is temporarily unavailable',
        );
      }
      throw new BadRequestException(
        'Failed to establish connection with VPN node',
      );
    }
  }
}
