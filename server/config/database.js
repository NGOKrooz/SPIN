const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);

    console.log('✅ MongoDB Connected');

    // Log existing collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📊 Existing collections:', collections.map(c => c.name));
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
