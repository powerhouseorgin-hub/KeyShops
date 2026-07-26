import { IsNotEmpty, IsString } from 'class-validator';

export class CreateKeyTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Key type name is required' })
  name: string;
}

export class UpdateKeyTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Key type name is required' })
  name: string;
}
