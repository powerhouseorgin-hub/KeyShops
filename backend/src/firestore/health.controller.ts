import { Controller, Get } from '@nestjs/common';

// Lightweight, unauthenticated liveness check: GET /api/health. The frontend pings it when the app boots
// (apiConfig/AuthContext) to wake a cold Cloud Function instance while the user is still typing their
// credentials, and it is the path to use for uptime monitoring. Deliberately touches nothing (no Firestore
// read), so it stays fast and cannot fail because of a downstream outage.
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
