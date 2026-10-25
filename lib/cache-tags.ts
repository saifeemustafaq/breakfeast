/**
 * Cache tags for the private, per-request caches behind the five tabs. Any Server
 * Action expires both tags for the person who ran it, which also clears the
 * client router cache so the next tab switch shows the change.
 */
export const householdTag = (householdId: string) => `household-${householdId}`;
export const userTag = (userId: string) => `user-${userId}`;

/** How long the client router may reuse a tab's output. 5 min is the minimum for App Shell inclusion. */
export const CLIENT_STALE_SEC = 300;
