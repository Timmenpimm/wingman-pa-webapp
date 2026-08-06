#!/usr/bin/env bash
#
# Zet de mailserver in voor Wingman. Draai dit zelf — de sleutel komt niet in
# een chat of een logbestand terecht.
#
#   ./scripts/setup-mail.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

echo
echo "Mailserver instellen voor Wingman (Resend)"
echo "──────────────────────────────────────────"
echo

# ── 1. Sleutel ───────────────────────────────────────────────────────────────
# read -s: geen echo op het scherm, dus ook niet in een schermopname of
# terminal-scrollback.
read -rsp "Resend API-sleutel (begint met re_, invoer blijft onzichtbaar): " SLEUTEL
echo
if [[ -z "$SLEUTEL" ]]; then
  echo "Geen sleutel ingevoerd. Gestopt." >&2
  exit 1
fi
if [[ "$SLEUTEL" != re_* ]]; then
  echo "Waarschuwing: een Resend-sleutel begint normaal met 're_'. Doorgaan? [j/N]"
  read -r ja
  [[ "$ja" == "j" ]] || exit 1
fi

# Poort 465 is impliciete TLS. Met "smtp://" praat nodemailer eerst onversleuteld
# en loopt de verbinding vast; "smtps://" is hier de juiste vorm.
SERVER="smtps://resend:${SLEUTEL}@smtp.resend.com:465"

# ── 2. Afzender ──────────────────────────────────────────────────────────────
echo
echo "Afzender. Voor een eigen domein moet dat in Resend geverifieerd zijn."
echo "Nog niet geverifieerd? Gebruik dan onboarding@resend.dev — die mag alleen"
echo "mailen naar het adres waarmee je bij Resend bent geregistreerd."
read -rp "Afzender [Wingman <onboarding@resend.dev>]: " AFZENDER
AFZENDER="${AFZENDER:-Wingman <onboarding@resend.dev>}"

# ── 3. Lokaal .env ───────────────────────────────────────────────────────────
touch .env
# Bestaande regels eruit, zodat dit script twee keer draaien geen dubbele
# variabelen oplevert.
grep -v '^AUTH_EMAIL_SERVER=' .env | grep -v '^AUTH_EMAIL_FROM=' > .env.tmp || true
mv .env.tmp .env
{
  echo ""
  echo "# Mailserver voor inloglinks en geplande momenten."
  echo "AUTH_EMAIL_SERVER=\"${SERVER}\""
  echo "AUTH_EMAIL_FROM=\"${AFZENDER}\""
} >> .env
echo "  ✓ lokaal .env bijgewerkt"

# ── 4. Vercel ────────────────────────────────────────────────────────────────
if command -v vercel >/dev/null 2>&1 && [[ -f .vercel/project.json ]]; then
  for omgeving in production preview; do
    printf '%s' "$SERVER"   | vercel env add AUTH_EMAIL_SERVER "$omgeving" --force >/dev/null 2>&1 || true
    printf '%s' "$AFZENDER" | vercel env add AUTH_EMAIL_FROM   "$omgeving" --force >/dev/null 2>&1 || true
  done
  echo "  ✓ in Vercel gezet (productie + preview)"
else
  echo "  ! Vercel-CLI of projectkoppeling ontbreekt — zet AUTH_EMAIL_SERVER en"
  echo "    AUTH_EMAIL_FROM daar met de hand."
fi

# ── 5. Proef ─────────────────────────────────────────────────────────────────
echo
read -rp "Naar welk adres mag ik een proefmail sturen? (leeg = overslaan): " NAAR
if [[ -n "$NAAR" ]]; then
  echo "  versturen…"
  AUTH_EMAIL_SERVER="$SERVER" AUTH_EMAIL_FROM="$AFZENDER" NAAR="$NAAR" \
    node --input-type=module -e '
      import nodemailer from "nodemailer";
      const t = nodemailer.createTransport(process.env.AUTH_EMAIL_SERVER);
      await t.verify();
      await t.sendMail({
        to: process.env.NAAR,
        from: process.env.AUTH_EMAIL_FROM,
        subject: "Wingman kan mailen",
        text: "Dit is de proefmail. Vanaf nu komt de ochtendbriefing om 08:00 binnen.\n",
      });
      console.log("  ✓ verstuurd naar " + process.env.NAAR);
    ' || {
      echo "  ✗ versturen mislukte. Meestal een van deze drie:" >&2
      echo "    · de sleutel klopt niet" >&2
      echo "    · de afzender is niet geverifieerd in Resend" >&2
      echo "    · met onboarding@resend.dev mag je alleen naar je eigen Resend-adres" >&2
      exit 1
    }
fi

echo
echo "Klaar. Nog één ding: de app stuurt naar het e-mailadres van het account."
echo "Dat is nu 'nora@voorbeeld.nl' — een verzonnen adres, daar komt niets aan."
echo "Draai ./scripts/set-mijn-adres.sh om daar jouw echte adres van te maken."
echo
