import { PERMISSIONS, getCurrentUserWithPermission } from '@/core/rbac';
import { respData, respErr } from '@/shared/lib/resp';
import { findOrderByOrderNo } from '@/shared/models/order';
import { getPaymentService } from '@/shared/services/payment';
import { refundOrderWithProvider } from '@/shared/services/payment-lifecycle';

export async function POST(req: Request) {
  try {
    const adminUser = await getCurrentUserWithPermission({
      code: PERMISSIONS.PAYMENTS_WRITE,
    });
    if (!adminUser) {
      return Response.json({ message: 'permission denied' }, { status: 403 });
    }

    const { orderNo, reason } = await req.json();
    if (!orderNo) {
      return respErr('orderNo is required');
    }

    const order = await findOrderByOrderNo(orderNo);
    if (!order) {
      return respErr('order not found');
    }

    if (!order.paymentProvider) {
      return respErr('order has no payment provider');
    }

    const paymentService = await getPaymentService();
    const provider = paymentService.getProvider(order.paymentProvider);
    if (!provider || provider.name !== order.paymentProvider) {
      return respErr('payment provider not configured');
    }

    const result = await refundOrderWithProvider({
      order,
      provider,
      reason,
      actorUserId: adminUser.id,
    });

    return respData({
      refunded: true,
      reversed: result.reversed,
      orderNo: order.orderNo,
    });
  } catch (error: UnsafeAny) {
    console.error('admin refund failed:', error);
    return respErr(error.message || 'admin refund failed');
  }
}
