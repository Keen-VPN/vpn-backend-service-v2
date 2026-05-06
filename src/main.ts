import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { SafeLogger } from './common/utils/logger.util';
import { SecretsUtil } from './common/utils/secrets.util';
import { ADMIN_SESSION_COOKIE } from './admin/admin.constants';
import {
  assertNoWildcardOrigins,
  parseCorsOrigins,
} from './common/http/cors.util';

async function bootstrap() {
  // Fetch large secrets from Secrets Manager if not provided in environment (for Staging/Prod)
  const env = process.env.NODE_ENV || 'development';
  if (['staging', 'production'].includes(env)) {
    const secretsToFetch = [
      { key: 'NODE_TOKEN', fetch: () => SecretsUtil.fetchNodeToken(env) },
      {
        key: 'FIREBASE_PRIVATE_KEY',
        fetch: () => SecretsUtil.fetchFirebasePrivateKey(env),
      },
      {
        key: 'BLIND_SIGNING_PRIVATE_KEY',
        fetch: () => SecretsUtil.fetchBlindSigningPrivateKey(env),
      },
    ];

    for (const secret of secretsToFetch) {
      if (!process.env[secret.key]) {
        SafeLogger.info(`Fetching ${secret.key} from Secrets Manager`, {
          environment: env,
        });
        const value = await secret.fetch();
        if (value) {
          process.env[secret.key] = value;
          SafeLogger.info(`Successfully loaded ${secret.key}`);
        } else {
          SafeLogger.warn(
            `${secret.key} not found in Secrets Manager. App functionality may be limited.`,
          );
        }
      }
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  if (['staging', 'production'].includes(env)) {
    app.set('trust proxy', 1);
  }

  app.use(cookieParser());

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
          scriptSrc: ["'self'", "https: 'unsafe-inline'"],
        },
      },
    }),
  );

  const fromEnv = parseCorsOrigins(configService.get<string>('CORS_ORIGINS'));
  assertNoWildcardOrigins(fromEnv);
  const localhostOrigins =
    env === 'development'
      ? [
          'http://localhost:3000',
          'http://localhost:5173',
          'http://localhost:8080',
          'http://localhost:8081',
        ]
      : [];
  const allowedOrigins = [
    ...new Set([
      ...(fromEnv.length ? fromEnv : []),
      ...localhostOrigins,
      'https://staging.vpnkeen.com',
      'https://vpnkeen.com',
      'https://www.vpnkeen.com',
      'https://vpnkeen.netlify.app',
      'https://keenvpnstaging.netlify.app',
    ]),
  ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Cookie',
    ],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Set global API prefix
  app.setGlobalPrefix('api');

  // Swagger/OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('Keen VPN API')
    .setDescription('Core Backend API for Keen VPN services')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'bearer', // Ensure legacy compatibility with @ApiBearerAuth()
    )
    .addCookieAuth(ADMIN_SESSION_COOKIE, {
      type: 'apiKey',
      in: 'cookie',
      name: ADMIN_SESSION_COOKIE,
      description:
        'Admin dashboard session (HttpOnly cookie set by POST /api/admin/auth/login)',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  SafeLogger.info(
    'Server started successfully',
    { service: 'Bootstrap' },
    { port },
  );
}
void bootstrap();
