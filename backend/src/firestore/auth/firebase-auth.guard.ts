import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { FirebaseAuthService } from './firebase-auth.service';
import { UserRepository } from '../shop/user.repository';
import { FirestoreService } from '../firestore.service';
import { getShopSubscriptionStateFirestore } from './firestore-subscription-status';
import { SUBSCRIPTION_EXPIRED_MESSAGE } from '../../common/subscription-status';
import { SESSION_COOKIE_NAME } from '../../common/session-cookie';
import { getCachedAuthCheck, setCachedAuthCheck } from '../../auth/auth-cache';

// Replaces JwtAuthGuard + JwtStrategy combined - a plain NestJS guard
// instead of a Passport strategy, since there's no passport-jwt-style
// synchronous secret-based verification happening anymore (Firebase Admin
// SDK's verifyIdToken/verifySessionCookie are the verification, already
// async, so wrapping them in Passport's Strategy abstraction would add
// nothing). Same dual-extraction (header first, cookie fallback), same
// auth-cache reuse (unchanged - it's already generic, keyed by uid), same
// shop-suspended/subscription-expired enforcement on every request.
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const raw = req.headers.cookie;
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly firebaseAuth: FirebaseAuthService,
    private readonly users: UserRepository,
    private readonly firestore: FirestoreService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('No authentication token provided');

    const decoded = await this.firebaseAuth.verifyRequestToken(token);
    const uid = decoded.uid;

    const cached = getCachedAuthCheck(uid);
    if (cached) {
      if (cached.shopActive === false) throw new UnauthorizedException('Your shop has been suspended. Please contact Super Admin.');
      if (cached.subscriptionState === 'GRACE_PERIOD_EXPIRED') throw new UnauthorizedException(SUBSCRIPTION_EXPIRED_MESSAGE);
      (req as any).user = cached.user;
      return true;
    }

    const user = await this.users.findById(uid);
    if (!user) throw new UnauthorizedException('User not found or session expired');

    let shopActive: boolean | null = null;
    let subscriptionState: string | null = null;

    if (user.shopId && user.role === 'SHOP_ADMIN') {
      const shopDoc = await this.firestore.db.collection('shops').doc(user.shopId).get();
      const shop = shopDoc.data();
      if (!shopDoc.exists || !shop?.isActive) {
        setCachedAuthCheck(uid, { user: { ...user, id: uid }, shopActive: false, subscriptionState: null });
        throw new UnauthorizedException('Your shop has been suspended. Please contact Super Admin.');
      }
      shopActive = true;

      const { state } = await getShopSubscriptionStateFirestore(this.firestore, user.shopId);
      subscriptionState = state;
      if (state === 'GRACE_PERIOD_EXPIRED') {
        setCachedAuthCheck(uid, { user: { ...user, id: uid }, shopActive, subscriptionState });
        throw new UnauthorizedException(SUBSCRIPTION_EXPIRED_MESSAGE);
      }
    }

    const result = { ...user, id: uid };
    setCachedAuthCheck(uid, { user: result, shopActive, subscriptionState });
    (req as any).user = result;
    return true;
  }
}
