import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { GeoController } from './geo/geo.controller';
import { TenantModule } from './tenant/tenant.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { ShopModule } from './shop/shop.module';
import { CustomerModule } from './customer/customer.module';
import { KeyModule } from './key/key.module';
import { AdModule } from './ad/ad.module';
import { ReportModule } from './report/report.module';
import { NotificationModule } from './notification/notification.module';
import { PromotionModule } from './promotion/promotion.module';
import { ShopCategoryModule } from './shop-category/shop-category.module';
import { ProductTypeModule } from './product-type/product-type.module';
import { KeyTypeModule } from './key-type/key-type.module';
import { PaymentModule } from './payment/payment.module';
import { ContactModule } from './contact/contact.module';
import { TenantInterceptor } from './tenant/tenant.interceptor';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';

@Module({
  imports: [
    // Global baseline: 120 requests/minute per IP across the whole API.
    // Sensitive routes (OTP send/verify) apply a much tighter @Throttle
    // override directly on their controller methods - see auth.controller.ts.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]),
    // Powers PromotionService's @Cron hourly purge of expired Machine/Product
    // listings (see PromotionService.deleteExpiredProducts).
    ScheduleModule.forRoot(),
    TenantModule,
    CryptoModule,
    AuthModule,
    ShopModule,
    CustomerModule,
    KeyModule,
    AdModule,
    ReportModule,
    NotificationModule,
    PromotionModule,
    ShopCategoryModule,
    ProductTypeModule,
    KeyTypeModule,
    PaymentModule,
    ContactModule,
  ],
  controllers: [AppController, GeoController],
  providers: [
    // Registration order matters: interceptors wrap outer-to-inner in the
    // order they're provided, so logging runs outermost - its start/end
    // timing spans the tenant-context setup too, not just the handler.
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
