import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
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
  // Optional second part `thumb`: a small JPEG thumbnail kept inline on the sale (for a fast details screen).
  @Post(':id/photos')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }], { limits: { fileSize: 5 * 1024 * 1024, files: 2 } }))
  async addPhoto(@Req() req: any, @Param('id') id: string, @UploadedFiles() files: { file?: any[]; thumb?: any[] }) {
    return this.sales.addPhoto(req.user.shopId, id, files?.file?.[0], files?.thumb?.[0]);
  }

  // multipart, field "file": the seller's or buyer's signature (PNG). Signing again replaces the earlier one.
  @Post(':id/signatures/:party')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  async addSignature(@Req() req: any, @Param('id') id: string, @Param('party') party: string, @UploadedFile() file: any) {
    return this.sales.addSignature(req.user.shopId, id, party, file);
  }

  // multipart: `file` = the receipt PDF (made by the app in the sale's language), `recipients` = "seller,buyer" (default) or one of them.
  // Sends it to the seller and the buyer over WhatsApp at the same time and answers with each recipient's outcome.
  @Post(':id/send-invoice')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async sendInvoice(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any, @Body('recipients') recipients?: string) {
    return this.sales.sendInvoice(req.user.shopId, id, file, recipients);
  }

  // The shop's complete sales history in pages (the "All Sales" screen): { items, nextCursor }, own shop only.
  @Get('history')
  async history(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.sales.listPage(req.user.shopId, { limit: limit ? Number(limit) : undefined, cursor });
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
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }], { limits: { fileSize: 5 * 1024 * 1024, files: 2 } }))
  async addPhoto(@Req() req: any, @Param('id') id: string, @UploadedFiles() files: { file?: any[]; thumb?: any[] }) {
    return this.sales.addPhoto(this.owner(req), id, files?.file?.[0], files?.thumb?.[0]);
  }

  @Post('vehicle-sales/:id/send-invoice')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async sendInvoice(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any, @Body('recipients') recipients?: string) {
    return this.sales.sendInvoice(this.owner(req), id, file, recipients);
  }

  @Post('vehicle-sales/:id/signatures/:party')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  async addSignature(@Req() req: any, @Param('id') id: string, @Param('party') party: string, @UploadedFile() file: any) {
    return this.sales.addSignature(this.owner(req), id, party, file);
  }

  @Get('vehicle-sales/:id')
  async get(@Req() req: any, @Param('id') id: string) {
    return this.sales.get(this.owner(req), id);
  }

  // One sale of any shop (or the Super Admin's own) by its document `path` - the full record with its inline thumbnails and signatures.
  @Get('all-vehicle-sales/item')
  async getByPath(@Query('path') path: string) {
    return this.sales.getByPath(path);
  }

  // Send the receipt of ANY sale on the platform (identified by its document `path`, a form field) to its seller and buyer.
  @Post('all-vehicle-sales/send-invoice')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async sendInvoiceByPath(@UploadedFile() file: any, @Body('path') path: string, @Body('recipients') recipients?: string) {
    return this.sales.sendInvoiceByPath(path, file, recipients);
  }

  // Every sale on the platform, newest first. `shopId` = one shop, or "SUPER_ADMIN" for the Super Admin's own sales.
  @Get('all-vehicle-sales')
  async listAll(@Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('shopId') shopId?: string) {
    return this.sales.listAll({ limit: limit ? Number(limit) : undefined, cursor, shopId });
  }
}
