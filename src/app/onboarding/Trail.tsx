import Link from "next/link";
import { stepPath, type StepId, type StepState } from "@/lib/onboarding/steps";

/**
 * Het spoor bovenaan de wizard: waar je bent en hoeveel er nog komt.
 *
 * Vier korte woorden, geen voortgangsbalk met percentage. Een percentage
 * suggereert dat de laatste stap net zo veel weegt als de eerste, en dat is
 * hier niet zo — de agenda draagt de hele app, meldingen zijn een instelling.
 *
 * Terug mag: een stap die je al hebt gehad is klikbaar, zodat je een permissie
 * kunt bijstellen zonder de hele reeks opnieuw te lopen. Vooruit springen naar
 * iets dat nog niet aan de beurt is, kan niet — dat is geen slot maar een
 * richting.
 */
export function Trail({ steps, current }: { steps: StepState[]; current: StepId }) {
  const currentNumber = steps.find((s) => s.id === current)?.number ?? 1;

  return (
    <ol className="trail" aria-label="Voortgang">
      {steps.map((step) => {
        const isCurrent = step.id === current;
        const reachable = step.done || step.number <= currentNumber;

        return (
          <li key={step.id} className="trail__item" data-done={step.done} data-current={isCurrent}>
            {reachable && !isCurrent ? (
              <Link href={stepPath(step.id)}>{step.short}</Link>
            ) : (
              <span aria-current={isCurrent ? "step" : undefined}>{step.short}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
