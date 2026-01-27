export interface Node {
  id: string;
  ipAddress: string;
  publicKey: string;
  region: string;
  city?: string;
  country: string;
  status: NodeStatus;
  capacity: number;
  currentConnections: number;
  cpuUsage: number;
  bandwidthUsage: number;
  lastHeartbeat: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum NodeStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
}

export interface NodeMetrics {
  cpuUsage: number;
  bandwidthUsage: number;
  connectionCount: number;
  availableCapacity: number;
}
