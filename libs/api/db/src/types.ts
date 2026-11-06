import type { users } from './schema';

export type UserRow = typeof users.$inferSelect;
