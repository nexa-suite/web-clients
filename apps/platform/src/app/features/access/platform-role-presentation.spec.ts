import { CANONICAL_PLATFORM_ACTORS, presentApiRoles } from './platform-role-presentation';

describe('Platform role presentation', () => {
  it('contains every canonical Platform workforce actor and the onboarding support boundary', () => {
    expect(CANONICAL_PLATFORM_ACTORS.map((actor) => actor.name)).toEqual([
      'Company Owner',
      'Tenant Administrator',
      'Business Operations Manager',
      'Sales Representative',
      'Warehouse Operator',
      'Dispatch Coordinator',
      'Nexa Commercial & Onboarding Staff',
    ]);
    expect(CANONICAL_PLATFORM_ACTORS.filter((actor) => actor.kind === 'workforce')
      .every((actor) => actor.capabilities.length > 0)).toBe(true);
  });

  it('matches the canonical Platform actor capability projection', () => {
    const expectedCapabilityIds: Readonly<Record<string, readonly string[]>> = {
      'company-owner': Array.from({ length: 16 }, (_, index) => `CAP-${String(index + 1).padStart(2, '0')}`),
      'tenant-administrator': ['CAP-02', 'CAP-03', 'CAP-04', 'CAP-14', 'CAP-15', 'CAP-16'],
      'business-operations-manager': [
        'CAP-02', 'CAP-03', 'CAP-04', 'CAP-05', 'CAP-06', 'CAP-07', 'CAP-08', 'CAP-09',
        'CAP-10', 'CAP-11', 'CAP-12', 'CAP-13', 'CAP-14', 'CAP-15', 'CAP-16',
      ],
      'sales-representative': [
        'CAP-02', 'CAP-03', 'CAP-04', 'CAP-05', 'CAP-06', 'CAP-07', 'CAP-09', 'CAP-11',
        'CAP-12', 'CAP-13', 'CAP-14', 'CAP-15', 'CAP-16',
      ],
      'warehouse-operator': [
        'CAP-02', 'CAP-03', 'CAP-04', 'CAP-06', 'CAP-07', 'CAP-08', 'CAP-09', 'CAP-10',
        'CAP-13', 'CAP-14', 'CAP-15', 'CAP-16',
      ],
      'dispatch-coordinator': [
        'CAP-02', 'CAP-03', 'CAP-07', 'CAP-08', 'CAP-09', 'CAP-10', 'CAP-13', 'CAP-14',
        'CAP-15', 'CAP-16',
      ],
    };

    for (const [actorId, expectedIds] of Object.entries(expectedCapabilityIds)) {
      const actor = CANONICAL_PLATFORM_ACTORS.find((candidate) => candidate.id === actorId);
      expect(actor?.capabilities.map((entry) => entry.id), actorId).toEqual(expectedIds);
    }
    expect(CANONICAL_PLATFORM_ACTORS.find((actor) => actor.id === 'nexa-commercial-onboarding-staff')
      ?.capabilities).toEqual([]);
  });

  it('matches the canonical authority labels for each Platform capability', () => {
    const expectedAuthorities: Readonly<Record<string, Readonly<Record<string, string>>>> = {
      'company-owner': {
        'CAP-01': 'EXCEPTION AUTHORITY',
        'CAP-02': 'EXCEPTION AUTHORITY',
        'CAP-03': 'OVERSIGHT;EXCEPTION AUTHORITY',
        'CAP-04': 'EXCEPTION AUTHORITY',
        'CAP-05': 'OVERSIGHT',
        'CAP-06': 'EXCEPTION AUTHORITY;OVERSIGHT',
        'CAP-07': 'OVERSIGHT',
        'CAP-08': 'EXCEPTION AUTHORITY',
        'CAP-09': 'OVERSIGHT',
        'CAP-10': 'EXCEPTION AUTHORITY',
        'CAP-11': 'EXCEPTION AUTHORITY;OVERSIGHT',
        'CAP-12': 'EXCEPTION AUTHORITY;OVERSIGHT',
        'CAP-13': 'OVERSIGHT',
        'CAP-14': 'OVERSIGHT',
        'CAP-15': 'OVERSIGHT;EXCEPTION AUTHORITY',
        'CAP-16': 'OVERSIGHT',
      },
      'tenant-administrator': {
        'CAP-02': 'COMMAND;OVERSIGHT',
        'CAP-03': 'QUERY',
        'CAP-04': 'QUERY',
        'CAP-14': 'COMMAND;OVERSIGHT',
        'CAP-15': 'QUERY',
        'CAP-16': 'QUERY',
      },
      'business-operations-manager': {
        'CAP-02': 'QUERY',
        'CAP-03': 'OVERSIGHT',
        'CAP-04': 'OVERSIGHT',
        'CAP-05': 'QUERY',
        'CAP-06': 'OVERSIGHT',
        'CAP-07': 'OVERSIGHT',
        'CAP-08': 'OVERSIGHT',
        'CAP-09': 'OVERSIGHT',
        'CAP-10': 'OVERSIGHT',
        'CAP-11': 'OVERSIGHT',
        'CAP-12': 'OVERSIGHT',
        'CAP-13': 'OVERSIGHT',
        'CAP-14': 'QUERY',
        'CAP-15': 'OVERSIGHT',
        'CAP-16': 'OVERSIGHT',
      },
      'sales-representative': {
        'CAP-02': 'QUERY',
        'CAP-03': 'COMMAND;QUERY',
        'CAP-04': 'COMMAND;QUERY',
        'CAP-05': 'COMMAND;QUERY',
        'CAP-06': 'COMMAND;QUERY',
        'CAP-07': 'QUERY',
        'CAP-09': 'QUERY',
        'CAP-11': 'QUERY',
        'CAP-12': 'QUERY',
        'CAP-13': 'QUERY',
        'CAP-14': 'QUERY',
        'CAP-15': 'QUERY',
        'CAP-16': 'QUERY',
      },
      'warehouse-operator': {
        'CAP-02': 'QUERY',
        'CAP-03': 'QUERY',
        'CAP-04': 'QUERY',
        'CAP-06': 'QUERY',
        'CAP-07': 'COMMAND;QUERY',
        'CAP-08': 'COMMAND;EXCEPTION AUTHORITY',
        'CAP-09': 'COMMAND;QUERY',
        'CAP-10': 'COMMAND;EXCEPTION AUTHORITY',
        'CAP-13': 'QUERY',
        'CAP-14': 'QUERY',
        'CAP-15': 'QUERY',
        'CAP-16': 'QUERY',
      },
      'dispatch-coordinator': {
        'CAP-02': 'QUERY',
        'CAP-03': 'QUERY',
        'CAP-07': 'QUERY',
        'CAP-08': 'QUERY',
        'CAP-09': 'COMMAND;EXCEPTION AUTHORITY',
        'CAP-10': 'COMMAND;QUERY',
        'CAP-13': 'QUERY',
        'CAP-14': 'QUERY',
        'CAP-15': 'QUERY',
        'CAP-16': 'QUERY',
      },
    };

    for (const [actorId, expected] of Object.entries(expectedAuthorities)) {
      const actor = CANONICAL_PLATFORM_ACTORS.find((candidate) => candidate.id === actorId);
      const actual = Object.fromEntries(actor?.capabilities.map(({ id, authorities }) => [id, authorities.join(';')]) ?? []);
      expect(actual, actorId).toEqual(expected);
    }
  });

  it('preserves raw API role values and leaves LOGISTICS unmapped', () => {
    expect(presentApiRoles(['COMPANY_OWNER', 'TENANT_ADMIN', 'SALES', 'WAREHOUSE', 'LOGISTICS']))
      .toEqual([
        { apiRole: 'COMPANY_OWNER', canonicalActorName: 'Company Owner' },
        { apiRole: 'TENANT_ADMIN', canonicalActorName: 'Tenant Administrator' },
        { apiRole: 'SALES', canonicalActorName: 'Sales Representative' },
        { apiRole: 'WAREHOUSE', canonicalActorName: 'Warehouse Operator' },
        { apiRole: 'LOGISTICS', canonicalActorName: null },
      ]);
  });

  it('does not invent a Business Operations Manager API role', () => {
    const actor = CANONICAL_PLATFORM_ACTORS.find((candidate) => candidate.id === 'business-operations-manager');

    expect(actor?.apiRoleCode).toBeNull();
    expect(actor?.apiRoleMapping).toBe('unavailable');
    expect(presentApiRoles(['BUSINESS_OPERATIONS_MANAGER'])[0]).toEqual({
      apiRole: 'BUSINESS_OPERATIONS_MANAGER',
      canonicalActorName: null,
    });
  });
});
