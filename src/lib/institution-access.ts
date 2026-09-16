import type { UserRole } from "./types";

export function institutionAccess(
  account: { tenantId: string | null; registrationRole: UserRole },
  memberships: { id: string; role: string; active: boolean }[],
) {
  if (account.tenantId) {
    const admin = memberships.some(m => m.id === account.tenantId && m.active && m.role === "ADMIN");
    return { create: admin, join: admin };
  }
  if (memberships.length) {
    const admin = memberships.some(m => m.active && m.role === "ADMIN");
    return { create: admin, join: admin };
  }
  return { create: account.registrationRole === "ADMIN", join: true };
}
