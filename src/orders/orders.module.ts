import { ClientsModule, Transport } from '@nestjs/microservices';
import { Module } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { envs, PRODUCTS_SERVICE } from 'src/config';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [
    ClientsModule.register([
      {
        name: PRODUCTS_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.productsMicroservice.port,
          host: envs.productsMicroservice.host,
        },
      },
    ]),
  ],
})
export class OrdersModule {}
