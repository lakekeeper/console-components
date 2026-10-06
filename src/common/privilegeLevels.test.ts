import { describe, expect, it } from 'vitest';
import { privilegeRowText, type PrivilegeLevel } from './privilegeLevels';

// Shaped after Cedar's `read_grants`, which the server words per level.
const readGrants: PrivilegeLevel[] = [
  { type: 'server', displayName: 'Read grants', description: 'Everything beneath the server.' },
  { type: 'project', displayName: 'Read grants', description: 'This project and below.' },
  { type: 'warehouse', displayName: 'Read grants', description: 'This object.' },
  { type: 'table', displayName: 'Read grants', description: 'This object.' },
];

describe('privilegeRowText', () => {
  it("shows the selected level's own description", () => {
    expect(privilegeRowText(readGrants, 'table').description).toBe('This object.');
    expect(privilegeRowText(readGrants, 'project').description).toBe('This project and below.');
  });

  it("shows the selected level's own label", () => {
    const manageGrants: PrivilegeLevel[] = [
      { type: 'project', displayName: 'Manage grants and roles', description: 'a' },
      { type: 'table', displayName: 'Manage grants', description: 'b' },
    ];
    expect(privilegeRowText(manageGrants, 'table').displayName).toBe('Manage grants');
  });

  it('falls back where the selected level gives no wording of its own', () => {
    const sparse: PrivilegeLevel[] = [
      { type: 'server', displayName: 'Select', description: null },
      { type: 'table', displayName: '', description: 'Read the data.' },
    ];
    expect(privilegeRowText(sparse, 'server')).toEqual({
      displayName: 'Select',
      description: 'Read the data.',
      perLevel: [],
    });
  });

  it('breaks the wording down by level when the levels differ', () => {
    const text = privilegeRowText(readGrants, null);
    expect(text.perLevel).toEqual([
      {
        types: ['server'],
        displayName: 'Read grants',
        description: 'Everything beneath the server.',
      },
      { types: ['project'], displayName: 'Read grants', description: 'This project and below.' },
      { types: ['warehouse', 'table'], displayName: 'Read grants', description: 'This object.' },
    ]);
  });

  it('keeps one description when every level words it the same', () => {
    const same: PrivilegeLevel[] = [
      { type: 'warehouse', displayName: 'Select', description: 'Read the data.' },
      { type: 'table', displayName: 'Select', description: 'Read the data.' },
      { type: 'view', displayName: 'Select', description: null },
    ];
    expect(privilegeRowText(same, null)).toEqual({
      displayName: 'Select',
      description: 'Read the data.',
      perLevel: [],
    });
  });
});
