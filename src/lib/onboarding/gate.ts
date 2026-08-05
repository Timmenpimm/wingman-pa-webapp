import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/db/client";
import { onboardingStatus } from "./status";
import { firstOpenStep, hasStartedOnboarding, stepPath } from "./steps";

/**
 * De poort voor de eerste keer.
 *
 * Wie nog nooit een bron heeft gekoppeld of overgeslagen, landde na het
 * inloggen op Vandaag: een lege briefing met zes navigatie-ingangen naar
 * schermen die allemaal niets te melden hebben. De onboarding was een linkje
 * in die leegte. Nu is het andersom — zolang er nog niets besloten is, ís de
 * wizard het scherm.
 *
 * Hij staat in het layout van de route-groep `(app)` en niet in elke pagina
 * apart: zo is een nieuw scherm automatisch gedekt in plaats van dat iemand
 * eraan moet denken. Middleware kan dit niet doen — die draait in de
 * Edge-runtime en komt niet bij Prisma (zie src/middleware.ts).
 *
 * De poort gaat open zodra er íéts besloten is, ook als dat "overslaan" was.
 * Niet pas als de onboarding helemaal af is: iemand die de bank bewust laat
 * liggen mag daar niet elke keer opnieuw naartoe geduwd worden.
 */
export async function gateOnboarding(): Promise<void> {
  const userId = await currentUserId();
  const { steps, finishedAt } = await onboardingStatus(userId);
  if (hasStartedOnboarding(steps, finishedAt)) return;

  const open = firstOpenStep(steps);
  if (open) redirect(stepPath(open));
}
