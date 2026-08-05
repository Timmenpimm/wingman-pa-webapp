/**
 * Rooktest tegen een draaiende app.
 *
 * Dit is de controle die de echte fouten ving: een productie-URL die open
 * stond, en API-routes die zonder sessie data teruggaven. Met de hand is dat
 * elke keer tien curl-commando's; hier is het één opdracht die faalt met een
 * exitcode, zodat CI het kan tegenhouden.
 *
 *   npm run smoke                       # tegen localhost:3111
 *   BASIS=https://… npm run smoke       # tegen een deploy
 *   WACHTWOORD=… npm run smoke          # ook de ingelogde kant testen
 */

const BASIS = process.env.BASIS ?? "http://localhost:3111";
const EMAIL = process.env.EMAIL ?? "nora@voorbeeld.nl";
const WACHTWOORD = process.env.WACHTWOORD ?? process.env.SEED_PASSWORD ?? "lokaal";

const PAGINAS = [
  "/",
  "/open-eindjes",
  "/inbox",
  "/projecten",
  "/week",
  "/stijlkaart",
  "/graaf",
  "/instellingen",
  "/onboarding",
];

const APIS = [
  "/api/v1/briefing/today",
  "/api/v1/commitments/open",
  "/api/v1/connectors",
  "/api/v1/inbox",
  "/api/v1/style-card",
  "/api/v1/export",
  "/api/v1/graph/cluster",
];

let mislukt = 0;

function check(naam, goed, detail = "") {
  console.log(`${goed ? "  ok  " : "  FOUT"} ${naam}${detail ? ` — ${detail}` : ""}`);
  if (!goed) mislukt++;
}

async function haal(pad, opties = {}) {
  return fetch(`${BASIS}${pad}`, { redirect: "manual", ...opties });
}

console.log(`\nRooktest tegen ${BASIS}\n`);

console.log("Zonder sessie mag niets bereikbaar zijn:");
for (const pad of PAGINAS) {
  const res = await haal(pad);
  const naarInloggen = (res.headers.get("location") ?? "").includes("/inloggen");
  check(`pagina ${pad}`, res.status === 307 && naarInloggen, `HTTP ${res.status}`);
}
for (const pad of APIS) {
  const res = await haal(pad);
  const body = await res.text();
  // Niet alleen de status: een 401 met data erin is nog steeds een lek.
  const leeg = !/frog|counterparty|iban|password|access_token/i.test(body);
  check(`api ${pad}`, res.status === 401 && leeg, `HTTP ${res.status}`);
}

console.log("\nHet inlogscherm moet juist wél open zijn:");
check("/inloggen", (await haal("/inloggen")).status === 200);

console.log("\nInloggen:");
const koekjes = new Map();
function bewaar(res) {
  for (const [k, v] of res.headers) {
    if (k.toLowerCase() === "set-cookie") {
      for (const stuk of v.split(/,(?=[^;]+=)/)) {
        const [naam, waarde] = stuk.split(";")[0].split("=");
        if (naam && waarde !== undefined) koekjes.set(naam.trim(), waarde);
      }
    }
  }
}
function kop() {
  return Array.from(koekjes, ([k, v]) => `${k}=${v}`).join("; ");
}

let res = await haal("/api/auth/csrf");
bewaar(res);
const { csrfToken } = await res.json();

res = await haal("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: kop() },
  body: new URLSearchParams({ csrfToken, email: EMAIL, password: "beslist-onjuist", callbackUrl: "/" }),
});
check("fout wachtwoord geeft geen toegang", (res.headers.get("location") ?? "").includes("error"));
check(
  "en de api blijft dicht",
  (await haal("/api/v1/briefing/today", { headers: { cookie: kop() } })).status === 401,
);

res = await haal("/api/auth/csrf", { headers: { cookie: kop() } });
bewaar(res);
const { csrfToken: token2 } = await res.json();
res = await haal("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: kop() },
  body: new URLSearchParams({ csrfToken: token2, email: EMAIL, password: WACHTWOORD, callbackUrl: "/" }),
});
bewaar(res);
check("juist wachtwoord geeft een sessie", !(res.headers.get("location") ?? "").includes("error"));

console.log("\nMet sessie moet de app werken:");
res = await haal("/", { headers: { cookie: kop() } });
check("pagina /", res.status === 200);
res = await haal("/api/v1/briefing/today", { headers: { cookie: kop() } });
const briefing = res.status === 200 ? await res.json() : null;
check("briefing komt terug", Boolean(briefing?.frog?.title), briefing?.frog?.title ?? "geen frog");
check("maximaal drie prioriteiten", (briefing?.priorities?.length ?? 9) <= 3);

console.log(`\n${mislukt === 0 ? "Alles goed." : `${mislukt} controle(s) mislukt.`}\n`);
process.exit(mislukt === 0 ? 0 : 1);
