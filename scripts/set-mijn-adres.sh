#!/usr/bin/env bash
#
# Zet het e-mailadres van het demo-account op jouw echte adres, zodat de
# geplande momenten ergens aankomen. Het account heet nu nora@voorbeeld.nl —
# een verzonnen adres uit de seed, waar per definitie niets bezorgd wordt.
#
# Draait tegen productie. Het wachtwoord van het account verandert niet.
#
#   ./scripts/set-mijn-adres.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

echo
echo "E-mailadres van het account wijzigen"
echo "────────────────────────────────────"
echo

read -rp "Jouw e-mailadres: " ADRES
if [[ ! "$ADRES" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "Dat ziet er niet uit als een e-mailadres. Gestopt." >&2
  exit 1
fi

echo
echo "Tegen welke database? Voor productie heb je de eigenaars-URL nodig"
echo "(Supabase, poort 5432). Leeg = de lokale ontwikkeldatabase uit .env."
read -rsp "DIRECT_URL (onzichtbaar, leeg = lokaal): " URL
echo

if [[ -z "$URL" ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
  URL="$DIRECT_URL"
  echo "  → lokale database"
else
  echo "  → opgegeven database"
fi

DIRECT_URL="$URL" ADRES="$ADRES" node --input-type=module -e '
  import { PrismaClient } from "@prisma/client";
  const p = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
  const oud = await p.user.findFirst({ where: { email: "nora@voorbeeld.nl" } });
  if (!oud) {
    const bestaat = await p.user.findUnique({ where: { email: process.env.ADRES } });
    console.log(bestaat ? "  ✓ dit adres staat er al op" : "  ! demo-account niet gevonden");
    await p.$disconnect();
    process.exit(bestaat ? 0 : 1);
  }
  await p.user.update({ where: { id: oud.id }, data: { email: process.env.ADRES } });
  console.log("  ✓ account staat nu op " + process.env.ADRES);
  console.log("    Inloggen doe je vanaf nu met dit adres; het wachtwoord blijft hetzelfde.");
  await p.$disconnect();
'

echo
echo "Let op: de seed zet het adres terug op nora@voorbeeld.nl. Draai dit"
echo "script opnieuw als je de database opnieuw vult."
echo
