import { gateOnboarding } from "@/lib/onboarding/gate";

export const dynamic = "force-dynamic";

/**
 * Route-groep `(app)`: alle schermen die pas ergens over gaan als er een bron
 * gekoppeld is. De haakjes houden de URL's ongewijzigd — /inbox blijft /inbox.
 *
 * Buiten de groep staan met opzet: /inloggen (je moet erin kunnen), /onboarding
 * (anders stuurt de poort zichzelf in een kringetje) en /api (die geeft JSON,
 * geen redirect naar een scherm).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await gateOnboarding();
  return <>{children}</>;
}
