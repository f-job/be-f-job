import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '../../users/schemas/user.schema';

/**
 * BlockedUserGuard
 *
 * Cross-cutting trust-and-safety guard (Req 12.7): denies every action to a user
 * whose `UserStatus` is `BLOCKED`. It is intended to run after `AuthGuard('jwt')`
 * (which populates `request.user`), providing defence-in-depth so that a blocked
 * account cannot perform any Review, verification, Report, or application-lifecycle
 * action.
 *
 * The authenticated `request.user` (set by `JwtStrategy.validate`) carries only
 * `{ id, email, role }`, so the current `UserStatus` is read fresh from persistence
 * via `UsersService`. On a `BLOCKED` status it throws `ERR_2003` (403 Forbidden),
 * matching the structured `{ errorCode, message }` exception convention used across
 * the codebase.
 */
@Injectable()
export class BlockedUserGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    // No authenticated user on the request — defer to AuthGuard('jwt') for the 401.
    if (!user?.id) {
      return true;
    }

    // Prefer a status already attached to the request; otherwise read it fresh.
    const status: UserStatus | undefined =
      user.status ?? (await this.usersService.findById(user.id)).status;

    if (status === UserStatus.BLOCKED) {
      throw new ForbiddenException({
        errorCode: 'ERR_2003',
        message:
          'Your account is blocked and cannot perform this action. Please contact support.',
      });
    }

    return true;
  }
}
