import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaClient } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import {
  ChangeOrderStatusDto,
  CreateOrderDto,
  PaginationOrderDto,
  PaidOrderDto,
} from './dto';
import { NATS_CLIENT } from 'src/config';
import { OrderWithProducts } from './interfaces';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(@Inject(NATS_CLIENT) private readonly client: ClientProxy) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection has been established.');
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      //* validacion de productos
      const ids = createOrderDto.items.map((product) => product.productId);
      const products = await firstValueFrom(
        this.client.send({ cmd: 'validateProduct' }, { ids }),
      );

      //* calculo valores
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;

        if (!price) {
          throw new RpcException({
            message: `Product with ID: ${orderItem.productId} not found.`,
            status: HttpStatus.NOT_FOUND,
          });
        }

        return acc + price * orderItem.quantity;
      }, 0);

      const totalItems = createOrderDto.items.reduce(
        (acc, orderItem) => acc + orderItem.quantity,
        0,
      );

      //* transaccion bd
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItems: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                quantity: orderItem.quantity,
                productId: orderItem.productId,
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
              })),
            },
          },
        },
        include: {
          OrderItems: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      return {
        ...order,
        OrderItems: order.OrderItems.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)
            .name,
        })),
      };
    } catch (error) {
      throw new RpcException(error);
    }

    // return this.order.create({
    //   data: createOrderDto,
    // });
  }

  async findAll(paginationOrderDto: PaginationOrderDto) {
    const { page, limit, status } = paginationOrderDto;

    const total = await this.order.count({
      where: {
        status,
      },
    });

    const lastPage = Math.ceil(total / limit);

    return {
      data: await this.order.findMany({
        skip: (page - 1) * limit,
        take: limit,
        where: {
          status,
        },
      }),
      meta: {
        page,
        limit,
        total,
        lastPage,
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItems: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });

    if (!order) {
      throw new RpcException({
        message: `Order with ID: ${id} not found.`,
        status: HttpStatus.NOT_FOUND,
      });
    }

    // get product ids
    const productIds = order.OrderItems.map((orderItem) => orderItem.productId);
    const products = await firstValueFrom(
      this.client.send({ cmd: 'validateProduct' }, { ids: productIds }),
    );

    if (products.length === 0) {
      throw new RpcException({
        messagge: `Products in order with ID: ${id} not found.`,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return {
      ...order,
      OrderItems: order.OrderItems.map((orderItem) => ({
        ...orderItem,
        name: products.find((product) => product.id === orderItem.productId)
          .name,
      })),
    };
  }

  async changueOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);

    if (order.status === status) {
      return order;
    }

    await this.order.update({
      where: { id },
      data: { status },
    });

    order.status = status;
    return order;
  }

  async createPaymentSession(order: OrderWithProducts) {
    try {
      const paymentSession = await firstValueFrom(
        this.client.send('create.payment.session', {
          orderId: order.id,
          currency: 'usd',
          items: order.OrderItems.map((orderItem) => ({
            name: orderItem.name,
            price: orderItem.price,
            quantity: orderItem.quantity,
          })),
        }),
      );

      return paymentSession;
    } catch (error) {
      throw new RpcException(error);
    }
  }

  async paidOrder(paidOrderDto: PaidOrderDto) {
    const { orderId, stripeOrderId, receipUrl } = paidOrderDto;

    const order = await this.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: stripeOrderId,

        // relacion con receipt
        OrderReceipt: {
          create: {
            receiptUrl: receipUrl,
          },
        },
      },
    });

    this.logger.log(`Order with ID: ${orderId} has been paid.`);

    return order;
  }
}
