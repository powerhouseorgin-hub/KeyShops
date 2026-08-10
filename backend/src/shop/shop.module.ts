import { Module } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { PublicShopController } from './public-shop.controller';
import { PublicSearchController } from './public-search.controller';
import { AuthModule } from '../auth/auth.module';
import { CustomerModule } from '../customer/customer.module';
import { PromotionModule } from '../promotion/promotion.module';

@Module({
  imports: [AuthModule, CustomerModule, PromotionModule],
  controllers: [ShopController, PublicShopController, PublicSearchController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
