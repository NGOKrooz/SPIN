const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not set. Expected format: mongodb+srv://<username>:<password>@cluster.mongodb.net/spin?retryWrites=true&w=majority');
    }

    console.log('📌 Attempting MongoDB connection...');
    console.log('🔗 Connecting to MongoDB Atlas...');
    
    await mongoose.connect(mongoUri, {
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB Connected Successfully');
    console.log(`📊 Connected to database: ${mongoose.connection.name}`);

    // Log existing collections
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      console.log(`📦 Database collections (${collectionNames.length}):`, collectionNames.join(', ') || 'No collections yet');
      
      // Verify interns collection exists or will be created
      if (collectionNames.includes('interns')) {
        console.log('✅ "interns" collection found');
      } else {
        console.log('⚠️  "interns" collection not yet created (will be created on first insert)');
      }
    } catch (collectionError) {
      console.warn('⚠️  Could not list collections:', collectionError.message);
    }
  } catch (error) {
    console.error('\n═════════════════════════════════════════════════════════');
    console.error('❌ MongoDB Connection Failed');
    console.error('═════════════════════════════════════════════════════════');
    console.error('\nError Details:');
    console.error(`  Message: ${error.message}`);
    if (error.reason) console.error(`  Reason: ${error.reason}`);
    if (error.code) console.error(`  Code: ${error.code}`);
    console.error('\nExpected MongoDB URI Format:');
    console.error('  mongodb+srv://<username>:<password>@cluster.mongodb.net/spin?retryWrites=true&w=majority');
    console.error('\nHow to fix:');
    console.error('  1. Set MONGO_URI environment variable');
    console.error('  2. Verify MongoDB Atlas cluster is running');
    console.error('  3. Check network access in MongoDB Atlas Dashboard');
    console.error('  4. Verify credentials are correct');
    console.error('═════════════════════════════════════════════════════════\n');
    process.exit(1);
  }
};

module.exports = connectDB;
