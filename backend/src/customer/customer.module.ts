import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { SuperCustomerController } from './super-customer.controller';
import { PublicReportController } from './public-report.controller';
import { FileService } from './file.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CustomerController, SuperCustomerController, PublicReportController],
  providers: [CustomerService, FileService],
  exports: [CustomerService, FileService],
})
export class CustomerModule {}
