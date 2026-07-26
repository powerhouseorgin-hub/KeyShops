import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { TenantInterceptor } from './tenant/tenant.interceptor';

@Module({
  imports: [
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
  ],
  controllers: [AppController, GeoController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
