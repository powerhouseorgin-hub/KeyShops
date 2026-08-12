import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly tenantService: TenantService) {
    // Falls back to a hardcoded secret for development convenience if JWT_SECRET
    // isn't set. If this fallback is ever actually in use in a real environment,
    // anyone who knows a user's id (the JWT's `sub`) can forge a valid session for
    // them using this publicly-visible string. Warn loudly rather than silently
    // using it.
    if (!process.env.JWT_SECRET) {
      console.error('[SECURITY WARNING] JWT_SECRET is not set - falling back to a hardcoded, publicly-visible secret. Set JWT_SECRET in this environment immediately.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'kee-jwt-super-secret-key-2026-phase-1',
    });
  }

  async validate(payload: any) {
    const user = await this.tenantService.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        shopId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or session expired');
    }

    // If shop is inactive and role is SHOP_ADMIN, deny access
    if (user.shopId && user.role === 'SHOP_ADMIN') {
      const shop = await this.tenantService.prisma.shop.findUnique({
        where: { id: user.shopId },
        select: { isActive: true },
      });
      if (!shop || !shop.isActive) {
        throw new UnauthorizedException('Your shop has been suspended. Please contact Super Admin.');
      }
    }

    return user;
  }
}
