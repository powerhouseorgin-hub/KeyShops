import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreateShopCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  name: string;
}

export class UpdateShopCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  name: string;
}

export class ReorderShopCategoriesDto {
  // Every active category's id, in the order they should now appear.
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[];
}
