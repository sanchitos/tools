import type { AdminOrderListItem, OrderDTO, OrderItemDTO } from '@tools-jamaica/shared';
import type { OrderItemRow, OrderRow } from '../../types/db.js';

export function toOrderItemDTO(row: OrderItemRow): OrderItemDTO {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    productSlug: row.product_slug,
    imageUrl: row.image_url,
    unitPrice: Number(row.unit_price),
    quantity: row.quantity,
    lineTotal: Number(row.line_total),
  };
}

export function toOrderDTO(row: OrderRow, items: OrderItemRow[]): OrderDTO {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    fulfillment: row.fulfillment,
    deliveryAddress: row.delivery_address,
    notes: row.notes,
    subtotal: Number(row.subtotal),
    currency: row.currency,
    status: row.status,
    items: items.map(toOrderItemDTO),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lightweight row for the admin list — itemCount instead of full line items.
 * `userId` is exposed here and NOT on OrderDTO: the public checkout response
 * and a shopper's own history have no use for it.
 */
export function toAdminOrderListItem(row: OrderRow, itemCount: number): AdminOrderListItem {
  return {
    id: row.id,
    userId: row.user_id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    itemCount,
    subtotal: Number(row.subtotal),
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  };
}
