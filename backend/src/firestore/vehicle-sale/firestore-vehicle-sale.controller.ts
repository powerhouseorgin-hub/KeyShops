import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirestoreVehicleSaleService, type CreateVehicleSaleInput } from './firestore-vehicle-sale.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/role.enum';

// Shop Admin only; every query is scoped to req.user.shopId (taken from the verified token claims, never
// from the request), so a Shop Admin can only ever reach their own shop's sales.
@Controller('shop/vehicle-sales')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SHOP_ADMIN)
export class FirestoreVehicleSaleController {
  constructor(private readonly sales: FirestoreVehicleSaleService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateVehicleSaleInput) {
    return this.sales.create(req.user.shopId, req.user.id, dto);
  }

  @Get()
  async list(@Req() req: any, @Query('limit') limit?: string) {
    return this.sales.list(req.user.shopId, limit ? Number(limit) : undefined);
  }

  // multipart, field "file": one photo per request (the app sends up to 5, one after another). The server refuses a
  // sixth photo for the same sale.
  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async addPhoto(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any) {
    return this.sales.addPhoto(req.user.shopId, id, file);
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    return this.sales.get(req.user.shopId, id);
  }
}

// SUPER ADMIN: sales recorded by the Super Admin themselves (no shop involved - they are stored under the Super Admin's own
// user document and carry their name), plus the platform-wide review of every sale. The owner always comes from the verified
// token (req.user.id), never from the request.
@Controller('super')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class FirestoreSuperVehicleSaleController {
  constructor(private readonly sales: FirestoreVehicleSaleService) {}

  private owner(req: any) {
    return { type: 'SUPER_ADMIN' as const, id: req.user.id as string };
  }

  @Post('vehicle-sales')
  async create(@Req() req: any, @Body() dto: CreateVehicleSaleInput) {
    return this.sales.create(this.owner(req), req.user.id, dto);
  }

  @Get('vehicle-sales')
  async list(@Req() req: any, @Query('limit') limit?: string) {
    return this.sales.list(this.owner(req), limit ? Number(limit) : undefined);
  }

  @Post('vehicle-sales/:id/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async addPhoto(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any) {
    return this.sales.addPhoto(this.owner(req), id, file);
  }

  @Get('vehicle-sales/:id')
  async get(@Req() req: any, @Param('id') id: string) {
    return this.sales.get(this.owner(req), id);
  }

  // Every sale on the platform, newest first. `shopId` = one shop, or "SUPER_ADMIN" for the Super Admin's own sales.
  @Get('all-vehicle-sales')
  async listAll(@Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('shopId') shopId?: string) {
    return this.sales.listAll({ limit: limit ? Number(limit) : undefined, cursor, shopId });
  }
}
