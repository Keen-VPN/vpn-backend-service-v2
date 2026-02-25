import { Injectable, BadRequestException, Inject } from '@nestjs/common';
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

  async getActiveNodesSimplified(): Promise<VPNServer[]> {
    const nodes = await this.prisma.node.findMany({
      where: { status: NodeStatus.ONLINE },
      select: {
        id: true,
        publicKey: true,
        ip: true,
        healthScore: true,
      },
      orderBy: {
        healthScore: 'desc',
      },
    });

    return nodes.map((n) => ({
      id: n.id,
      publicKey: n.publicKey,
      ip: n.ip || '',
      healthScore: n.healthScore ?? 100,
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
      const nodeDaemonUrl = `http://${node.ip}:8080/peers`;
      const response = await axios.post(
        nodeDaemonUrl,
        {
          publicKey: clientPublicKey,
          allowedIps: assignedIp,
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
      throw new BadRequestException(
        'Failed to establish connection with VPN node',
      );
    }
  }
}
