import { Module } from '@nestjs/common';
import { PromotionService } from './promotion.service';
import { PromotionController } from './promotion.controller';
import { PublicPromotionController } from './public-promotion.controller';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../common/file.module';

@Module({
  imports: [AuthModule, FileModule],
  controllers: [PromotionController, PublicPromotionController],
  providers: [PromotionService],
  exports: [PromotionService],
})
export class PromotionModule {}
