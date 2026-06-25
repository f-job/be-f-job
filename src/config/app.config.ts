import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME || 'F-Job',
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4300', 10),
  serverUrl: process.env.SERVER_URL || 'https://cc7d-42-116-239-137.ngrok-free.app',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
}));
