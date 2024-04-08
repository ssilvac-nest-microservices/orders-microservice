import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';

import {
  ChangeOrderStatusDto,
  CreateOrderDto,
  PaginationOrderDto,
} from './dto';
import { PRODUCTS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(PRODUCTS_SERVICE) private readonly productClient: ClientProxy,
  ) {
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
        this.productClient.send({ cmd: 'validateProduct' }, { ids }),
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
      this.productClient.send({ cmd: 'validateProduct' }, { ids: productIds }),
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
}
