import { Module } from '@nestjs/common';

import { DevAuthController } from './dev-auth.controller';

/**
 * Development token issuance.
 *
 * Registered only when `AUTH_MODE=dev` (see `AppModule.register`), and the controller
 * checks again at request time. Removed entirely once the identity provider lands.
 */
@Module({ controllers: [DevAuthController] })
export class DevAuthModule {}
