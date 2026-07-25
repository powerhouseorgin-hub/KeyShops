import { Module } from '@nestjs/common';
import { ShopCategoryService } from './shop-category.service';
import { ShopCategoryController } from './shop-category.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ShopCategoryController],
  providers: [ShopCategoryService],
  exports: [ShopCategoryService],
})
export class ShopCategoryModule {}
