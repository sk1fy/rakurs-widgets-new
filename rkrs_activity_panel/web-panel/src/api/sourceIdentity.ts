import type { ActivitySource } from "./source";

// Equal modes do not imply equal installation/viewer scope.
const identities = new WeakMap<ActivitySource, number>();
let nextIdentity = 0;
export function sourceIdentity(source: ActivitySource): number {
  let id = identities.get(source);
  if (id === undefined) {
    id = ++nextIdentity;
    identities.set(source, id);
  }
  return id;
}
