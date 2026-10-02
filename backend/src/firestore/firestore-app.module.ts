import { Injectable, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FirestoreModule } from './firestore.module';
import { ReferenceListsModule } from './config/reference-lists.module';
import { ShopRepository } from './shop/shop.repository';
import { UserRepository } from './shop/user.repository';
import { ShopRegistrationService } from './shop/shop-registration.service';
import { MasterKeyRepository } from './customer/master-key.repository';
import { CustomerRegistrationService } from './customer/customer-registration.service';
import { CustomerFilesService } from './customer/customer-files.service';
import { FirestoreCustomerService } from './customer/firestore-customer.service';
import { FirestoreCustomerController } from './customer/firestore-customer.controller';
import { FirestoreSuperCustomerController } from './customer/firestore-super-customer.controller';
import { PublicReportController } from './customer/public-report.controller';
import { CryptoService } from '../crypto/crypto.service';
import { FirebaseAuthService } from './auth/firebase-auth.service';
import { FirebaseAuthGuard } from './auth/firebase-auth.guard';
import { FirestoreAuthController, AuthGuardSmokeTestController } from './auth/firestore-auth.controller';
import { FirebaseFileService } from './storage/firebase-file.service';
import { FirestoreAdService } from './ad/firestore-ad.service';
import { FirestoreAdController } from './ad/firestore-ad.controller';
import { PublicAdController } from './ad/public-ad.controller';
import { FirestoreNotificationService } from './notification/firestore-notification.service';
import { FirestoreNotificationController, FirestoreSuperNotificationController } from './notification/firestore-notification.controller';
import { FirestoreActivityLogService } from './report/firestore-activity-log.service';
import { FirestoreRevenueService } from './report/firestore-revenue.service';
import { FirestoreDashboardService } from './report/firestore-dashboard.service';
import { FirestoreReportController } from './report/firestore-report.controller';
import { FirestoreContactService } from './contact/firestore-contact.service';
import { FirestoreContactController, FirestoreSuperContactController } from './contact/firestore-contact.controller';
import { FirestorePromotionService } from './promotion/firestore-promotion.service';
import { FirestorePromotionController, PublicPromotionController } from './promotion/firestore-promotion.controller';
import { FirestoreShopService } from './shop/firestore-shop.service';
import { FirestoreShopController } from './shop/firestore-shop.controller';
import { PublicShopController, PublicSearchController } from './shop/public-shop.controller';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GeoController } from './geo/geo.controller';
import { FirestoreKeyService } from './key/firestore-key.service';
import { FirestoreKeyController } from './key/firestore-key.controller';
import { KeyTypeController, ProductTypeController, ShopCategoryController } from './config/reference-list.controller';
import { PublicSupportConfigController, SuperSupportConfigController } from './config/support-config.controller';
import { FirestorePaymentService } from './payment/firestore-payment.service';
import { FirestorePaymentController } from './payment/firestore-payment.controller';
import { AlgoliaSearchService } from './search/algolia-search.service';

// Aggregates every Firestore-rewrite piece built so far. Deliberately NOT
// imported by the live AppModule yet - this is its own self-contained
// module graph, bootstrapped only by the smoke-test scripts (and, once
// ready, a separate standalone bootstrap for real Cloud Run testing). The
// production app keeps running entirely on the Prisma-based modules until
// an explicit, deliberate cutover.
// Behind Firebase Hosting + Google's frontends, req.ip is a Google proxy
// address shared by every visitor - throttling on it would rate-limit ALL
// users collectively. Key on the client IP in X-Forwarded-For instead. (The
// header is client-appendable, so a determined attacker can spoof it; that
// only weakens throttling for them, it can never lock out real users, which
// is the right failure direction.)
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const xff = req.headers?.['x-forwarded-for'];
    const first = typeof xff === 'string' ? xff.split(',')[0].trim() : '';
    return first || req.ip;
  }
}

@Module({
  imports: [
    FirestoreModule,
    ReferenceListsModule,
    ScheduleModule.forRoot(),
    // Same global baseline as the old AppModule; sensitive routes override
    // with tighter @Throttle limits directly on their controller methods.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]),
  ],
  controllers: [
    FirestoreAuthController,
    AuthGuardSmokeTestController,
    FirestoreAdController,
    PublicAdController,
    FirestoreNotificationController,
    FirestoreSuperNotificationController,
    FirestoreReportController,
    FirestoreContactController,
    FirestoreSuperContactController,
    FirestorePromotionController,
    PublicPromotionController,
    FirestoreShopController,
    PublicShopController,
    PublicSearchController,
    FirestoreCustomerController,
    FirestoreSuperCustomerController,
    PublicReportController,
    GeoController,
    FirestoreKeyController,
    KeyTypeController,
    ProductTypeController,
    ShopCategoryController,
    PublicSupportConfigController,
    SuperSupportConfigController,
    FirestorePaymentController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    ShopRepository,
    UserRepository,
    ShopRegistrationService,
    MasterKeyRepository,
    CustomerRegistrationService,
    CustomerFilesService,
    FirebaseAuthService,
    FirebaseAuthGuard,
    FirebaseFileService,
    FirestoreAdService,
    FirestoreNotificationService,
    FirestoreActivityLogService,
    FirestoreRevenueService,
    FirestoreDashboardService,
    FirestoreContactService,
    FirestorePromotionService,
    FirestoreShopService,
    FirestoreCustomerService,
    CryptoService,
    FirestoreKeyService,
    FirestorePaymentService,
    AlgoliaSearchService,
  ],
  exports: [],
})
export class FirestoreAppModule {}
