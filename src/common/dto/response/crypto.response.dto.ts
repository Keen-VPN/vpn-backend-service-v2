import { ApiProperty } from '@nestjs/swagger';

export class BlindedTokenSignatureResponseDto {
    @ApiProperty({
        example: 'base64_encoded_signature_string',
        description: 'The RSA-FDH signature of the blinded token'
    })
    signature: string;
}

export class PublicKeyResponseDto {
    @ApiProperty({
        example: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
        description: 'The PEM encoded public key for verifying blind signatures'
    })
    publicKey: string;
}
