import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Plans
  console.log('📦 Creating plans...');
  const plans = [
    {
      code: 'starter_monthly',
      name: 'Starter Monthly',
      description: 'Basic plan for individual users',
      priceUsd: 19.99,
      durationDays: 30,
      maxRequestsPerDay: 1000,
    },
    {
      code: 'pro_monthly',
      name: 'Pro Monthly',
      description: 'Professional plan with higher limits',
      priceUsd: 39.99,
      durationDays: 30,
      maxRequestsPerDay: 5000,
    },
    {
      code: 'pro_yearly',
      name: 'Pro Yearly',
      description: 'Professional plan - annual subscription',
      priceUsd: 399.99,
      durationDays: 365,
      maxRequestsPerDay: 5000,
    },
    {
      code: 'lifetime',
      name: 'Lifetime',
      description: 'One-time payment for lifetime access',
      priceUsd: 999.99,
      durationDays: null, // null = lifetime
      maxRequestsPerDay: null, // null = unlimited
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
    console.log(`  ✓ Created/updated plan: ${plan.code}`);
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

