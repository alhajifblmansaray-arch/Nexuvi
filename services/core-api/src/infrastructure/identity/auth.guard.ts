import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TokenService } from './token.service';
import {
  attachPrincipal,
  currentContext,
  type RequestContext,
} from '../context/request-context';

export const IS_PUBLIC = 'nexuvi:public';

/**
 * Marks a route as reachable without a bearer token.
 *
 * Used only for health checks and the OpenAPI document. Every clinical route is
 * authenticated by default — this guard is registered globally, so a new controller is
 * protected the moment it is written rather than the moment someone remembers to protect
 * it. Opting *out* is a visible, greppable decision.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const principal = await this.tokenService.verify(extractBearer(request));

    // The context object is created by the middleware; the principal is attached here,
    // after verification, and never mutated again.
    if (!currentContext()) {
      throw new UnauthorizedException('Request context is unavailable.');
    }
    attachPrincipal(principal);

    return true;
  }
}

function extractBearer(request: Request): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedException('A bearer token is required.');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedException('A bearer token is required.');
  }
  return token;
}

export type { RequestContext };
