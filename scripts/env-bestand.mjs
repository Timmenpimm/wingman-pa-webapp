/**
 * De redeneerbare helft van scripts/google-sleutels.mjs: lezen en schrijven in
 * een .env-bestand, zonder terminal en zonder bestandssysteem.
 *
 * Apart bestand omdat het andere deel per definitie alleen interactief werkt —
 * je kunt een "typ hier je secret"-prompt niet in een test nadoen. Zo blijft
 * het stuk waar echt iets fout kan gaan (een bestaande regel verkeerd
 * overschrijven, een comment slopen) wél toetsbaar. Zie tests/env-bestand.test.ts.
 */

/** De waarde van een sleutel, of null als hij ontbreekt of leeg is. */
export function huidigeWaarde(inhoud, sleutel) {
  const regel = inhoud.split("\n").find((r) => r.startsWith(`${sleutel}=`));
  if (!regel) return null;
  const waarde = regel.slice(sleutel.length + 1).trim().replace(/^["']|["']$/g, "");
  return waarde || null;
}

/**
 * Vervangt de regel als de sleutel er al staat, plakt hem er anders achter.
 *
 * Nooit het hele bestand herschrijven: er staan comments en andere sleutels in
 * die je niet kwijt wilt — en juist een .env die je één keer stilletjes
 * halveert, kost een avond zoeken.
 */
export function zet(inhoud, sleutel, waarde) {
  const regel = `${sleutel}="${waarde}"`;
  const regels = inhoud.split("\n");
  const i = regels.findIndex((r) => r.startsWith(`${sleutel}=`));
  if (i >= 0) {
    regels[i] = regel;
    return regels.join("\n");
  }
  return `${inhoud.replace(/\n*$/, "")}\n${regel}\n`.replace(/^\n/, "");
}

/** Genoeg om een typefout of een half geplakte waarde te vangen, meer niet. */
export function controleer(id, secret) {
  const klachten = [];
  if (!id.endsWith(".apps.googleusercontent.com")) {
    klachten.push("de client ID eindigt normaal op .apps.googleusercontent.com");
  }
  if (!secret.startsWith("GOCSPX-")) {
    klachten.push("de client secret begint normaal met GOCSPX-");
  }
  if (id.includes(" ") || secret.includes(" ")) {
    klachten.push("er zit een spatie in — waarschijnlijk half geplakt");
  }
  return klachten;
}
