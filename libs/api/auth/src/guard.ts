import type { Action, ActionContext } from '@cc/core';
import { can } from '@cc/core';
import type { ResolvedActor } from './actor';
import { ApiError } from '@cc/api-util/errors';

export function ensure(actor: ResolvedActor, action: Action, ctx?: ActionContext): void {
  if (!can(actor, action, ctx)) {
    throw new ApiError('FORBIDDEN', 403);
  }
}
