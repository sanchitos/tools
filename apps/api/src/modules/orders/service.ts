import type { AdminOrderListItem, OrderDTO, Paginated } from '@tools-jamaica/shared';
import { db } from '../../lib/supabase.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { resolvePrice } from '../../lib/pricing.js';
import type { OrderItemRow, OrderRow, ProductRow } from '../../types/db.js';
import type { AdminOrderListParams, CreateOrderInput } from './schema.js';
import { toAdminOrderListItem, toOrderDTO } from './mappers.js';

interface ProductImageForOrder {
  url: string;
  is_primary: boolean;
  sort_order: number;
}

interface ProductForOrder extends ProductRow {
  images: ProductImageForOrder[] | null;
}

function fail(message: string, details?: unknown): never {
  throw AppError.Internal(message, details);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function primaryImageUrl(images: ProductImageForOrder[] | null): string | null {
  if (!images || images.length === 0) return null;
  const primary = images.find((i) => i.is_primary);
  if (primary) return primary.url;
  return [...images].sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
}

/**
 * Turns a validated checkout request into a persisted order. The server is the
 * sole pricing authority here: `input.items` carries only { productId, quantity
 * }, never a price, so there is nothing for a tampered request to smuggle —
 * every price is re-read from `products` and run through resolvePrice().
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderDTO> {
  // Dedupe by productId (a client could send the same product twice), summing
  // quantities so "add 2, then add 3 more" checks out as one line of 5.
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  const ids = [...quantities.keys()];

  const { data, error } = await db
    .from('products')
    .select('*, images:product_images ( url, is_primary, sort_order )')
    .in('id', ids);
  if (error) fail('Failed to load products for order', error.message);

  const products = data as unknown as ProductForOrder[];
  const byId = new Map(products.map((p) => [p.id, p]));

  const missing = ids.filter((id) => !byId.has(id) || byId.get(id)!.is_published === false);
  if (missing.length > 0) {
    throw AppError.BadRequest('Some items in your order are no longer available', {
      productIds: missing,
    });
  }

  const outOfStock = ids.filter((id) => byId.get(id)!.stock <= 0);
  if (outOfStock.length > 0) {
    throw AppError.Conflict('Some items in your order are out of stock', {
      productIds: outOfStock,
    });
  }

  const lines = ids.map((id) => {
    const product = byId.get(id)!;
    const quantity = quantities.get(id)!;
    const unitPrice = resolvePrice(product);
    return {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      product_slug: product.slug,
      image_url: primaryImageUrl(product.images),
      unit_price: unitPrice,
      quantity,
      line_total: round2(unitPrice * quantity),
    };
  });
  const subtotal = round2(lines.reduce((sum, l) => sum + l.line_total, 0));

  const { data: orderRow, error: orderErr } = await db
    .from('orders')
    .insert({
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_email: input.customerEmail ?? null,
      fulfillment: input.fulfillment,
      delivery_address: input.deliveryAddress ?? null,
      notes: input.notes ?? null,
      subtotal,
    })
    .select('*')
    .single();
  if (orderErr) fail('Failed to create order', orderErr.message);

  const order = orderRow as OrderRow;

  const { data: itemRows, error: itemsErr } = await db
    .from('order_items')
    .insert(lines.map((l) => ({ ...l, order_id: order.id })))
    .select('*');

  if (itemsErr) {
    // No cross-table transaction in supabase-js: don't leave a headless order
    // (one with no items) behind if the items insert fails.
    await db.from('orders').delete().eq('id', order.id);
    fail('Failed to create order items', itemsErr.message);
  }

  logger.info(
    { orderNumber: order.order_number, subtotal, itemCount: lines.length },
    'order created',
  );

  return toOrderDTO(order, itemRows as OrderItemRow[]);
}

export async function getAdminOrder(id: string): Promise<OrderDTO> {
  const { data: order, error } = await db.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) fail('Failed to load order', error.message);
  if (!order) throw AppError.NotFound('Order not found');

  const { data: items, error: itemsErr } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true });
  if (itemsErr) fail('Failed to load order items', itemsErr.message);

  return toOrderDTO(order as OrderRow, items as OrderItemRow[]);
}

export async function listAdminOrders(
  params: AdminOrderListParams,
): Promise<Paginated<AdminOrderListItem>> {
  let query = db.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false });

  if (params.status) query = query.eq('status', params.status);
  if (params.q) {
    const term = `%${params.q}%`;
    query = query.or(
      `order_number.ilike.${term},customer_name.ilike.${term},customer_phone.ilike.${term}`,
    );
  }

  const from = (params.page - 1) * params.pageSize;
  query = query.range(from, from + params.pageSize - 1);

  const { data, error, count } = await query;
  if (error) fail('Failed to list orders', error.message);

  const orders = data as OrderRow[];
  const orderIds = orders.map((o) => o.id);

  const tally = new Map<string, number>();
  if (orderIds.length > 0) {
    const { data: items, error: itemsErr } = await db
      .from('order_items')
      .select('order_id')
      .in('order_id', orderIds);
    if (itemsErr) fail('Failed to count order items', itemsErr.message);
    for (const row of items ?? []) {
      const orderId = (row as { order_id: string }).order_id;
      tally.set(orderId, (tally.get(orderId) ?? 0) + 1);
    }
  }

  return {
    items: orders.map((o) => toAdminOrderListItem(o, tally.get(o.id) ?? 0)),
    total: count ?? orders.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function updateOrderStatus(
  id: string,
  status: OrderRow['status'],
): Promise<OrderDTO> {
  const { data: order, error } = await db
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) fail('Failed to update order', error.message);
  if (!order) throw AppError.NotFound('Order not found');

  const { data: items, error: itemsErr } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true });
  if (itemsErr) fail('Failed to load order items', itemsErr.message);

  return toOrderDTO(order as OrderRow, items as OrderItemRow[]);
}
