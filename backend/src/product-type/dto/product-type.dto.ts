import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProductTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Product type name is required' })
  name: string;
}

export class UpdateProductTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Product type name is required' })
  name: string;
}
