import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PackagesService } from '../src/packages/packages.service';
import { EmployerService } from '../src/employers/employers.service';
import { UsersService } from '../src/users/users.service';
import { Model, Types } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Package } from '../src/packages/schemas/package.schema';
import { EmployerCredit } from '../src/packages/schemas/employer-credit.schema';
import { CreditTransaction } from '../src/packages/schemas/credit-transaction.schema';
import { EmployerProfile } from '../src/employers/schemas/employer-profile.schema';
import { User } from '../src/users/schemas/user.schema';
import { Job, JobStatus } from '../src/jobs/schemas/job.schema';
const request = require('supertest');
import { AuthService } from '../src/auth/auth.service';

async function bootstrap() {
  console.log('Initializing test environment...');
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn', 'debug', 'verbose'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api'); // NEEDED BECAUSE IT'S IN MAIN.TS
  await app.init();

  const server = app.getHttpServer();
  
  // Get models
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const employerProfileModel = app.get<Model<EmployerProfile>>(getModelToken(EmployerProfile.name));
  const packageModel = app.get<Model<Package>>(getModelToken(Package.name));
  const employerCreditModel = app.get<Model<EmployerCredit>>(getModelToken(EmployerCredit.name));
  const creditTransactionModel = app.get<Model<CreditTransaction>>(getModelToken(CreditTransaction.name));
  const jobModel = app.get<Model<Job>>(getModelToken(Job.name));
  
  const jwtService = app.get(require('@nestjs/jwt').JwtService);
  const packagesService = app.get(PackagesService);

  // Results array
  const results = [];

  try {
    // 1. Clean DB
    await userModel.deleteMany({ email: 'test.credit@example.com' });
    await packageModel.deleteMany({ name: { $in: ['Basic Test', 'Standard Test'] } });

    // 2. Seed Data
    const user = await userModel.create({
      email: 'test.credit@example.com',
      password: 'hashed_password123',
      fullName: 'Test Employer',
      role: 'EMPLOYER',
      isEmailVerified: true,
      status: 'active'
    });

    const employerProfile = await employerProfileModel.create({
      userId: user._id,
      companyName: 'Test Corp',
      status: 'APPROVED',
      credit: 0
    });

    const basicPkg = await packageModel.create({
      name: 'Basic Test',
      price: 100000,
      credits: 100,
      durationDays: 30,
      isActive: true
    });

    const standardPkg = await packageModel.create({
      name: 'Standard Test',
      price: 500000,
      credits: 550,
      durationDays: 60,
      isActive: true
    });

    const job = await jobModel.create({
      employerId: employerProfile._id,
      title: 'Test Job',
      description: 'Test Job Description',
      status: JobStatus.ACTIVE,
      salaryAmount: 1000,
      salaryType: 'hourly',
      salary: { min: 1000, max: 2000, isNegotiable: false },
      requirements: ['req'],
      benefits: ['ben'],
      location: 'City, Addr',
      workingTimeText: 'Full-time',
      industry: 'IT',
      jobType: 'Part-time',
      level: 'No Experience',
      companyName: 'Test Corp'
    });

    // Create a dummy token for the user
    const payload = { sub: user._id.toString(), id: user._id.toString(), email: user.email, role: user.role };
    const accessToken = jwtService.sign(payload);

    console.log('\n[Bước 1] Khởi tạo dữ liệu người dùng và các gói dịch vụ Basic/Standard...');
    console.log(`[Bước 2] Tiến hành nạp điểm (Purchase) gói Basic (100) và Standard (550)...`);
    // ==========================================
    // TEST CASE 1: Purchase Basic & Standard
    // ==========================================
    await packagesService.purchasePackage(user._id.toString(), basicPkg._id.toString());
    await packagesService.purchasePackage(user._id.toString(), standardPkg._id.toString());

    console.log('[Bước 3] Gọi API GET /api/payments/balance để kiểm tra số dư ban đầu...');
    // Call GET /payments/balance via API
    let res = await request(server)
      .get('/api/payments/balance')
      .set('Authorization', `Bearer ${accessToken}`);
    
    if (res.status === 200 && res.body.data.available === 650) {
      console.log('   -> Thành công: Số dư hiện tại là 650 points');
      results.push({ Method: 'GET', Endpoint: '/payments/balance', Status: '✅ PASS (Purchased 650 points)' });
    } else {
      console.log(`   -> Thất bại: Số dư sai lệch, kết quả trả về ${res.body?.data?.available}`);
      results.push({ Method: 'GET', Endpoint: '/payments/balance', Status: `❌ FAIL (Expected 650, got ${res.body?.data?.available})` });
    }

    console.log('\n[Bước 4] Gọi API POST /api/employers/jobs/:id/refresh để tiến hành Refresh Job trừ điểm (Dự kiến -5 điểm FIFO)...');
    // ==========================================
    // TEST CASE 2: Refresh Job Deducts 5 Points
    // ==========================================
    res = await request(server)
      .post(`/api/employers/jobs/${job._id.toString()}/refresh`)
      .set('Authorization', `Bearer ${accessToken}`);

    if (res.status === 201) {
      // Check if deducted from basicPkg (FIFO)
      const creditsRecord = await employerCreditModel.findOne({ userId: user._id });
      const basicRecord = creditsRecord?.purchasedPackages.find(p => p.name === 'Basic Test');
      
      if (basicRecord && basicRecord.remainingCredits === 95) {
        console.log('   -> Thành công: Đã tự động trừ 5 điểm vào gói Basic (còn 95 điểm) nhờ thuật toán FIFO');
        results.push({ Method: 'POST', Endpoint: `/employers/jobs/:id/refresh`, Status: '✅ PASS (FIFO deducted 5 points from Basic)' });
      } else {
        console.log(`   -> Thất bại: Trừ sai gói, gói Basic hiện còn ${basicRecord?.remainingCredits}`);
        results.push({ Method: 'POST', Endpoint: `/employers/jobs/:id/refresh`, Status: `❌ FAIL (FIFO error, Basic has ${basicRecord?.remainingCredits})` });
      }
    } else {
      console.log(`   -> Thất bại: HTTP Error ${res.status}`);
      results.push({ Method: 'POST', Endpoint: `/employers/jobs/:id/refresh`, Status: `❌ FAIL (HTTP ${res.status}: ${JSON.stringify(res.body)})` });
    }

    console.log('\n[Bước 5] Kích hoạt LAZY EVALUATION: Giả lập chỉnh sửa DB thời gian hết hạn của gói Basic lùi về quá khứ...');
    // ==========================================
    // TEST CASE 3: Lazy Evaluation (Expire Basic)
    // ==========================================
    // Mock the expiry time of the basic package to the past
    await employerCreditModel.updateOne(
      { userId: user._id, "purchasedPackages.name": "Basic Test" },
      { $set: { "purchasedPackages.$.expiresAt": new Date(Date.now() - 1000) } } // Expired 1 second ago
    );

    console.log('[Bước 6] Gọi lại API GET /api/payments/balance để kiểm tra việc dọn dẹp số điểm quá hạn...');
    // Get balance via API to trigger lazy evaluation
    res = await request(server)
      .get('/api/payments/balance')
      .set('Authorization', `Bearer ${accessToken}`);

    if (res.status === 200 && res.body.data.available === 550) { // 550 left because 95 expired
      console.log('   -> Thành công: Cơ chế Lazy Evaluation tự động flush 95 điểm hết hạn, số dư khả dụng cập nhật thành 550');
      results.push({ Method: 'GET', Endpoint: '/payments/balance (Lazy)', Status: '✅ PASS (Lazy Evaluation removed 95 expired points)' });
    } else {
      console.log(`   -> Thất bại: Số dư khả dụng hiện tại là ${res.body?.data?.available}`);
      results.push({ Method: 'GET', Endpoint: '/payments/balance (Lazy)', Status: `❌ FAIL (Expected 550, got ${res.body?.data?.available})` });
    }

  } catch (error) {
    console.error('Test Execution Error:', error);
  } finally {
    // Clean up
    await userModel.deleteMany({ email: 'test.credit@example.com' });
    await packageModel.deleteMany({ name: { $in: ['Basic Test', 'Standard Test'] } });
    await employerProfileModel.deleteMany({ companyName: 'Test Corp' });
    
    await app.close();

    console.log('\n=============================================');
    console.log('            TEST RESULTS REPORT              ');
    console.log('=============================================');
    console.table(results);
    
    const hasFail = results.some(r => r.Status.includes('❌ FAIL'));
    if (hasFail) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

bootstrap();
