import type { Action, ActionContext } from '@fsl/core';
import { can } from '@fsl/core';
import type { ResolvedActor } from './actor';
import { ApiError } from '../lib/errors';

export function ensure(actor: ResolvedActor, action: Action, ctx?: ActionContext): void {
  if (!can(actor, action, ctx)) {
    throw new ApiError('FORBIDDEN', 403);
  }
}
