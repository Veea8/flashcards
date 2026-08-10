/**
 * Name order with numbers compared as numbers, so a course's "Topic 2" sorts
 * before "Topic 10". Shared by the deck tree, the per-deck table and the
 * import preview so all three agree on what order a deck's subdecks are in.
 */
export function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
