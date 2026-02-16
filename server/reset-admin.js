import bcrypt from 'bcrypt';
import { pool } from './db.js';
import { createUser } from './auth.js';

async function resetAdmin() {
  try {
    console.log('🗑️  Deleting all users and related data...');
    
    // Delete all user sessions first (foreign key constraint)
    await pool.query('DELETE FROM user_sessions');
    console.log('✅ Deleted all user sessions');
    
    // Delete all subscriptions (foreign key constraint)
    await pool.query('DELETE FROM subscriptions');
    console.log('✅ Deleted all subscriptions');
    
    // Delete all users
    await pool.query('DELETE FROM users');
    console.log('✅ Deleted all users');
    
    // Create new admin user
    const adminEmail = 'admin@interviewprepper.com';
    const adminPassword = 'admin123';
    const adminName = 'Admin User';
    
    console.log(`\n👤 Creating admin user...`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    
    const adminUser = await createUser(adminEmail, adminName, adminPassword);
    
    console.log(`\n✅ Admin user created successfully!`);
    console.log(`\n📧 Login Credentials:`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting admin:', error);
    process.exit(1);
  }
}

resetAdmin();


