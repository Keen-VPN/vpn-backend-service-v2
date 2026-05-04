import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { AccountModule } from './account/account.module';
import { PaymentModule } from './payment/payment.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ConnectionModule } from './connection/connection.module';
import { VPNConfigModule } from './config/vpn-config.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationModule } from './notification/notification.module';
import { PreferencesModule } from './preferences/preferences.module';
import { NodesModule } from './nodes/nodes.module';
import { SalesContactModule } from './sales-contact/sales-contact.module';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { VpnModule } from './vpn/vpn.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    NotificationModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    AuthModule,
    CryptoModule,
    AccountModule,
    PaymentModule,
    SubscriptionModule,
    ConnectionModule,
    VPNConfigModule,
    NotificationsModule,
    PreferencesModule,
    NodesModule,
    SalesContactModule,
    VpnModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*path');
  }
}
