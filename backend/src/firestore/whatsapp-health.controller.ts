import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WhatsappHealthService } from './whatsapp-health.service';
import { FirebaseAuthGuard } from './auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';

// Super Admin only: the outcome of the last WhatsApp health check, and a button to run it now (the same check runs daily on its own).
@Controller('super/whatsapp-health')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class WhatsappHealthController {
  constructor(private readonly health: WhatsappHealthService) {}

  @Get()
  async last() {
    return (await this.health.last()) || { ok: null, checkedAt: null, problems: [], stats: null };
  }

  @Post('run')
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  async run() {
    return this.health.run();
  }
}
