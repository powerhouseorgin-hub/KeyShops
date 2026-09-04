import { Controller, Post, Body, Get, Delete, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, ChangePasswordDto, ResetPasswordPublicDto, RegisterShopDto, SendOtpDto, VerifyOtpDto, VerifyFirebasePhoneDto, UpdateLoginCredentialsDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SESSION_COOKIE_NAME, sessionCookieOptions, clearedSessionCookieOptions } from '../common/session-cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(loginDto);
    // Web only (see session-cookie.ts) - the response body still carries the
    // same accessToken it always has, unchanged, so nothing that reads it
    // today breaks; the cookie is additive.
    if (loginDto.platform !== 'native') {
      res.cookie(SESSION_COOKIE_NAME, result.accessToken, sessionCookieOptions());
    }
    return result;
  }

  // Stateless JWTs need no server-side session to invalidate - this exists
  // purely to clear the httpOnly web cookie above, which client-side JS
  // can't remove itself. Harmless (and a no-op) for native, which never had
  // this cookie set in the first place - called unconditionally from
  // AuthContext.jsx's logout() rather than branching on platform there.
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());
    return { success: true };
  }

  // Tighter than the app-wide default (120/min) - a 4-digit OTP has only
  // 9000 possible values, so without a strict per-route limit an attacker
  // could brute-force a code well within its 5-minute expiry window.
  @Throttle({ default: { limit: 6, ttl: 600000 } })
  @Post('send-otp')
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Throttle({ default: { limit: 15, ttl: 600000 } })
  @Post('verify-firebase-phone')
  async verifyFirebasePhone(@Body() dto: VerifyFirebasePhoneDto) {
    return this.authService.verifyFirebasePhoneToken(dto);
  }

  // Tighter than the app-wide default - this creates real User/Shop rows
  // and, unlike login/OTP, was relying only on the 120/min blanket limit
  // shared with every other unauthenticated route.
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @Post('register-shop')
  async registerShop(@Body() dto: RegisterShopDto) {
    return this.authService.registerShop(dto);
  }

  @Throttle({ default: { limit: 6, ttl: 600000 } })
  @Post('reset-password-public')
  async resetPasswordPublic(@Body() dto: ResetPasswordPublicDto) {
    return this.authService.resetPasswordPublic(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@Request() req, @Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, changePasswordDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('update-credentials')
  async updateLoginCredentials(@Request() req, @Body() dto: UpdateLoginCredentialsDto) {
    return this.authService.updateLoginCredentials(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req) {
    return this.authService.getSessionInfo(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  async deleteAccount(@Request() req) {
    return this.authService.deleteOwnAccount(req.user.id);
  }
}
