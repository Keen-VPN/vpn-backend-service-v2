import { ApiProperty } from '@nestjs/swagger';
import { NodeStatus } from '../interfaces/node.interface';

export class NodeResponseDto {
  @ApiProperty({
    description: 'Unique node identifier',
    example: 'node-123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Public IP address of the node',
    example: '203.0.113.42',
  })
  ipAddress: string;

  @ApiProperty({
    description: 'WireGuard public key',
    example: 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=',
  })
  publicKey: string;

  @ApiProperty({
    description: 'Node region',
    example: 'us-east',
  })
  region: string;

  @ApiProperty({
    description: 'Node status',
    enum: NodeStatus,
    example: NodeStatus.ACTIVE,
  })
  status: NodeStatus;

  @ApiProperty({
    description: 'Timestamp of registration',
    example: '2026-01-07T10:30:00.000Z',
  })
  createdAt: Date;
}
