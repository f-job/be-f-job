import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';

export interface OAuthProfile {
  providerId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  picture?: string; // Avatar URL from OAuth provider
}

@Injectable()
export class OAuthValidationService {
  private readonly googleClient: OAuth2Client;
  private readonly googleClientId: string;
  private readonly googleClientSecret: string;
  private readonly facebookAppId: string;
  private readonly facebookAppSecret: string;
  private readonly logger = new Logger(OAuthValidationService.name);

  constructor(private readonly configService: ConfigService) {
    this.googleClientId = this.getRequiredEnv('GOOGLE_CLIENT_ID');
    this.googleClientSecret = this.getRequiredEnv('GOOGLE_CLIENT_SECRET');
    this.facebookAppId = this.getRequiredEnv('FACEBOOK_APP_ID');
    this.facebookAppSecret = this.getRequiredEnv('FACEBOOK_APP_SECRET');

    this.googleClient = new OAuth2Client({
      clientId: this.googleClientId,
      clientSecret: this.googleClientSecret,
    });
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value || !value.trim()) {
      throw new Error(`${key} is required for OAuth to work properly.`);
    }
    return value;
  }

  async verifyGoogleToken(token: string): Promise<OAuthProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: this.googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token payload');
      }

      return {
        providerId: payload.sub,
        email: payload.email,
        name: payload.name || 'Google User',
        emailVerified: payload.email_verified || false,
        picture: payload.picture, // Google profile picture URL
      };
    } catch (error: any) {
      this.logger.error(`Google token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  async verifyFacebookToken(token: string): Promise<OAuthProfile> {
    try {
      const appAccessToken = `${this.facebookAppId}|${this.facebookAppSecret}`;
      const debugUrl = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appAccessToken}`;
      const debugResponse = await fetch(debugUrl);
      if (!debugResponse.ok) {
        throw new Error('Facebook debug_token returned error');
      }

      const debugData = await debugResponse.json();
      if (!debugData?.data?.is_valid) {
        throw new UnauthorizedException('Invalid Facebook token');
      }
      if (debugData?.data?.app_id && debugData.data.app_id !== this.facebookAppId) {
        throw new UnauthorizedException('Facebook token app mismatch');
      }

      const appSecretProof = crypto
        .createHmac('sha256', this.facebookAppSecret)
        .update(token)
        .digest('hex');
      const url = `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${token}&appsecret_proof=${appSecretProof}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Facebook Graph API returned error');
      }

      const data = await response.json();

      if (!data.email || !data.id) {
        throw new UnauthorizedException('Facebook token does not provide email or id');
      }

      return {
        providerId: data.id,
        email: data.email,
        name: data.name || 'Facebook User',
        emailVerified: true, // Facebook verification implies valid email
        picture: data.picture?.data?.url, // Facebook profile picture URL
      };
    } catch (error: any) {
      this.logger.error(`Facebook token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid Facebook token');
    }
  }
}
