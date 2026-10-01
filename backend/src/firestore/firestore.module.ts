import { Global, Module } from '@nestjs/common';
import { FirestoreService } from './firestore.service';
import { WhatsappOtpService } from './whatsapp-otp.service';
import { WhatsappInvoiceService } from './whatsapp-invoice.service';

@Global()
@Module({
  providers: [FirestoreService, WhatsappOtpService, WhatsappInvoiceService],
  exports: [FirestoreService, WhatsappOtpService, WhatsappInvoiceService],
})
export class FirestoreModule {}
