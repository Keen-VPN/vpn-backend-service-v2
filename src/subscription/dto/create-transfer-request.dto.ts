import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateTransferRequestDto {
  @ApiProperty({ example: 'ExampleVPN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  provider!: string;

  @ApiProperty({ description: 'ISO 8601 expiry of competitor subscription' })
  @IsISO8601()
  expiryDate!: string;

  @ApiPropertyOptional({
    description:
      'HTTPS URL to screenshot proof (alternative to S3 presigned upload).',
  })
  @IsOptional()
  @ValidateIf(
    (o: CreateTransferRequestDto) =>
      o.proofUrl != null && String(o.proofUrl).trim() !== '',
  )
  @IsString()
  @MaxLength(4096)
  @Matches(/^https:\/\/.+/i, {
    message: 'proofUrl must be an https URL',
  })
  proofUrl?: string;

  @ApiPropertyOptional({
    description:
      'S3 object key after successful PUT to the URL from POST /subscription/transfer-request/presigned-upload',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  proofS3Key?: string;

  @ApiPropertyOptional({
    description:
      'Original filename of the proof image (stored for admin review).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  proofOriginalFilename?: string;

  @ApiPropertyOptional({
    description:
      'Optional client device fingerprint for cross-account abuse detection.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientDeviceFingerprint?: string;

  @ApiPropertyOptional({
    description:
      'Optional contact email used when the sign-in email is an Apple private relay address.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string;
}
