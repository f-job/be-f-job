import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');

        // Fail fast nếu thiếu MONGODB_URI (backup check sau Joi validation)
        if (!uri) {
          throw new Error(
            'MONGODB_URI is not defined. Please check your .env file.',
          );
        }

        return {
          uri,
          // Connection options
          connectionFactory: (connection: any) => {
            if (connection.readyState === 1) {
              console.log('✅ MongoDB connected successfully');
            } else {
              connection.on('connected', () => {
                console.log('✅ MongoDB connected successfully');
              });
            }
            connection.on('disconnected', () => {
              console.warn('⚠️  MongoDB disconnected');
            });
            connection.on('error', (error: Error) => {
              console.error('❌ MongoDB connection error:', error.message);
            });
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
