import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MEMBERSHIP_TRANSFER_MAX_PROOF_BYTES = 5 * 1024 * 1024;
// Store all membership proof uploads under the bucket's /uploads folder.
const KEY_PREFIX = 'uploads/membership-transfer-proofs';
/** Presigned PUT TTL (seconds). Keep short to reduce abuse window. */
const PRESIGNED_PUT_EXPIRES_SECONDS = 90;

@Injectable()
export class MembershipTransferS3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    const region =
      this.configService.get<string>('AWS_REGION') ||
      process.env.AWS_REGION ||
      'us-east-1';
    this.bucket =
      this.configService.get<string>('MEMBERSHIP_TRANSFER_S3_BUCKET') ||
      process.env.MEMBERSHIP_TRANSFER_S3_BUCKET ||
      '';
    this.client = new S3Client({
      region,
      // Keep presigned browser uploads simple: only require checksum when S3 mandates it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  enabled(): boolean {
    return this.bucket.length > 0;
  }

  getBucket(): string {
    return this.bucket;
  }

  keyPrefixForUser(userId: string): string {
    return `${KEY_PREFIX}/${userId}/`;
  }

  private extensionForContentType(contentType: string): string {
    const ct = contentType.toLowerCase().split(';')[0].trim();
    if (ct === 'image/png') return 'png';
    if (ct === 'image/webp') return 'webp';
    return 'jpg';
  }

  buildObjectKey(userId: string, contentType: string): string {
    const ext = this.extensionForContentType(contentType);
    return `${this.keyPrefixForUser(userId)}${randomUUID()}.${ext}`;
  }

  proofStorageUrl(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }

  parseStorageUrl(proofUrl: string): { bucket: string; key: string } | null {
    const m = proofUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], key: m[2] };
  }

  /**
   * Presigned PUT for the client to upload proof bytes directly to S3.
   */
  async createPresignedPutForProof(
    userId: string,
    contentType: string,
  ): Promise<{
    uploadUrl: string;
    key: string;
    expiresInSeconds: number;
    headers: Record<string, string>;
  }> {
    if (!this.enabled()) {
      throw new ServiceUnavailableException(
        'Membership transfer proof upload is not configured (missing MEMBERSHIP_TRANSFER_S3_BUCKET)',
      );
    }
    const ct = (contentType || '').toLowerCase().split(';')[0].trim();
    if (!ALLOWED_MIMES.has(ct)) {
      throw new BadRequestException(
        'contentType must be image/jpeg, image/png, or image/webp',
      );
    }
    const key = this.buildObjectKey(userId, ct);
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: ct,
    });
    const expiresInSeconds = PRESIGNED_PUT_EXPIRES_SECONDS;
    const uploadUrl = await getSignedUrl(this.client, cmd, {
      expiresIn: expiresInSeconds,
    });
    return {
      uploadUrl,
      key,
      expiresInSeconds,
      headers: { 'Content-Type': ct },
    };
  }

  /**
   * Head + full GET to validate size/MIME, confirm bytes exist, and compute SHA-256.
   */
  async verifyUploadedProofObject(
    userId: string,
    key: string,
  ): Promise<{
    contentType: string;
    sizeBytes: number;
    sha256Hex: string;
    uploadedAt: Date | null;
  }> {
    if (!this.enabled()) {
      throw new ServiceUnavailableException('S3 is not configured');
    }
    const prefix = this.keyPrefixForUser(userId);
    if (!key.startsWith(prefix)) {
      throw new BadRequestException('Invalid proof object key');
    }
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const size = head.ContentLength ?? 0;
    if (size <= 0 || size > MEMBERSHIP_TRANSFER_MAX_PROOF_BYTES) {
      throw new BadRequestException(
        `Proof object must exist on S3 and be at most ${MEMBERSHIP_TRANSFER_MAX_PROOF_BYTES / (1024 * 1024)}MB`,
      );
    }
    const headCt = (head.ContentType || '').toLowerCase().split(';')[0].trim();
    if (!ALLOWED_MIMES.has(headCt)) {
      throw new BadRequestException('Proof must be a JPEG, PNG, or WebP image');
    }

    const get = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = get.Body;
    if (!body) {
      throw new BadRequestException('Proof object has no body');
    }
    const hash = createHash('sha256');
    let total = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      hash.update(buf);
      if (total > MEMBERSHIP_TRANSFER_MAX_PROOF_BYTES) {
        throw new BadRequestException(
          'Proof object exceeds maximum allowed size',
        );
      }
    }
    if (total !== size) {
      throw new BadRequestException(
        'Proof object size mismatch; re-upload required',
      );
    }
    const getCt = (get.ContentType || head.ContentType || '')
      .toLowerCase()
      .split(';')[0]
      .trim();
    if (!ALLOWED_MIMES.has(getCt)) {
      throw new BadRequestException('Proof must be a JPEG, PNG, or WebP image');
    }

    return {
      contentType: getCt,
      sizeBytes: size,
      sha256Hex: hash.digest('hex'),
      uploadedAt: head.LastModified ?? null,
    };
  }

  /**
   * Short-lived presigned GET for admin review UI.
   */
  async createPresignedGetForProofKey(key: string): Promise<string> {
    if (!this.enabled()) {
      throw new ServiceUnavailableException('S3 is not configured');
    }
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: 300 });
  }
}
