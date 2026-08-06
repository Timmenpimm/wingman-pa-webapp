import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/db/client";
import { onboardingStatus } from "@/lib/onboarding/status";
import { FINISH_PATH, firstOpenStep, stepPath } from "@/lib/onboarding/steps";

export const dynamic = "force-dynamic";

/**
 * /onboarding is geen scherm meer maar een wissel: hij zet je op de eerste
 * stap die nog aandacht vraagt. Wie halverwege afhaakte en later terugkomt,
 * komt daardoor terug waar hij gebleven was — zonder dat er een stapteller
 * bijgehouden hoeft te worden die uit de pas kan gaan lopen met de bronnen die
 * er echt zijn (zie src/lib/onboarding/steps.ts).
 *
 * De bestaande links naar /onboarding (Vandaag op een lege dag, Open eindjes)
 * blijven hierdoor werken.
 */
export default async function OnboardingPage() {
  const userId = await currentUserId();
  const { steps } = await onboardingStatus(userId);
  const open = firstOpenStep(steps);
  redirect(open ? stepPath(open) : FINISH_PATH);
}
