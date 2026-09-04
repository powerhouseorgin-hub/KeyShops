import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReportService } from './report.service';

// PUBLIC (no auth) - split out of ReportController because that controller
// applies @UseGuards(JwtAuthGuard, RolesGuard) at the class level, which
// can't be selectively opted out of per-route. This powers the pre-login
// self-registration wizard's Payable Amount display (and the Payment
// module's order-creation amount) via PlatformConfig.subscriptionPrice, so
// it must be reachable before the shop owner has an account - mirrors
// ShopCategoryController's split public/guarded-route pattern.
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller()
export class PublicSupportConfigController {
  constructor(private readonly reportService: ReportService) {}

  @Get('support-config')
  async getSupportConfig() {
    return this.reportService.getSupportConfig();
  }
}
