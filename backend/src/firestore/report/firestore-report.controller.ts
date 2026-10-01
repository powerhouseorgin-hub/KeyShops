import { BadRequestException, Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { FirestoreActivityLogService } from './firestore-activity-log.service';
import { FirestoreRevenueService } from './firestore-revenue.service';
import { FirestoreDashboardService } from './firestore-dashboard.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller()
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class FirestoreReportController {
  constructor(
    private readonly activityLog: FirestoreActivityLogService,
    private readonly revenue: FirestoreRevenueService,
    private readonly dashboard: FirestoreDashboardService,
  ) {}

  // See FirestoreDashboardService's doc comment for the two disclosed
  // approximations (collectionGroup('documents') disambiguation, and
  // in-memory "popular keys"/monthly-trend aggregation over a capped
  // sample instead of a real counter-document pipeline).
  @Get('super/dashboard')
  @Roles(Role.SUPER_ADMIN)
  async getSuperDashboard() {
    return this.dashboard.getSuperDashboard();
  }

  @Get('shop/dashboard')
  @Roles(Role.SHOP_ADMIN)
  async getShopDashboard(@Req() req: any) {
    return this.dashboard.getShopDashboard(req.user.shopId);
  }

  @Get('super/revenue')
  @Roles(Role.SUPER_ADMIN)
  async getRevenue() {
    return this.revenue.getRevenueRecords();
  }

  @Post('super/revenue')
  @Roles(Role.SUPER_ADMIN)
  async logRevenue(
    @Body('month') month: number,
    @Body('year') year: number,
    @Body('amount') amount: number,
    @Body('notes') notes?: string,
  ) {
    const parsedMonth = Number(month);
    const parsedYear = Number(year);
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedMonth) || !Number.isFinite(parsedYear) || !Number.isFinite(parsedAmount)) {
      throw new BadRequestException('month, year and amount must all be valid numbers');
    }
    return this.revenue.logRevenue(parsedMonth, parsedYear, parsedAmount, notes);
  }

  // A Shop Admin's shopId is forced from their own token, never trusted
  // from the query string - the old TenantInterceptor/TenantService did
  // this injection automatically for every query; Firestore has no such
  // choke point, so it's enforced explicitly here instead (see the
  // migration plan's decision #9).
  @Get('activity-log')
  @Roles(Role.SUPER_ADMIN, Role.SHOP_ADMIN)
  async getActivityLog(
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('shopId') shopId?: string,
    @Query('action') action?: string,
  ) {
    const effectiveShopId = req.user.role === 'SHOP_ADMIN' ? req.user.shopId : shopId;
    return this.activityLog.getActivityLog({
      limit: Number(limit) || 25,
      cursor,
      shopId: effectiveShopId,
      action,
    });
  }
}
