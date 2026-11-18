// Pure matching rules for Planning Center group auto-assignment
// (lib/planningCenter.ts autoAssignGroupsFromPlanningCenter and
// runGroupAutoAssign). Kept free of DB/network code so it can be unit-tested.
//
// Each group can pick one Planning Center custom field (the "Team" field by
// default) and a list of keywords. A person is added to the group when ANY of
// their values for that field matches ANY keyword (Andrew, 2026-11-18):
//   - Case, punctuation and extra spaces are ignored.
//   - A keyword matches when its words appear together, in order, inside a
//     value: "YTH" matches "Fearless YTH", "Platform" matches "Platform",
//     "Men" matches "Men's" but not "Women's".
//   - Yes/no words are treated as the same thing: a keyword of yes, true,
//     checked, y, x or 1 matches a ticked checkbox (Planning Center stores
//     those as "true"), and no/false/unchecked/n/0 matches an unticked one.

const TRUE_WORDS = new Set(["yes", "y", "true", "checked", "x", "1", "on"]);
const FALSE_WORDS = new Set(["no", "n", "false", "unchecked", "0", "off"]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function booleanWord(value: string): boolean | null {
  const normalized = words(value).join(" ");
  if (TRUE_WORDS.has(normalized)) return true;
  if (FALSE_WORDS.has(normalized)) return false;
  return null;
}

// Accepts a string[] or a comma/newline-separated string. Trims, drops
// blanks and case-insensitive duplicates, caps the list at 50.
export function normalizeKeywords(input: unknown): string[] {
  const raw: unknown[] = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[,\n]/)
      : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const keyword = entry.trim().replace(/\s+/g, " ").slice(0, 100);
    const key = words(keyword).join(" ");
    if (!keyword || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= 50) break;
  }
  return result;
}

export function keywordMatchesValue(keyword: string, value: string): boolean {
  const keywordBool = booleanWord(keyword);
  if (keywordBool !== null) return booleanWord(value) === keywordBool;
  const needle = words(keyword);
  const haystack = words(value);
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}

export function valuesMatchKeywords(values: readonly string[], keywords: readonly string[]): boolean {
  return values.some((value) => keywords.some((keyword) => keywordMatchesValue(keyword, value)));
}

// Turns Planning Center FieldDatum resources into
// field_definition id -> every non-blank value. A checkbox field with several
// ticked options has one datum per option, so values are kept as a list.
export type FieldDatumLike = {
  attributes?: { value?: unknown };
  relationships?: {
    field_definition?: { data?: { id?: unknown } | null };
    customizable?: { data?: { id?: unknown; type?: unknown } | null };
  };
};

export function collectFieldValues(records: readonly FieldDatumLike[]): Map<string, string[]> {
  const values = new Map<string, string[]>();
  for (const record of records) {
    const definitionId = record.relationships?.field_definition?.data?.id;
    const value = record.attributes?.value;
    if (typeof definitionId !== "string" || !definitionId) continue;
    if (typeof value !== "string" || !value.trim()) continue;
    const list = values.get(definitionId) ?? [];
    list.push(value.trim());
    values.set(definitionId, list);
  }
  return values;
}

// Same, but grouped by person for one field (GET /field_data filtered by
// field definition): person id -> every non-blank value.
export function collectValuesByPerson(records: readonly FieldDatumLike[]): Map<string, string[]> {
  const byPerson = new Map<string, string[]>();
  for (const record of records) {
    const customizable = record.relationships?.customizable?.data;
    const personId = customizable?.id;
    if (typeof personId !== "string" || !personId) continue;
    if (customizable?.type !== undefined && customizable.type !== "Person") continue;
    const value = record.attributes?.value;
    if (typeof value !== "string" || !value.trim()) continue;
    const list = byPerson.get(personId) ?? [];
    list.push(value.trim());
    byPerson.set(personId, list);
  }
  return byPerson;
}

export type MembershipLike = { userId: string; source: string };

// Decides one group's weekly sync (Andrew, 2026-11-18): add every matching
// account that isn't a member yet (as "auto"), and remove members the rule
// itself added ("auto") who no longer match. Members added by hand
// ("manual") are never removed. When allowRemovals is false (Planning Center
// returned no data at all for the field -- more likely a renamed/deleted
// field or a bad response than "nobody has it") nothing is removed.
export function planGroupSync(
  matchingUserIds: Iterable<string>,
  members: readonly MembershipLike[],
  allowRemovals: boolean,
): { add: string[]; remove: string[]; alreadyMembers: number } {
  const matching = new Set(matchingUserIds);
  const memberIds = new Set(members.map((member) => member.userId));
  const add = [...matching].filter((userId) => !memberIds.has(userId));
  const remove = allowRemovals
    ? members.filter((member) => member.source === "auto" && !matching.has(member.userId)).map((member) => member.userId)
    : [];
  return { add, remove, alreadyMembers: matching.size - add.length };
}
