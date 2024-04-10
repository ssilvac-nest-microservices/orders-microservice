import { IsString, IsUrl, IsUUID } from 'class-validator';

export class PaidOrderDto {
  @IsString()
  stripeOrderId: string;

  @IsString()
  @IsUUID()
  orderId: string;

  @IsString()
  @IsUrl()
  receipUrl: string;
}
