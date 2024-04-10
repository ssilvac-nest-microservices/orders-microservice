import { Controller, ParseUUIDPipe } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';

import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  PaginationOrderDto,
  ChangeOrderStatusDto,
  PaidOrderDto,
} from './dto';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern('createOrder')
  async create(@Payload() createOrderDto: CreateOrderDto) {
    const order = await this.ordersService.create(createOrderDto);
    const paymentSession = await this.ordersService.createPaymentSession(order);

    console.log(paymentSession);
    return { order, paymentSession };
  }

  @MessagePattern('findAllOrders')
  findAll(@Payload() paginationOrderDto: PaginationOrderDto) {
    return this.ordersService.findAll(paginationOrderDto);
  }

  @MessagePattern('findOneOrder')
  findOne(@Payload('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @MessagePattern('changueOrderStatus')
  changueOrderStatus(@Payload() changeOrderStatusDto: ChangeOrderStatusDto) {
    return this.ordersService.changueOrderStatus(changeOrderStatusDto);
  }

  @EventPattern('payment.succeeded')
  paidOrder(@Payload() paimentOrderDto: PaidOrderDto) {
    return this.ordersService.paidOrder(paimentOrderDto);
  }
}
