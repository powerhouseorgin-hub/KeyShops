import { Module } from '@nestjs/common';
import { PromotionService } from './promotion.service';
import { PromotionController } from './promotion.controller';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../common/file.module';

@Module({
  imports: [AuthModule, FileModule],
  controllers: [PromotionController],
  providers: [PromotionService],
  exports: [PromotionService],
})
export class PromotionModule {}
