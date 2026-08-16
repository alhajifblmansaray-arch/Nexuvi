import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { AuditActor } from '@nexuvi/api-contracts';

import { currentPrincipal, principalAsActor } from '../context/request-context';

/**
 * Who the current request is acting as.
 *
 * Reads the verified principal established by `AuthGuard` from token claims. There is no
 * fallback: a clinical action whose actor cannot be established is refused rather than
 * attributed to a placeholder. §19 makes attribution the property the audit log exists to
 * provide, and a log that misattributes an action is not a weaker log — it is a false one.
 *
 * Under support impersonation the *support agent* is recorded, not the user being
 * represented (§16.3). {@link principalAsActor} owns that rule.
 */
@Injectable()
export class ActorService {
  current(): AuditActor {
    const principal = currentPrincipal();
    if (!principal) {
      throw new InternalServerErrorException(
        'No authenticated actor. Refusing to record a clinical action without attribution.',
      );
    }
    // Patients do not take clinical actions. If one ever reaches here it means a portal
    // route has been wired to a clinical write path, which is a defect, not a case to
    // handle gracefully.
    if (principal.subjectType !== 'staff') {
      throw new InternalServerErrorException(
        'A patient session cannot be the actor on a clinical action.',
      );
    }
    return principalAsActor(principal);
  }
}
