import { z } from 'zod';

/**
 * POST /orders body. Deliberately has NO price/subtotal fields — the server
 * re-reads each product and prices the order itself (see service.ts). Even if
 * a client sends extra `price`/`subtotal` keys, zod's default strip-unknown
 * behavior drops them before they ever reach the service.
 */
export const createOrderSchema = z
  .object({
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z
      .string()
      .trim()
      .min(7)
      .max(20)
      .regex(/^[\d\s+()-]+$/, 'Enter a valid phone number'),
    customerEmail: z.string().trim().email().optional(),
    fulfillment: z.enum(['pickup', 'delivery']),
    deliveryAddress: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().min(1).max(999),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((val, ctx) => {
    if (val.fulfillment === 'delivery' && !val.deliveryAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryAddress'],
        message: 'Delivery address is required for delivery orders',
      });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const adminOrderListQuerySchema = z.object({
  status: z.enum(['new', 'confirmed', 'fulfilled', 'cancelled']).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type AdminOrderListParams = z.infer<typeof adminOrderListQuerySchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(['new', 'confirmed', 'fulfilled', 'cancelled']),
});
