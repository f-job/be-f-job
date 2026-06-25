import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import {
  User,
  UserRole,
  UserStatus,
} from './users/schemas/user.schema';

import {
  EmployerProfile,
  EmployerStatus,
} from './employers/schemas/employer-profile.schema';

const EMPLOYERS = [
  {
    companyName: 'FPT Software Da Nang',
    industry: 'Software Development',
    website: 'https://fptsoftware.com',
  },
  {
    companyName: 'Axon Active Vietnam',
    industry: 'Software Development',
    website: 'https://axonactive.com',
  },
  {
    companyName: 'Enouvo IT Solutions',
    industry: 'Software Development',
    website: 'https://enouvo.com',
  },
  {
    companyName: 'SmartDev',
    industry: 'Fintech',
    website: 'https://smartdev.com',
  },
  {
    companyName: 'Gameloft Da Nang',
    industry: 'Game Development',
    website: 'https://gameloft.com',
  },
  {
    companyName: 'Rikkeisoft Da Nang',
    industry: 'Software Outsourcing',
    website: 'https://rikkeisoft.com',
  },
  {
    companyName: 'Sotatek Da Nang',
    industry: 'Blockchain',
    website: 'https://sotatek.com',
  },
  {
    companyName: 'Orient Software',
    industry: 'Software Development',
    website: 'https://orientsoftware.com',
  },
  {
    companyName: 'CodeComplete Vietnam',
    industry: 'Software Development',
    website: 'https://codecomplete.jp',
  },
  {
    companyName: 'Sun Asterisk Da Nang',
    industry: 'Software Development',
    website: 'https://sun-asterisk.com',
  },
  {
    companyName: 'Da Nang Tech Solutions',
    industry: 'AI',
    website: 'https://dntech.vn',
  },
  {
    companyName: 'CloudX Vietnam',
    industry: 'Cloud Computing',
    website: 'https://cloudx.vn',
  },
  {
    companyName: 'BlueOcean Software',
    industry: 'Software Development',
    website: 'https://blueocean.vn',
  },
  {
    companyName: 'Dragon Tech',
    industry: 'Fintech',
    website: 'https://dragontech.vn',
  },
  {
    companyName: 'Ocean Labs',
    industry: 'AI & Data',
    website: 'https://oceanlabs.vn',
  },
  {
    companyName: 'VN Digital',
    industry: 'E-Commerce',
    website: 'https://vndigital.vn',
  },
  {
    companyName: 'InnovateX',
    industry: 'Startup',
    website: 'https://innovatex.vn',
  },
  {
    companyName: 'Smart Cloud Solutions',
    industry: 'Cloud Computing',
    website: 'https://smartcloud.vn',
  },
  {
    companyName: 'Data Vision',
    industry: 'Data Engineering',
    website: 'https://datavision.vn',
  },
  {
    companyName: 'FutureSoft',
    industry: 'Software Development',
    website: 'https://futuresoft.vn',
  },
];

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const userModel = app.get<Model<User>>(
    getModelToken(User.name),
  );

  const employerModel = app.get<Model<EmployerProfile>>(
    getModelToken(EmployerProfile.name),
  );

  const passwordHash = await bcrypt.hash('123456', 10);

  for (let i = 0; i < EMPLOYERS.length; i++) {
    const company = EMPLOYERS[i];

    const email =
      company.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') +
      '@gmail.com';

    const existed = await userModel.findOne({ email });

    if (existed) {
      console.log(`Skip ${email}`);
      continue;
    }

    const user = await userModel.create({
      fullName: company.companyName,
      email,
      password: passwordHash,

      role: UserRole.EMPLOYER,
      status: UserStatus.ACTIVE,

      emailVerified: true,

      identityVerificationRequired: false,

      identityVerification: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    await employerModel.create({
      userId: user._id,

      companyName: company.companyName,

      companyDescription:
        `${company.companyName} is a technology company based in Da Nang.`,

      website: company.website,

      industry: company.industry,

      companySize: [
        '11-50',
        '51-200',
        '201-500',
        '500+',
      ][Math.floor(Math.random() * 4)],

      address: 'Hai Chau District',

      city: 'Da Nang',

      country: 'Vietnam',

      contactEmail: email,

      status: EmployerStatus.APPROVED,

      verifiedAt: new Date(),

      trustScore: Math.floor(
        Math.random() * (95 - 75) + 75,
      ),

      averageRating: Number(
        (Math.random() * 1 + 4).toFixed(1),
      ),

      reviewCount: Math.floor(
        Math.random() * 300,
      ),

      provisional: false,

      credit: Math.floor(
        Math.random() * 10000000,
      ),
    });

    console.log(`Created ${company.companyName}`);
  }

  await app.close();

  console.log('DONE SEED EMPLOYERS');
}

bootstrap();