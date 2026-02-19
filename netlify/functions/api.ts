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
import serverless from 'serverless-http';
import { Handler } from '@netlify/functions';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  // Fetch NODE_TOKEN from Secrets Manager if not provided in environment (for Staging/Prod)
  const env = process.env.NODE_ENV || 'development';
  if (['staging', 'production'].includes(env) && !process.env.NODE_TOKEN) {
    SafeLogger.info('Fetching NODE_TOKEN from Secrets Manager', {
      environment: env,
    });
    const token = await SecretsUtil.fetchNodeToken(env);
    if (token) {
      process.env.NODE_TOKEN = token;
      SafeLogger.info('Successfully loaded NODE_TOKEN from Secrets Manager');
    } else {
      SafeLogger.warn(
        'NODE_TOKEN not found in Secrets Manager. Node registration may fail.',
      );
    }
  }

  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
  });

  const configService = app.get(ConfigService);

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

  // CORS configuration
  const allowedOrigins = configService
    .get<string>('CORS_ORIGINS')
    ?.split(',') || ['http://localhost:3000', 'http://localhost:5173'];

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
    .setDescription('API documentation for Keen Backend - Auth Service')
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
  SwaggerModule.setup('docs', app, document);

  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();

  return serverless(expressApp) as unknown as Handler;
}

// Initialize the handler lazily
let requestHandler: Handler;

export const handler: Handler = async (event, context) => {
  if (!requestHandler) {
    requestHandler = await bootstrap();
  }

  return requestHandler(event, context) as any;
};
