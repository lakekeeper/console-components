/**
 * One privilege as one level publishes it. An authorizer may word the same
 * privilege differently per level — what `read_grants` covers on a server is
 * not what it covers on a table — so the label and description belong to the
 * level, not to the name.
 */
export interface PrivilegeLevel {
  type: string;
  displayName: string;
  description: string | null;
}

/** Levels that publish the same label and description, in column order. */
export interface PrivilegeLevelGroup {
  types: string[];
  displayName: string;
  description: string;
}

/** How one privilege row reads in the reference matrix. */
export interface PrivilegeRowText {
  displayName: string;
  description: string | null;
  /**
   * Set when the levels word the privilege differently: one entry per
   * distinct wording, each naming the levels it applies to.
   */
  perLevel: PrivilegeLevelGroup[];
}

/**
 * The label and description to show for a privilege published on `levels`.
 *
 * With a level selected, that level's own wording, falling back to the first
 * level's label and the first description any level gives. Without one, the
 * first level's wording, plus a per-level breakdown when the levels differ.
 * Levels without a description are left out of the breakdown: they have
 * nothing to add.
 */
export function privilegeRowText(
  levels: PrivilegeLevel[],
  selectedType: string | null,
): PrivilegeRowText {
  const displayName = levels[0]?.displayName ?? '';
  const description = levels.find((l) => l.description)?.description ?? null;

  if (selectedType) {
    const own = levels.find((l) => l.type === selectedType);
    return {
      displayName: own?.displayName || displayName,
      description: own?.description || description,
      perLevel: [],
    };
  }

  const groups = new Map<string, PrivilegeLevelGroup>();
  for (const l of levels) {
    if (!l.description) continue;
    const key = `${l.displayName}\u0000${l.description}`;
    const group = groups.get(key);
    if (group) group.types.push(l.type);
    else
      groups.set(key, {
        types: [l.type],
        displayName: l.displayName,
        description: l.description,
      });
  }
  // One group still needs its heading when its label is not the row's: the
  // description then comes from a later level than the label shown.
  const perLevel = [...groups.values()];
  const needsHeadings =
    perLevel.length > 1 || (perLevel.length === 1 && perLevel[0].displayName !== displayName);
  return { displayName, description, perLevel: needsHeadings ? perLevel : [] };
}
