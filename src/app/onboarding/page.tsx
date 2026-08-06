import Link from "next/link";
import { redirect } from "next/navigation";
import { Compass } from "@phosphor-icons/react/dist/ssr";
import { currentUserId } from "@/lib/db/client";
import { onboardingStatus } from "@/lib/onboarding/status";
import { FINISH_PATH, firstOpenStep, stepPath } from "@/lib/onboarding/steps";
import { Trail } from "./Trail";
import "./onboarding.css";

export const dynamic = "force-dynamic";

/**
 * /onboarding — voor wie nog nérgens aan begonnen is het intro-scherm
 * (referentie 2.png): wat er komt, in vier genummerde stappen, en één rustige
 * startknop.
 *
 * Voor iedereen die al een keuze maakte blijft dit een wissel: je komt terug
 * waar je gebleven was, zonder dat er een stapteller bijgehouden hoeft te
 * worden die uit de pas kan lopen met de bronnen die er echt zijn (zie
 * src/lib/onboarding/steps.ts). De bestaande links naar /onboarding (Vandaag
 * op een lege dag, Open eindjes) blijven daardoor werken.
 */
export default async function OnboardingPage() {
  const userId = await currentUserId();
  const { steps } = await onboardingStatus(userId);
  const open = firstOpenStep(steps);

  if (!open) redirect(FINISH_PATH);
  if (steps.some((s) => s.done)) redirect(stepPath(open));

  return (
    <div className="ob-step ob-intro">
      <Trail steps={steps} current={open} />

      <div className="ob-feature" aria-hidden="true">
        <Compass weight="regular" />
      </div>

      <h1 className="screen-title">Eerst jouw ritme.</h1>
      <p className="lede ob-intro__lede">
        Vier korte stappen. Daarna staat je dagbriefing klaar.
      </p>

      <ol className="ob-introlist">
        {steps.map((step) => (
          <li key={step.id} data-active={step.id === open}>
            <span className="ob-num" aria-hidden="true">
              {step.number}
            </span>
            <span>{step.title}</span>
          </li>
        ))}
      </ol>

      <div className="btn-row wizard__actions">
        <Link className="btn btn--primary" href={stepPath(open)}>
          Begin rustig
        </Link>
      </div>
    </div>
  );
}
