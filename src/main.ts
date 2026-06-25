import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // ─── Security ──────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ─── CORS ──────────────────────────────────────────────────────────────────
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  console.log('FRONTEND_URL =', frontendUrl);
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // ─── Global Prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ─── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // Strip unknown properties
      forbidNonWhitelisted: true, // Throw error for unknown properties
      transform: true,          // Auto-transform payloads to DTO types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Swagger ───────────────────────────────────────────────────────────────
  if (configService.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('F-Job API')
      .setDescription('F-Job Backend API Documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
      },
      customSiteTitle: 'F-Job API Documentation',
    });

    logger.log('Swagger UI available at /api-docs');
  }

  // ─── WebSocket Adapter ─────────────────────────────────────────────────────
  // Attaches Socket.io to the same HTTP server so the /chat gateway
  // is reachable at ws://host:<PORT>/chat without a separate port.
  app.useWebSocketAdapter(new IoAdapter(app));

  // ─── Start ─────────────────────────────────────────────────────────────────
  const port = configService.get<number>('PORT') || 4300;
  await app.listen(port);

  logger.log(
    `Application is running on: http://localhost:${port}/api`,
  );
  logger.log(
    `Environment: ${configService.get<string>('NODE_ENV')}`,
  );
}

bootstrap();
