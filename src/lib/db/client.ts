import { auth } from "../../../auth";

export { prisma } from "./prisma";

/**
 * Dev draaide tot en met de auth-branch single-user op een vast e-mailadres.
 * Nu komt de gebruiker uit de sessie (NextAuth, zie ../../../auth.ts). Geen
 * sessie is geen stille terugval op een demo-gebruiker — dat zou precies het
 * lek zijn dat middleware.ts moet voorkomen, alleen dan één laag dieper.
 */
export async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Geen sessie — currentUserId() mag nooit terugvallen op een vaste gebruiker.");
  }
  return session.user.id;
}
