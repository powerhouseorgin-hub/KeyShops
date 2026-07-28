import { Controller, Get, Post, Body, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  // ==========================================
  // SUPER ADMIN DASHBOARD & REVENUE ENDPOINTS
  // ==========================================

  @Get('super/dashboard')
  @Roles(Role.SUPER_ADMIN)
  async getSuperDashboard() {
    return this.reportService.getSuperDashboard();
  }

  @Get('super/revenue')
  @Roles(Role.SUPER_ADMIN)
  async getRevenue() {
    return this.reportService.getRevenueRecords();
  }

  @Post('super/revenue')
  @Roles(Role.SUPER_ADMIN)
  async logRevenue(
    @Body('month') month: number,
    @Body('year') year: number,
    @Body('amount') amount: number,
    @Body('notes') notes?: string,
  ) {
    // These are plucked directly off the raw JSON body (@Body('field')), which
    // bypasses class-validator/class-transformer entirely - there's no DTO
    // class here for Nest's ValidationPipe to coerce against. The frontend
    // form sends `amount` as whatever type its input's value happens to be
    // (a string, from a plain text/number input's e.target.value), which
    // Prisma then rejects outright since RevenueRecord.amount is a Float
    // column. Coerce + validate defensively here instead of trusting the
    // client to have sent a real number.
    const parsedMonth = Number(month);
    const parsedYear = Number(year);
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedMonth) || !Number.isFinite(parsedYear) || !Number.isFinite(parsedAmount)) {
      throw new BadRequestException('month, year and amount must all be valid numbers');
    }
    return this.reportService.logRevenue(parsedMonth, parsedYear, parsedAmount, notes);
  }

  // ==========================================
  // SHOP ADMIN DASHBOARD & REPORTS ENDPOINTS
  // ==========================================

  @Get('shop/dashboard')
  @Roles(Role.SHOP_ADMIN)
  async getShopDashboard(@Request() req) {
    return this.reportService.getShopDashboard(req.user.shopId);
  }

  @Get('support-config')
  async getSupportConfig() {
    return this.reportService.getSupportConfig();
  }

  @Post('super/support-config')
  @Roles(Role.SUPER_ADMIN)
  async updateSupportConfig(
    @Body() dto: {
      whatsapp: string;
      videos: { name: string; url: string }[];
      email?: string;
      customerCareNumber?: string;
      subscriptionPrice?: number;
    },
  ) {
    return this.reportService.updateSupportConfig(dto);
  }
}
