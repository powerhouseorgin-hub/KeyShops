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
