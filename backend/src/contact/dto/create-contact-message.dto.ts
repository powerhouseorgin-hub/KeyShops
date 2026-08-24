import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(200)
  name: string;

  @IsEmail({}, { message: 'Please enter a valid email address' })
  @MaxLength(200)
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Message is required' })
  @MinLength(10, { message: 'Message must be at least 10 characters' })
  @MaxLength(5000)
  message: string;
}
