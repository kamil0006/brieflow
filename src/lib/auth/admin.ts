import { prisma } from "@/lib/prisma";

// The app owner — set ADMIN_EMAILS (comma-separated) in the environment.
// Only they see owner-only things like the AI cost overview. Kept out of
// the code so the public repo doesn't carry anyone's address.
export function isAdminEmail(email: string, value: string = process.env.ADMIN_EMAILS ?? ""): boolean {
  const admins = value
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user ? isAdminEmail(user.email) : false;
}
