import { Injectable } from '@nestjs/common';
import { Node } from '../node-management/interfaces/node.interface';

@Injectable()
export class AllocationService {
  selectOptimalNode(): Promise<Node | null> {
    // TODO: Phase 2
    // 1. Query Redis Sorted Set for the region (or all regions if not specified)
    // 2. Use ZRANGE to get the node with the lowest score (best available) in O(1)
    // 3. Score calculation based on:
    //    - CPU usage (lower is better)
    //    - Bandwidth usage (lower is better)
    //    - Connection count (lower is better)
    // 4. Return the selected node details from NodeDB
    // 5. If no nodes available, return null

    throw new Error('Not implemented');
  }

  calculateNodeScore(): number {
    // TODO: Phase 2
    // Calculate composite score for node ranking
    // Example formula: score = (cpuUsage * 0.4) + (bandwidthUsage * 0.3) + (connectionCount * 0.3)
    // Lower score = better node

    throw new Error('Not implemented');
  }
}
