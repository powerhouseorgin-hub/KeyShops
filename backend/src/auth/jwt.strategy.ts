import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { TenantService } from '../tenant/tenant.service';
import { getShopSubscriptionState, SUBSCRIPTION_EXPIRED_MESSAGE } from '../common/subscription-status';
import { getRequiredSecret } from '../common/required-env';
import { getCachedAuthCheck, setCachedAuthCheck } from './auth-cache';
import { SESSION_COOKIE_NAME } from '../common/session-cookie';

// The web dashboard now sends its JWT via an httpOnly cookie instead of the
// Authorization header (see session-cookie.ts/AuthController.login) - native
// still sends the header exactly as before, so the header is checked first
// and this cookie fallback only ever fires for a web request. No
// cookie-parser middleware needed for one fixed cookie name - just enough
// parsing to pull it out of the raw Cookie header.
function cookieExtractor(req: Request): string | null {
  const raw = req?.headers?.cookie;
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly tenantService: TenantService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: getRequiredSecret('JWT_SECRET', 'kee-jwt-super-secret-key-2026-phase-1'),
    });
  }

  async validate(payload: any) {
    // See auth-cache.ts's doc comment: this runs on every authenticated
    // request, and for a SHOP_ADMIN it's normally 3 sequential cross-region
    // DB round-trips - measured at 2-4+ seconds of pure overhead versus a
    // SUPER_ADMIN's single query, on every single screen/request. A cache
    // hit skips all of that.
    const cached = getCachedAuthCheck(payload.sub);
    if (cached) {
      if (cached.shopActive === false) {
        throw new UnauthorizedException('Your shop has been suspended. Please contact Super Admin.');
      }
      if (cached.subscriptionState === 'GRACE_PERIOD_EXPIRED') {
        throw new UnauthorizedException(SUBSCRIPTION_EXPIRED_MESSAGE);
      }
      return cached.user;
    }

    const user = await this.tenantService.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        shopId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or session expired');
    }

    let shopActive: boolean | null = null;
    let subscriptionState: string | null = null;

    // If shop is inactive and role is SHOP_ADMIN, deny access
    if (user.shopId && user.role === 'SHOP_ADMIN') {
      const shop = await this.tenantService.prisma.shop.findUnique({
        where: { id: user.shopId },
        select: { isActive: true },
      });
      if (!shop || !shop.isActive) {
        setCachedAuthCheck(payload.sub, { user, shopActive: false, subscriptionState: null });
        throw new UnauthorizedException('Your shop has been suspended. Please contact Super Admin.');
      }
      shopActive = true;

      // Re-checked on every request (not just at login, and now not just on
      // every un-cached request either - see invalidateAuthCache call sites)
      // so a shop that slides into GRACE_PERIOD_EXPIRED mid-session is
      // locked out within TTL_MS, not just at their next login attempt.
      const { state } = await getShopSubscriptionState(this.tenantService, user.shopId);
      subscriptionState = state;
      if (state === 'GRACE_PERIOD_EXPIRED') {
        setCachedAuthCheck(payload.sub, { user, shopActive, subscriptionState });
        throw new UnauthorizedException(SUBSCRIPTION_EXPIRED_MESSAGE);
      }
    }

    setCachedAuthCheck(payload.sub, { user, shopActive, subscriptionState });
    return user;
  }
}
