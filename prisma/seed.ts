import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Remove deprecated plans
  console.log('🗑️  Removing deprecated plans...');
  const deprecatedPlanCodes = ['lifetime', 'pro_yearly'];
  for (const code of deprecatedPlanCodes) {
    const deleted = await prisma.plan.deleteMany({
      where: { code },
    });
    if (deleted.count > 0) {
      console.log(`  ✓ Removed plan: ${code}`);
    }
  }

  // Seed Plans - UPSERT by code to ensure exact match
  console.log('📦 Creating/updating plans...');
  const plans = [
    {
      code: 'starter_monthly',
      name: 'Starter',
      description: 'Basic plan for individual users',
      priceUsd: 10.99,
      durationDays: 30,
      maxRequestsPerDay: 50,
    },
    {
      code: 'pro_monthly',
      name: 'Pro',
      description: 'Professional plan with higher limits',
      priceUsd: 19.99,
      durationDays: 30,
      maxRequestsPerDay: 125,
    },
    {
      code: 'max_monthly',
      name: 'Max',
      description: 'Maximum plan with highest limits',
      priceUsd: 39.99,
      durationDays: 30,
      maxRequestsPerDay: 250,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
    console.log(`  ✓ Created/updated plan: ${plan.code} ($${plan.priceUsd})`);
  }

  // Seed Payment Methods
  console.log('💳 Creating payment methods...');
  const paymentMethods = [
    // USDT
    { tokenSymbol: 'USDT', network: 'TRC20' },
    { tokenSymbol: 'USDT', network: 'ERC20' },
    { tokenSymbol: 'USDT', network: 'BEP20' },
    { tokenSymbol: 'USDT', network: 'POLYGON' },
    { tokenSymbol: 'USDT', network: 'AVALANCHE' },
    // USDC
    { tokenSymbol: 'USDC', network: 'ERC20' },
    { tokenSymbol: 'USDC', network: 'TRC20' },
    { tokenSymbol: 'USDC', network: 'BEP20' },
    { tokenSymbol: 'USDC', network: 'POLYGON' },
    { tokenSymbol: 'USDC', network: 'AVALANCHE' },
    // L1 Coins
    { tokenSymbol: 'SOL', network: 'SOLANA' },
    { tokenSymbol: 'BTC', network: 'BITCOIN' },
    { tokenSymbol: 'ETH', network: 'ETHEREUM' },
    { tokenSymbol: 'BNB', network: 'BSC' },
    { tokenSymbol: 'MATIC', network: 'POLYGON' },
    { tokenSymbol: 'AVAX', network: 'AVALANCHE' },
  ];

  // Use createMany with skipDuplicates to avoid duplicates
  await prisma.paymentMethod.createMany({
    data: paymentMethods,
    //skipDuplicates: true,
  });

  console.log(`  ✓ Created ${paymentMethods.length} payment methods`);

  console.log('✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

