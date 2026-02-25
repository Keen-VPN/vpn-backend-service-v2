import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateSalesContactDto {
  @ApiProperty({ type: 'string', description: 'The name of the company' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({
    type: 'string',
    description: 'The work email of the contact person',
  })
  @IsEmail()
  @IsNotEmpty()
  workEmail: string;

  @ApiProperty({ type: 'number', description: 'The size of the team' })
  @IsInt()
  @Min(1)
  @Max(1000000)
  teamSize: number;

  @ApiPropertyOptional({
    type: 'string',
    description: 'The country or region of the company',
  })
  @IsString()
  @IsOptional()
  countryRegion?: string;

  @ApiProperty({
    type: 'boolean',
    description: 'Whether the user provides consent for communication',
  })
  @IsBoolean()
  @IsNotEmpty()
  hasConsent: boolean;

  @ApiPropertyOptional({
    type: 'string',
    description: 'The phone number of the contact person',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'The primary use case for Keen VPN',
  })
  @IsString()
  @IsOptional()
  useCase?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'The preferred contact method (email, phone, etc.)',
  })
  @IsString()
  @IsOptional()
  preferredContactMethod?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'The preferred time for contact',
  })
  @IsString()
  @IsOptional()
  preferredContactTime?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Additional message or inquiry details',
  })
  @IsString()
  @IsOptional()
  message?: string;
}
