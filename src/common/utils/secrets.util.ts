import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { SafeLogger } from './logger.util';

export class SecretsUtil {
  private static client = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  static async fetchNodeToken(environment: string): Promise<string | null> {
    const secretId = `/keenvpn/${environment}/node-token`;

    try {
      const response = await this.client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );

      return response.SecretString || null;
    } catch (error) {
      SafeLogger.error(
        `Failed to fetch NODE_TOKEN from Secrets Manager (${secretId})`,
        error,
      );
      return null;
    }
  }
}
