export interface VPNConfig {
  endpoint: string;
  publicKey: string;
  allowedIPs: string[];
  privateKey: string;
}

export interface TokenPayload {
  token: string;
  signature: string;
  region?: string;
}
