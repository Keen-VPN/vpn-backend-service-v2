import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseConfig implements OnModuleInit {
  private app: admin.app.App;

  constructor(@Inject(ConfigService) private configService: ConfigService) {}

  onModuleInit() {
    const serviceAccount = {
      type: 'service_account',
      project_id:
        this.configService?.get<string>('FIREBASE_PROJECT_ID') ||
        process.env.FIREBASE_PROJECT_ID,
      private_key_id:
        this.configService?.get<string>('FIREBASE_PRIVATE_KEY_ID') ||
        process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: (
        this.configService?.get<string>('FIREBASE_PRIVATE_KEY') ||
        process.env.FIREBASE_PRIVATE_KEY
      )?.replace(/\\n/g, '\n'),
      client_email:
        this.configService?.get<string>('FIREBASE_CLIENT_EMAIL') ||
        process.env.FIREBASE_CLIENT_EMAIL,
      client_id:
        this.configService?.get<string>('FIREBASE_CLIENT_ID') ||
        process.env.FIREBASE_CLIENT_ID,
      auth_uri:
        this.configService?.get<string>('FIREBASE_AUTH_URI') ||
        process.env.FIREBASE_AUTH_URI ||
        'https://accounts.google.com/o/oauth2/auth',
      token_uri:
        this.configService?.get<string>('FIREBASE_TOKEN_URI') ||
        process.env.FIREBASE_TOKEN_URI ||
        'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url:
        this.configService?.get<string>(
          'FIREBASE_AUTH_PROVIDER_X509_CERT_URL',
        ) || process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url:
        this.configService?.get<string>('FIREBASE_CLIENT_X509_CERT_URL') ||
        process.env.FIREBASE_CLIENT_X509_CERT_URL,
    };

    if (!admin.apps.length) {
      this.app = admin.initializeApp({
        credential: admin.credential.cert(
          serviceAccount as admin.ServiceAccount,
        ),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
      });
    } else {
      this.app = admin.app();
    }
  }

  getAuth(): admin.auth.Auth {
    return admin.auth();
  }
}
