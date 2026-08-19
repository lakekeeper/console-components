import { UserOrRole } from '../gen/management/types.gen';

/**
 * The `UserOrRole` invariant, which the schema no longer carries.
 *
 * The management spec used to express this as a `oneOf` — `{user}` or `{role}`,
 * never both. It is now one object with both properties optional, because a
 * `oneOf` there could not be composed by the code generators that embed this
 * type in every `*Assignment` schema: they flatten the union into a struct
 * requiring both keys. The server still refuses a payload naming both or
 * neither, so the guarantee did not disappear — it moved out of the type system
 * and onto us.
 *
 * Hence these two functions. Reads narrow through `principalRef` instead of
 * trusting `'user' in x`, which the optional properties made unsound; writes are
 * built by `toPrincipal`, so "exactly one key" is stated once rather than
 * re-derived at each of the dozen call sites that send an assignment.
 */

/** A principal reduced to the pair the UI actually works in. */
export interface PrincipalRef {
  kind: 'user' | 'role';
  id: string;
}

/**
 * The principal a payload names, or null when it names none.
 *
 * Null is a real answer rather than a thrown error: `{}` is schema-valid now, so
 * a malformed row reaches us as data. A caller that skips it renders a short
 * list, which beats failing the whole view over one bad entry.
 */
export function principalRef(p: UserOrRole | null | undefined): PrincipalRef | null {
  if (p?.user) return { kind: 'user', id: p.user };
  if (p?.role) return { kind: 'role', id: p.role };
  return null;
}

/** Exactly one key set, which is the only shape the server accepts. */
export function toPrincipal(kind: 'user' | 'role', id: string): UserOrRole {
  return kind === 'user' ? { user: id } : { role: id };
}
