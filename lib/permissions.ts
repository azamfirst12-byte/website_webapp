// Staff roles for the business admin area (client-safe). Developer access is separate and never granted by a role.

export const ROLES = ['admin', 'manager', 'sales', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Sales manager',
  sales: 'Sales rep',
  viewer: 'Viewer (read-only)',
};

export const ROLE_HELP: Record<Role, string> = {
  admin: 'Everything, including staff accounts and demo data.',
  manager: 'All leads, assignment, reports and exports. No staff management.',
  sales: 'Leads assigned to them or unassigned, their tasks and appointments.',
  viewer: 'Read-only access to leads and reports.',
};

export type Permission =
  | 'leads.view_all'
  | 'leads.edit'
  | 'leads.edit_all'
  | 'leads.delete'
  | 'leads.assign'
  | 'reports.view'
  | 'export'
  | 'team.manage'
  | 'demo.manage'
  | 'appointments.manage'
  | 'tasks.manage_all';

const MATRIX: Record<Role, Permission[]> = {
  admin: ['leads.view_all', 'leads.edit', 'leads.edit_all', 'leads.delete', 'leads.assign', 'reports.view', 'export', 'team.manage', 'demo.manage', 'appointments.manage', 'tasks.manage_all'],
  manager: ['leads.view_all', 'leads.edit', 'leads.edit_all', 'leads.delete', 'leads.assign', 'reports.view', 'export', 'appointments.manage', 'tasks.manage_all'],
  sales: ['leads.edit', 'appointments.manage'],
  viewer: ['leads.view_all', 'reports.view'],
};

export function can(role: Role | string | undefined, p: Permission) {
  return !!role && (MATRIX[role as Role] ?? []).includes(p);
}
