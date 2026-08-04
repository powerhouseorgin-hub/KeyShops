import { Module } from '@nestjs/common';
import { AdService } from './ad.service';
import { AdController } from './ad.controller';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../common/file.module';

@Module({
  imports: [AuthModule, FileModule],
  controllers: [AdController],
  providers: [AdService],
  exports: [AdService],
})
export class AdModule {}
