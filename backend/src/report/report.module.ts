import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { PublicSupportConfigController } from './public-support-config.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ReportController, PublicSupportConfigController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
