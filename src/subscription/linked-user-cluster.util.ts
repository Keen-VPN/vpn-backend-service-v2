import type { PrismaService } from '../prisma/prisma.service';

/**
 * Returns all user IDs in the same linked-account component as startUserId
 * (undirected graph over linked_accounts rows).
 */
export async function getLinkedUserClusterIds(
  prisma: PrismaService,
  startUserId: string,
): Promise<string[]> {
  const visited = new Set<string>([startUserId]);
  const queue: string[] = [startUserId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const links = await prisma.linkedAccount.findMany({
      where: { OR: [{ primaryUserId: id }, { linkedUserId: id }] },
    });
    for (const link of links) {
      const other =
        link.primaryUserId === id ? link.linkedUserId : link.primaryUserId;
      if (!visited.has(other)) {
        visited.add(other);
        queue.push(other);
      }
    }
  }

  return [...visited];
}
