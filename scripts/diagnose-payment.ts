/**
 * Payment Diagnosis Script
 *
 * This script helps diagnose payment and credit issues by:
 * 1. Checking recent PAID orders
 * 2. Verifying userId associations
 * 3. Checking corresponding credit records
 * 4. Validating user existence
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { order, credit, user } from '@/config/db/schema';
import { OrderStatus } from '@/shared/models/order';

type CreditRecord = Pick<
  typeof credit.$inferSelect,
  'transactionNo' | 'credits' | 'remainingCredits' | 'status' | 'orderNo'
>;

async function main() {
  console.log('='.repeat(80));
  console.log('PAYMENT DIAGNOSIS REPORT');
  console.log('='.repeat(80));
  console.log('');

  // Get recent PAID orders
  console.log('📋 Checking recent PAID orders...\n');

  const paidOrders = await db()
    .select({
      orderNo: order.orderNo,
      userId: order.userId,
      userEmail: order.userEmail,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      creditsAmount: order.creditsAmount,
      paymentType: order.paymentType,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
    })
    .from(order)
    .where(eq(order.status, OrderStatus.PAID))
    .orderBy(desc(order.createdAt))
    .limit(10);

  if (paidOrders.length === 0) {
    console.log('⚠️  No PAID orders found in database\n');
  } else {
    console.log(`✓ Found ${paidOrders.length} PAID orders\n`);

    for (const o of paidOrders) {
      console.log('-'.repeat(80));
      console.log(`Order No: ${o.orderNo}`);
      console.log(`User ID: ${o.userId || '❌ NULL/EMPTY'}`);
      console.log(`User Email: ${o.userEmail || '❌ NULL/EMPTY'}`);
      console.log(`Status: ${o.status}`);
      console.log(`Amount: ${o.amount} ${o.currency}`);
      console.log(`Credits Amount: ${o.creditsAmount || 0}`);
      console.log(`Payment Type: ${o.paymentType}`);
      console.log(`Created At: ${o.createdAt}`);
      console.log(`Paid At: ${o.paidAt || 'N/A'}`);

      // Check if userId exists
      if (o.userId) {
        const [userRecord] = await db()
          .select({ id: user.id, email: user.email, name: user.name })
          .from(user)
          .where(eq(user.id, o.userId));

        if (userRecord) {
          console.log(`✓ User exists: ${userRecord.name} (${userRecord.email})`);
        } else {
          console.log(`❌ User NOT found in database! userId=${o.userId}`);
        }
      } else {
        console.log(`❌ CRITICAL: Order has no userId!`);
      }

      // Check credit records
      if (o.userId) {
        const creditRecords: CreditRecord[] = await db()
          .select({
            transactionNo: credit.transactionNo,
            credits: credit.credits,
            remainingCredits: credit.remainingCredits,
            status: credit.status,
            orderNo: credit.orderNo,
          })
          .from(credit)
          .where(eq(credit.orderNo, o.orderNo));

        if (creditRecords.length > 0) {
          console.log(`✓ Found ${creditRecords.length} credit record(s):`);
          creditRecords.forEach((c) => {
            console.log(`  - Transaction: ${c.transactionNo}, Credits: ${c.credits}, Remaining: ${c.remainingCredits}, Status: ${c.status}`);
          });
        } else {
          if (o.creditsAmount && o.creditsAmount > 0) {
            console.log(`❌ CRITICAL: Order should have credits (${o.creditsAmount}) but no credit records found!`);
          } else {
            console.log(`  No credits expected for this order`);
          }
        }
      }
      console.log('');
    }
  }

  console.log('='.repeat(80));
  console.log('DIAGNOSIS COMPLETE');
  console.log('='.repeat(80));
  console.log('\nPossible Issues to Check:');
  console.log('1. If userId is NULL/EMPTY: The order was created without proper user authentication');
  console.log('2. If user NOT found: The user record was deleted or userId is incorrect');
  console.log('3. If credits missing: Check payment webhook logs for errors during credit creation');
  console.log('4. If user interface shows nothing: The logged-in user ID might not match order userId');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error running diagnosis:', e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
