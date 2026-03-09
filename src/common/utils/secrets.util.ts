import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { SafeLogger } from './logger.util';

export class SecretsUtil {
  private static client = new SecretsManagerClient({
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
    region: process.env.APP_AWS_REGION || 'us-east-1',
  });

  static async fetchNodeToken(environment: string): Promise<string | null> {
    return this.fetchSecret(`/keenvpn/${environment}/node-token`);
  }

  static async fetchFirebasePrivateKey(
    environment: string,
  ): Promise<string | null> {
    return this.fetchSecret(`/keenvpn/${environment}/firebase-private-key`);
  }

  static async fetchBlindSigningPrivateKey(
    environment: string,
  ): Promise<string | null> {
    return this.fetchSecret(
      `/keenvpn/${environment}/blind-signing-private-key`,
    );
  }

  private static async fetchSecret(secretId: string): Promise<string | null> {
    try {
      const response = await this.client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );

      return response.SecretString || null;
    } catch (error) {
      SafeLogger.error(
        `Failed to fetch secret from Secrets Manager (${secretId})`,
        error,
      );
      return null;
    }
  }
}
