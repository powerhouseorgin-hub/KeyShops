import { Injectable, Module } from '@nestjs/common';
import { FirestoreService } from '../firestore.service';
import { NamedReferenceListService } from './named-reference-list.service';
import { PlatformConfigService } from './platform-config.service';

@Injectable()
export class ShopCategoryService extends NamedReferenceListService {
  constructor(firestore: FirestoreService) {
    super(firestore.db, 'shopCategories', true);
  }
}

@Injectable()
export class ProductTypeService extends NamedReferenceListService {
  constructor(firestore: FirestoreService) {
    super(firestore.db, 'productTypes', false);
  }
}

@Injectable()
export class KeyTypeService extends NamedReferenceListService {
  constructor(firestore: FirestoreService) {
    super(firestore.db, 'keyTypes', false);
  }
}

@Module({
  providers: [PlatformConfigService, ShopCategoryService, ProductTypeService, KeyTypeService],
  exports: [PlatformConfigService, ShopCategoryService, ProductTypeService, KeyTypeService],
})
export class ReferenceListsModule {}
