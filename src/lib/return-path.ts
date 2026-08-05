/**
 * Waar mag je na het inloggen naartoe?
 *
 * "Begint met een /" is niet genoeg: `//kwaadaardig.nl` begint ook met een
 * slash en is een protocol-relatieve URL — de browser stuurt je dan naar een
 * andere site. Een inlogscherm dat een aanvaller kan laten doorsturen is
 * precies de opzet van een phishing-flow, dus alles wat niet aantoonbaar een
 * eigen pad is, gaat naar de homepage.
 *
 * Staat hier en niet in de pagina zelf: een Next.js-pagina mag alleen bekende
 * velden exporteren (default, metadata, dynamic, …). Een extra export laat
 * `next build` struikelen, ook al vindt `tsc` het prima.
 */
export function safeReturnPath(raw?: string): string {
  if (!raw) return "/";
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  const path = decoded.trim();
  if (!path.startsWith("/")) return "/";
  if (path.startsWith("//")) return "/"; // protocol-relatief
  if (path.startsWith("/\\")) return "/"; // backslash: sommige browsers lezen dit als //
  if (/[\r\n]/.test(path)) return "/"; // header-injectie
  return path;
}
