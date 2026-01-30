import { PrismaClient, Prisma } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { generateWeakEtag } from "../src/utils/etag";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Read the default VPN config JSON file
  const configPath = path.join(__dirname, "../src/config/default-vpn-config.json");
  const configContent = fs.readFileSync(configPath, "utf-8");
  const defaultConfig = JSON.parse(configContent);

  const payload = defaultConfig as Prisma.JsonObject;
  const payloadJson = payload as unknown as Prisma.InputJsonValue;
  const version = (payload.version as string) ?? "fallback-1.0.0";
  const etag = generateWeakEtag(payload);

  // Deactivate all other versions
  await prisma.vpnConfig.updateMany({
    where: {
      version: { not: version },
      isActive: true,
    },
    data: { isActive: false },
  });

  // Upsert the VPN config
  await prisma.vpnConfig.upsert({
    where: { version },
    create: {
      version,
      payload: payloadJson,
      etag,
      isActive: true,
    },
    update: {
      payload: payloadJson,
      etag,
      isActive: true,
    },
  });

  console.log(`✅ Seeded VPN config version "${version}" (active).`);
}

main()
  .catch((error) => {
    console.error("❌ Failed to seed VPN config:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

