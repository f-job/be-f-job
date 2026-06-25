/**
 * Migration Script: Add identityVerificationRequired field
 * 
 * Purpose: Add the new identityVerificationRequired field to existing users
 * 
 * Rules:
 * - NEW users (registered after this update): identityVerificationRequired = true (default)
 * - EXISTING users (before this update): identityVerificationRequired = false (don't block them)
 * - ADMIN users: identityVerificationRequired = false (admins don't need CCCD verification)
 * 
 * Run this ONCE before deploying the new version.
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/f-job';

async function migrate() {
  console.log('🚀 Starting migration: Add identityVerificationRequired field');
  console.log('📍 MongoDB URI:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();
    const usersCollection = db.collection('users');

    // Count total users
    const totalUsers = await usersCollection.countDocuments();
    console.log(`📊 Total users in database: ${totalUsers}`);

    // ═══ STEP 1: Update existing users without the field ═══
    console.log('\n📝 Step 1: Updating existing users...');
    
    const result = await usersCollection.updateMany(
      { identityVerificationRequired: { $exists: false } },
      { $set: { identityVerificationRequired: false } }
    );

    console.log(`✅ Updated ${result.modifiedCount} existing users`);
    console.log(`   - Set identityVerificationRequired = false (don't block existing users)`);

    // ═══ STEP 2: Ensure ADMINs don't need verification ═══
    console.log('\n📝 Step 2: Ensuring ADMIN users are not blocked...');
    
    const adminResult = await usersCollection.updateMany(
      { role: 'ADMIN' },
      { $set: { identityVerificationRequired: false } }
    );

    console.log(`✅ Updated ${adminResult.modifiedCount} ADMIN users`);
    console.log(`   - ADMINs don't need CCCD verification`);

    // ═══ STEP 3: Create index for duplicate CCCD check ═══
    console.log('\n📝 Step 3: Creating index for duplicate CCCD check...');
    
    try {
      await usersCollection.createIndex(
        { 'identityVerification.idNumber': 1 },
        { 
          sparse: true,
          name: 'identity_verification_id_number',
          partialFilterExpression: { 
            'identityVerification.idNumber': { $exists: true, $ne: null } 
          }
        }
      );
      console.log('✅ Index created successfully');
    } catch (err) {
      if (err.code === 85 || err.codeName === 'IndexOptionsConflict') {
        console.log('⚠️  Index already exists, skipping...');
      } else {
        throw err;
      }
    }

    // ═══ STEP 4: Show statistics ═══
    console.log('\n📊 Migration Statistics:');
    
    const stats = await usersCollection.aggregate([
      {
        $group: {
          _id: '$identityVerificationRequired',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    stats.forEach(stat => {
      const label = stat._id === true ? 'Need verification' : 'No verification needed';
      console.log(`   - ${label}: ${stat.count} users`);
    });

    const verifiedUsers = await usersCollection.countDocuments({
      'identityVerification.isVerified': true
    });
    console.log(`   - Already verified: ${verifiedUsers} users`);

    // ═══ STEP 5: Show new users behavior ═══
    console.log('\n📋 Future Behavior (after deployment):');
    console.log('   ✅ NEW users: identityVerificationRequired = true (must verify before login)');
    console.log('   ✅ Existing users: identityVerificationRequired = false (can login as usual)');
    console.log('   ✅ Duplicate CCCD: Detected and blocked');
    console.log('   ✅ 1 CCCD = 1 account enforced');

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n🎉 Done! You can now deploy the new version.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration error:', error);
    process.exit(1);
  });
