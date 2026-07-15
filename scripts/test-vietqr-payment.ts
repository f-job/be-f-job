import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Package } from '../src/packages/schemas/package.schema';
import { EmployerCredit } from '../src/packages/schemas/employer-credit.schema';
import { CreditTransaction } from '../src/packages/schemas/credit-transaction.schema';
import { EmployerProfile } from '../src/employers/schemas/employer-profile.schema';
import { User } from '../src/users/schemas/user.schema';
import { Payment } from '../src/payments/schemas/payment.schema';
const request = require('supertest');

async function bootstrap() {
  console.log('Initializing test environment for VietQR Payment...');
  const app = await NestFactory.create(AppModule, { logger: false }); // turn off logger to avoid noise
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();

  const server = app.getHttpServer();
  
  // Get models
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const employerProfileModel = app.get<Model<EmployerProfile>>(getModelToken(EmployerProfile.name));
  const packageModel = app.get<Model<Package>>(getModelToken(Package.name));
  const employerCreditModel = app.get<Model<EmployerCredit>>(getModelToken(EmployerCredit.name));
  const creditTransactionModel = app.get<Model<CreditTransaction>>(getModelToken(CreditTransaction.name));
  const paymentModel = app.get<Model<Payment>>(getModelToken(Payment.name));
  
  const jwtService = app.get(require('@nestjs/jwt').JwtService);

  const results = [];
  const testEmail = 'test.vietqr@example.com';
  const testPkgName = 'VietQR Test Pkg';

  try {
    // 1. Clean DB
    await userModel.deleteMany({ email: testEmail });
    await packageModel.deleteMany({ name: testPkgName });
    const oldUsers = await userModel.find({ email: testEmail });
    const oldIds = oldUsers.map(u => u._id);
    await paymentModel.deleteMany({ userId: { $in: oldIds } });
    await employerCreditModel.deleteMany({ userId: { $in: oldIds } });

    // 2. Seed Data
    const user = await userModel.create({
      email: testEmail,
      password: 'hashed_password123',
      fullName: 'VietQR Employer',
      role: 'EMPLOYER',
      isEmailVerified: true,
      status: 'active'
    });

    await employerProfileModel.create({
      userId: user._id,
      companyName: 'VietQR Corp',
      status: 'APPROVED',
      credit: 0
    });

    const testPkg = await packageModel.create({
      name: testPkgName,
      price: 250000,
      credits: 300,
      durationDays: 30,
      isActive: true
    });

    const payload = { sub: user._id.toString(), id: user._id.toString(), email: user.email, role: user.role };
    const accessToken = jwtService.sign(payload);

    console.log('\n[Bước 1] Khởi tạo User và Gói dịch vụ (300 credits - 250,000 VND)');
    
    // ==========================================
    // TEST CASE 1: Create Payment
    // ==========================================
    console.log('[Bước 2] Tạo giao dịch thanh toán (POST /api/payments/create)...');
    let res = await request(server)
      .post('/api/payments/create')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ packageId: testPkg._id.toString() });

    let paymentId = '';
    let paymentCode = '';
    
    if (res.status === 201 && res.body.data && res.body.data.paymentCode && res.body.data.qrUrl) {
      paymentId = res.body.data.id;
      paymentCode = res.body.data.paymentCode;
      console.log(`   -> Thành công: Đã tạo mã thanh toán ${paymentCode}`);
      console.log(`   -> QR URL: ${res.body.data.qrUrl}`);
      results.push({ Method: 'POST', Endpoint: '/payments/create', Status: '✅ PASS' });
    } else {
      console.log(`   -> Thất bại: HTTP Error ${res.status}`);
      results.push({ Method: 'POST', Endpoint: '/payments/create', Status: `❌ FAIL` });
      throw new Error('Create payment failed');
    }

    // ==========================================
    // TEST CASE 2: Idempotency (Create duplicate payment)
    // ==========================================
    console.log('[Bước 3] Thử tạo lại giao dịch đang chờ (PENDING) xem có tái sử dụng (idempotent) không...');
    res = await request(server)
      .post('/api/payments/create')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ packageId: testPkg._id.toString() });
      
    if (res.status === 201 && res.body.data && res.body.data.paymentCode === paymentCode) {
      console.log(`   -> Thành công: Đã trả về giao dịch cũ (${paymentCode}) thay vì tạo mới rác DB`);
      results.push({ Method: 'POST', Endpoint: '/payments/create (Duplicate)', Status: '✅ PASS' });
    } else {
      console.log(`   -> Thất bại: Tạo ra mã khác hoặc lỗi ${res.status}`);
      results.push({ Method: 'POST', Endpoint: '/payments/create (Duplicate)', Status: `❌ FAIL` });
    }

    // ==========================================
    // TEST CASE 3: Get Payment Status
    // ==========================================
    console.log(`[Bước 4] Kiểm tra trạng thái giao dịch (GET /api/payments/${paymentId})...`);
    res = await request(server)
      .get(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${accessToken}`);
      
    if (res.status === 200 && res.body.data && res.body.data.status === 'PENDING') {
      console.log('   -> Thành công: Trạng thái đang là PENDING');
      results.push({ Method: 'GET', Endpoint: '/payments/:id', Status: '✅ PASS' });
    } else {
      console.log('   -> Thất bại: Trạng thái không đúng');
      results.push({ Method: 'GET', Endpoint: '/payments/:id', Status: `❌ FAIL` });
    }

    // ==========================================
    // TEST CASE 4: Webhook Simulation (Insufficient amount)
    // ==========================================
    console.log('[Bước 5] Gửi Webhook giả mạo với số tiền không đủ (10,000 VND)...');
    const webhookSecret = process.env.WEBHOOK_SECRET || 'my_secure_webhook_secret';
    
    res = await request(server)
      .post('/api/payments/webhook')
      .set('x-webhook-secret', webhookSecret)
      .send({
        transactionId: 'TX123456',
        amount: 10000,
        transferContent: `Nguyen Van A ck thanh toan ${paymentCode}`
      });

    if (res.status === 201 && res.body.data && res.body.data.success === false && res.body.data.message === 'Insufficient amount') {
      console.log('   -> Thành công: Webhook đã từ chối giao dịch thiếu tiền');
      results.push({ Method: 'POST', Endpoint: '/payments/webhook (Fail)', Status: '✅ PASS' });
    } else {
      console.log(`   -> Thất bại: Webhook phản hồi sai: ${JSON.stringify(res.body)}`);
      results.push({ Method: 'POST', Endpoint: '/payments/webhook (Fail)', Status: `❌ FAIL` });
    }

    // ==========================================
    // TEST CASE 5: Webhook Simulation (Success)
    // ==========================================
    console.log(`[Bước 6] Gửi Webhook hợp lệ thanh toán đủ 250,000 VND cho ${paymentCode}...`);
    res = await request(server)
      .post('/api/payments/webhook')
      .set('x-webhook-secret', webhookSecret)
      .send({
        transactionId: 'TX999999',
        amount: 250000,
        transferContent: `Nguyen Van A ck thanh toan ${paymentCode} cho goi VIP`
      });

    if (res.status === 201 && res.body.data && res.body.data.success === true) {
      console.log('   -> Thành công: Webhook xử lý thành công, tiến hành cộng credit');
      results.push({ Method: 'POST', Endpoint: '/payments/webhook (Success)', Status: '✅ PASS' });
    } else {
      console.log(`   -> Thất bại: Webhook phản hồi sai: ${JSON.stringify(res.body)}`);
      results.push({ Method: 'POST', Endpoint: '/payments/webhook (Success)', Status: `❌ FAIL` });
    }

    // ==========================================
    // TEST CASE 6: Verify Balance and ACID transaction
    // ==========================================
    console.log('[Bước 7] Kiểm tra lại số dư tài khoản...');
    res = await request(server)
      .get('/api/payments/balance')
      .set('Authorization', `Bearer ${accessToken}`);
      
    if (res.status === 200 && res.body.data.available === 300) {
      console.log('   -> Thành công: Tài khoản đã được cộng 300 credits đúng cam kết ACID');
      results.push({ Method: 'GET', Endpoint: '/payments/balance (After)', Status: '✅ PASS' });
    } else {
      console.log(`   -> Thất bại: Số dư sai, nhận được: ${res.body?.data?.available}`);
      results.push({ Method: 'GET', Endpoint: '/payments/balance (After)', Status: `❌ FAIL` });
    }

  } catch (error) {
    console.error('Test Execution Error:', error);
  } finally {
    // Clean up
    await userModel.deleteMany({ email: testEmail });
    await packageModel.deleteMany({ name: testPkgName });
    await employerProfileModel.deleteMany({ companyName: 'VietQR Corp' });
    
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
