import { Module } from '@nestjs/common';
import { KeyTypeService } from './key-type.service';
import { KeyTypeController } from './key-type.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [KeyTypeController],
  providers: [KeyTypeService],
  exports: [KeyTypeService],
})
export class KeyTypeModule {}
