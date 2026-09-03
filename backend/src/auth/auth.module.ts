import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { PaymentModule } from '../payment/payment.module';
import { getRequiredSecret } from '../common/required-env';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: getRequiredSecret('JWT_SECRET', 'kee-jwt-super-secret-key-2026-phase-1'),
      signOptions: { expiresIn: '24h' },
    }),
    PaymentModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard],
  exports: [AuthService, JwtStrategy, RolesGuard, JwtModule],
})
export class AuthModule {}
