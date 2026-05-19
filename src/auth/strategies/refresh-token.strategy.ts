import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const tokenFromBody = request?.body?.refreshToken;
          if (tokenFromBody) return tokenFromBody;

          const authHeader = request?.headers?.authorization;
          if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
            return authHeader.split(' ')[1];
          }
          return null;
        },
      ]),
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') || 'dev_refresh_secret_key_at_least_32_chars',
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: any) {
    const refreshToken = req.body?.refreshToken || req.headers?.authorization?.split(' ')[1];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }
    return { ...payload, refreshToken };
  }
}
