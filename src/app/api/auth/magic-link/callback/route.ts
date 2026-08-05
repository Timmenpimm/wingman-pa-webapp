import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "../../../../../../auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/magic-link/callback?token=… — de link uit de mail.
 *
 * signIn() hier is de server-kant van NextAuth: bij een geldig token zet hij
 * de sessiecookie en gooit next/navigation's redirect() (geen echte fout,
 * dat is hoe Next.js server-side redirects implementeert — vandaar de
 * instanceof-check hieronder, het officiële patroon uit de Auth.js-docs).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    redirect("/inloggen?link=ongeldig");
  }

  try {
    await signIn("magic-link", { token, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/inloggen?link=ongeldig");
    }
    throw error;
  }
}
