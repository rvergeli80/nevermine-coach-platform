import { z } from "zod";

import { MEMBERSHIP_ROLES } from "./membership-types";

/** Contratos de entrada del agregado Membership (FEATURE-002.2). */

export const membershipRoleSchema = z.enum(
  MEMBERSHIP_ROLES as unknown as [string, ...string[]],
) as z.ZodType<(typeof MEMBERSHIP_ROLES)[number]>;

export const sportSpaceMembersSchema = z.object({
  sportSpaceId: z.string().uuid(),
});

export const addMembershipSchema = z.object({
  sportSpaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: membershipRoleSchema,
});

export const updateMembershipRoleSchema = z.object({
  id: z.string().uuid(),
  role: membershipRoleSchema,
});

export const membershipIdSchema = z.object({ id: z.string().uuid() });

export type AddMembershipInput = z.infer<typeof addMembershipSchema>;
