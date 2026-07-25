import { IsNotEmpty, IsString } from 'class-validator';

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
