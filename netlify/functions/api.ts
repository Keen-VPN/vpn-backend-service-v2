/* eslint-disable */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import helmet from 'helmet';
import { SecretsUtil } from '../../src/common/utils/secrets.util';
import { SafeLogger } from '../../src/common/utils/logger.util';
import { ConfigService } from '@nestjs/config';
import serverlessExpress from '@vendia/serverless-express';
import { Handler, Context, Callback } from 'aws-lambda';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';

let cachedServer: Handler;

async function bootstrap() {
  if (!cachedServer) {
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
            SafeLogger.info(
              `Successfully loaded ${secret.key} from Secrets Manager`,
            );
          } else {
            SafeLogger.warn(
              `${secret.key} not found in Secrets Manager. App functionality may be limited.`,
            );
          }
        }
      }
    }

    const expressApp = express();
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
      {
        rawBody: true, // Enable raw body for webhook signature verification
      },
    );

    const configService = app.get(ConfigService);

    // Security middleware
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
              "'self'",
              "'unsafe-inline'",
              'https://cdnjs.cloudflare.com',
            ],
            imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
            scriptSrc: [
              "'self'",
              "'unsafe-inline'",
              'https://cdnjs.cloudflare.com',
            ],
          },
        },
      }),
    );

    // CORS configuration
    const allowedOrigins = configService
      .get<string>('CORS_ORIGINS')
      ?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://staging.vpnkeen.com',
      'https://vpnkeen.com',
    ];

    app.enableCors({
      origin: (
        origin: string,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Global exception filter
    app.useGlobalFilters(new HttpExceptionFilter(configService));

    // Global logging interceptor
    app.useGlobalInterceptors(new LoggingInterceptor());

    // Set global API prefix
    app.setGlobalPrefix('api');

    // Swagger/OpenAPI setup
    const config = new DocumentBuilder()
      .setTitle('Keen Backend API')
      .setDescription('API documentation for Keen Backend')
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
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
      ],
      customCssUrl: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.css',
      ],
    });

    await app.init();

    cachedServer = serverlessExpress({ app: expressApp });
  }

  return cachedServer;
}

// Initialize the handler lazily
export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  // Prevent AWS Lambda from waiting for the event loop to be empty (e.g. Prisma connections)

  context.callbackWaitsForEmptyEventLoop = false;

  // Normalize event for serverless-express
  if (!event.requestContext) {
    event.requestContext = {
      httpMethod: event.httpMethod || 'GET',
      path: event.path || '/',
      resourcePath: event.path || '/',
      stage: 'dev',
      identity: {
        sourceIp: (event.headers && event.headers['client-ip']) || '127.0.0.1',
      },
    };
  }

  const server = await bootstrap();
  return server(event, context, callback);
};
