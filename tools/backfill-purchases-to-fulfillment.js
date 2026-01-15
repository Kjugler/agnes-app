#!/usr/bin/env node
/**
 * Backfill script: Link existing paperback purchases to Customer + Fulfillment
 * 
 * For each Purchase where product="paperback" and customerId is null:
 * 1. Fetch Stripe session by stripeSessionId
 * 2. Extract shipping/customer details
 * 3. Upsert Customer by email
 * 4. Update Purchase.customerId + paymentIntentId
 * 5. Ensure Fulfillment exists (status PENDING)
 */

const path = require('path');
const fs = require('fs');

// ===== STARTUP BANNER =====
console.log('='.repeat(80));
console.log('BACKFILL: Purchases → Customer + Fulfillment');
console.log('='.repeat(80));
console.log();

// Resolve paths
const repoRoot = path.resolve(__dirname, '..');
const deepquillRoot = path.resolve(repoRoot, 'deepquill');
const dbPath = path.join(deepquillRoot, 'dev.db');
const datasourceUrl = 'file:' + dbPath.replace(/\\/g, '/');

// Print startup information
console.log('[BACKFILL] Startup Information:');
console.log(`  Script directory (__dirname): ${__dirname}`);
console.log(`  Script file: ${__filename}`);
console.log(`  Current working directory: ${process.cwd()}`);
console.log(`  Repo root: ${repoRoot}`);
console.log(`  Deepquill root: ${deepquillRoot}`);
console.log(`  Database path: ${dbPath}`);
console.log(`  Datasource URL: ${datasourceUrl}`);
console.log(`  Database file exists: ${fs.existsSync(dbPath)}`);
console.log();

// Step 1: Load dotenv from deepquill's node_modules
console.log('[BACKFILL] Loading environment variables...');
try {
  const dotenvPath = path.join(deepquillRoot, 'node_modules', 'dotenv');
  if (fs.existsSync(dotenvPath)) {
    const dotenv = require(dotenvPath);
    dotenv.config({ path: path.join(deepquillRoot, '.env') });
    dotenv.config({ path: path.join(deepquillRoot, '.env.local'), override: true });
    console.log('  ✅ dotenv loaded from:', dotenvPath);
  } else {
    console.log('  ⚠️  dotenv not found in deepquill/node_modules, skipping .env load');
  }
} catch (dotenvErr) {
  console.log('  ⚠️  Could not load dotenv, continuing without it:', dotenvErr.message);
}

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = datasourceUrl;
}
console.log(`  DATABASE_URL: ${process.env.DATABASE_URL}`);
console.log();

// Change to deepquill directory so relative requires work
process.chdir(deepquillRoot);
console.log(`[BACKFILL] Changed working directory to: ${process.cwd()}`);
console.log();

// Step 2: Load Prisma client from deepquill (using absolute path)
console.log('[BACKFILL] Loading Prisma client...');
const prismaModulePath = path.join(deepquillRoot, 'server', 'prisma.cjs');
if (!fs.existsSync(prismaModulePath)) {
  throw new Error(`Prisma module not found at: ${prismaModulePath}`);
}
console.log(`  Importing from: ${prismaModulePath}`);
const { prisma, ensureDatabaseUrl } = require(prismaModulePath);
console.log('  ✅ Prisma client loaded');
console.log();

// Step 3: Load Stripe client
console.log('[BACKFILL] Loading Stripe client...');
const stripeModulePath = path.join(deepquillRoot, 'src', 'lib', 'stripe.cjs');
if (!fs.existsSync(stripeModulePath)) {
  throw new Error(`Stripe module not found at: ${stripeModulePath}`);
}
console.log(`  Importing from: ${stripeModulePath}`);
const { stripe } = require(stripeModulePath);
console.log('  ✅ Stripe client loaded');
console.log();

async function backfillPurchases() {
  ensureDatabaseUrl();

  try {
    // Find all paperback purchases without customerId
    const purchases = await prisma.purchase.findMany({
      where: {
        product: 'paperback',
        customerId: null,
      },
      take: 100, // Limit to avoid too many Stripe API calls
    });

    console.log(`Found ${purchases.length} paperback purchases without customerId`);
    console.log();

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let customersUpserted = 0;
    let fulfillmentsCreated = 0;
    let purchasesUpdated = 0;

    for (const purchase of purchases) {
      try {
        console.log(`Processing purchase ${purchase.id} (session: ${purchase.stripeSessionId})`);

        // Fetch Stripe session
        // Note: shipping_details cannot be expanded, it's already included
        const session = await stripe.checkout.sessions.retrieve(purchase.stripeSessionId, {
          expand: ['customer_details', 'payment_intent'],
        });

        // Extract shipping/contact details
        const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
        const cust = session.customer_details ?? null;
        const email = cust?.email ?? session.customer_email ?? session.metadata?.contest_email ?? null;
        const name = ship?.name ?? cust?.name ?? null;
        const phone = cust?.phone ?? null;
        const addr = ship?.address ?? cust?.address ?? null;

        if (!email) {
          console.log(`  ⚠️  No email found, skipping`);
          skipped++;
          continue;
        }

        // Upsert Customer
        const customerData = {
          email: email,
          name: name ?? null,
          phone: phone ?? null,
          shippingStreet: addr?.line1 ?? null,
          shippingCity: addr?.city ?? null,
          shippingState: addr?.state ?? null,
          shippingPostalCode: addr?.postal_code ?? null,
          shippingCountry: addr?.country ?? null,
        };

        const customer = await prisma.customer.upsert({
          where: { email: email },
          update: customerData,
          create: customerData,
        });

        const wasNewCustomer = customer.createdAt.getTime() > Date.now() - 60000; // Created in last minute
        if (wasNewCustomer) {
          customersUpserted++;
        }

        console.log(`  ✅ Customer upserted: ${customer.email}${wasNewCustomer ? ' (NEW)' : ' (EXISTING)'}`);

        // Update Purchase
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null;

        await prisma.purchase.update({
          where: { id: purchase.id },
          data: {
            customerId: customer.id,
            paymentIntentId: paymentIntentId || undefined,
          },
        });

        purchasesUpdated++;
        console.log(`  ✅ Purchase updated with customerId and paymentIntentId`);

        // Ensure Fulfillment exists
        const fulfillmentResult = await prisma.fulfillment.upsert({
          where: { purchaseId: purchase.id },
          create: {
            purchaseId: purchase.id,
            status: 'PENDING',
          },
          update: {}, // Don't change existing fulfillment
        });

        const wasNewFulfillment = fulfillmentResult.createdAt.getTime() > Date.now() - 60000; // Created in last minute
        if (wasNewFulfillment) {
          fulfillmentsCreated++;
        }

        console.log(`  ✅ Fulfillment ensured (PENDING)${wasNewFulfillment ? ' (NEW)' : ' (EXISTING)'}`);
        console.log();

        processed++;
      } catch (err) {
        console.error(`  ❌ Error processing purchase ${purchase.id}:`, err.message);
        errors++;
      }
    }

    // ===== SUMMARY BANNER =====
    console.log('='.repeat(80));
    console.log('BACKFILL COMPLETE');
    console.log('='.repeat(80));
    console.log(`Purchases scanned: ${purchases.length}`);
    console.log(`Purchases updated (customerId linked): ${purchasesUpdated}`);
    console.log(`Purchases processed successfully: ${processed}`);
    console.log(`Purchases skipped (no email): ${skipped}`);
    console.log(`Customers upserted: ${customersUpserted} new, ${processed - customersUpserted} existing`);
    console.log(`Fulfillments ensured: ${fulfillmentsCreated} new, ${processed - fulfillmentsCreated} existing`);
    console.log(`Errors: ${errors}`);
    console.log('='.repeat(80));
    console.log();
    
    // Return success status
    return { success: errors === 0, processed, skipped, errors };

  } catch (err) {
    console.error('[BACKFILL] Fatal error:', err);
    console.error(err.stack);
    return { success: false, processed: 0, skipped: 0, errors: 1 };
  } finally {
    await prisma.$disconnect().catch(() => {
      // Ignore disconnect errors
    });
  }
}

// Run if called directly
if (require.main === module) {
  backfillPurchases()
    .then((result) => {
      if (result && result.success) {
        console.log('[BACKFILL] ✅ Script completed successfully');
        process.exit(0);
      } else {
        console.log('[BACKFILL] ❌ Script completed with errors');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('[BACKFILL] ❌ Unhandled error:', err);
      console.error(err.stack);
      process.exit(1);
    });
}

module.exports = { backfillPurchases };

