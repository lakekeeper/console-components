import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { permissionActions } from './permissionActions';

/**
 * The catalog action lists are what the console grants itself when
 * authentication is disabled — `functions.ts` returns them instead of asking the
 * API, because there is no principal to ask about. A list that falls behind the
 * schema therefore hides a feature from every no-auth deployment: tag
 * definitions were invisible there for exactly this reason.
 *
 * The generated client exposes these unions as types only, so nothing at runtime
 * can enumerate them and the lists have to be written by hand. This reads the
 * generated file as text and compares, which is the one check that keeps a
 * client regeneration from quietly leaving a new action out.
 */
// Resolved from the package root: vitest runs there, and `import.meta.url` is not
// a file URL under this config.
const typesPath = resolve(process.cwd(), 'src/gen/management/types.gen.ts');
const types = readFileSync(typesPath, 'utf8');

const declarations = new Map(
  [...types.matchAll(/^export type (\w+) = ([\s\S]*?)(?=^export |$(?![\s\S]))/gm)].map((m) => [
    m[1],
    m[2],
  ]),
);

function declaration(typeName: string): string {
  const body = declarations.get(typeName);
  if (!body) throw new Error(`${typeName} not found in types.gen.ts`);
  return body;
}

/**
 * Whether an action carries required arguments of its own — `move` needs a
 * `destination`, for instance.
 *
 * Those are not capabilities but questions about one specific operation ("may I
 * move this namespace *there*"), so a blanket list cannot answer them and must
 * not claim to. Derived rather than listed by name, so an action that gains
 * arguments in a later schema does not fail this test spuriously.
 */
function isParameterised(actionTypeName: string): boolean {
  const body = declarations.get(actionTypeName);
  if (!body) return false;
  return [...body.matchAll(/^\s{4}'?([a-z-]+)'?(\??):/gm)].some(
    ([, name, optional]) => name !== 'action' && optional !== '?',
  );
}

/**
 * Action names in one `export type X = …` union from the generated client,
 * excluding the parameterised ones.
 */
function schemaActions(typeName: string): string[] {
  const body = declaration(typeName);
  // Each union member is `({ action: 'name' } & TypeName)`, and the member type
  // is what says whether the action takes arguments.
  const members = [...body.matchAll(/action: '([a-z_]+)';\s*\}\s*&\s*(\w+)/g)];
  const bare = [...body.matchAll(/action: '([a-z_]+)'/g)].map((m) => m[1]);
  const parameterised = new Set(
    members.filter(([, , typeRef]) => isParameterised(typeRef)).map(([, action]) => action),
  );
  return [...new Set(bare.filter((action) => !parameterised.has(action)))].sort();
}

const CATALOG_LISTS: Array<[string, string, { action: string }[]]> = [
  ['LakekeeperServerAction', 'catalogServerActions', permissionActions.catalogServerActions],
  ['LakekeeperProjectAction', 'catalogProjectActions', permissionActions.catalogProjectActions],
  [
    'LakekeeperWarehouseAction',
    'catalogWarehouseActions',
    permissionActions.catalogWarehouseActions,
  ],
  [
    'LakekeeperNamespaceAction',
    'catalogNamespaceActions',
    permissionActions.catalogNamespaceActions,
  ],
  ['LakekeeperTableAction', 'catalogTableActions', permissionActions.catalogTableActions],
  ['LakekeeperViewAction', 'catalogViewActions', permissionActions.catalogViewActions],
  [
    'LakekeeperGenericTableAction',
    'catalogGenericTableActions',
    permissionActions.catalogGenericTableActions,
  ],
  ['LakekeeperRoleActionKind', 'catalogRoleActions', permissionActions.catalogRoleActions],
  ['LakekeeperTagAction', 'catalogTagActions', permissionActions.catalogTagActions],
  ['LakekeeperUserAction', 'catalogUserActions', permissionActions.catalogUserActions],
];

describe('catalog action lists cover the generated schema', () => {
  for (const [typeName, listName, list] of CATALOG_LISTS) {
    it(`${listName} matches ${typeName}`, () => {
      const actual = [...new Set(list.map((entry) => entry.action))].sort();
      // Equality, not a subset: a stale name is as wrong as a missing one — it
      // grants a permission the server no longer knows.
      expect(actual).toEqual(schemaActions(typeName));
    });
  }
});

describe('the actions behind the reported bug', () => {
  it('grants tag definition management with authentication off', () => {
    const project = permissionActions.catalogProjectActions.map((a) => a.action);
    expect(project).toContain('list_tags');
    expect(project).toContain('create_tag');
  });

  it('grants tag attachment on every taggable entity', () => {
    for (const list of [
      permissionActions.catalogWarehouseActions,
      permissionActions.catalogNamespaceActions,
      permissionActions.catalogTableActions,
      permissionActions.catalogViewActions,
      permissionActions.catalogGenericTableActions,
    ]) {
      expect(list.map((a) => a.action)).toContain('manage_tags');
    }
  });
});
