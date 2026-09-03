import { connect, disconnect } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';

// Load environment variables
config();

interface AdminUser {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  role: string;
  status: string;
  authType: string[];
  dateOfBirth: Date;
  gender: string;
}

async function createAdmin() {
  try {
    const mongoUri =
      process.env.DB_URL || 'mongodb://localhost:27017/matchmadeinjannah';

    console.log('Connecting to MongoDB...');
    await connect(mongoUri);
    console.log('Connected to MongoDB');

    // Import User model dynamically after connection
    const { model, Schema } = await import('mongoose');

    // Define a minimal schema for admin creation
    const userSchema = new Schema({}, { strict: false });
    const User = model('User', userSchema);

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      email: 'admin@matchmadeinjannah.com',
    });

    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Email: admin@matchmadeinjannah.com');
      await disconnect();
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    // Create admin user
    const adminUser: AdminUser = {
      email: 'admin@matchmadeinjannah.com',
      username: 'admin',
      firstName: 'Super',
      lastName: 'Admin',
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
      authType: ['LOCAL'],
      dateOfBirth: new Date('1990-01-01'),
      gender: 'Male',
    };

    await User.create(adminUser);

    console.log('\n✅ Admin user created successfully!');
    console.log('==================================');
    console.log('Email: admin@matchmadeinjannah.com');
    console.log('Password: Admin@123');
    console.log('==================================');
    console.log(
      '\n⚠️  IMPORTANT: Please change this password after first login!\n',
    );

    await disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    await disconnect();
    process.exit(1);
  }
}

createAdmin();
