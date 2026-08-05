import nodemailer from "nodemailer";

/**
 * Verstuurt de inloglink. Bestaat alleen als AUTH_EMAIL_SERVER is gezet — de
 * aanroeper (src/app/api/auth/magic-link/route.ts) checkt dat zelf en laat
 * deze functie ongebruikt als mailen niet is ingesteld. Geen fallback die
 * doet alsof er iets verstuurd is.
 */
export async function sendMagicLinkMail(to: string, url: string): Promise<void> {
  const server = process.env.AUTH_EMAIL_SERVER;
  if (!server) {
    throw new Error("AUTH_EMAIL_SERVER ontbreekt — sendMagicLinkMail() mag hier niet aangeroepen worden.");
  }
  const from = process.env.AUTH_EMAIL_FROM || "Wingman <noreply@wingman.app>";

  const transport = nodemailer.createTransport(server);
  await transport.sendMail({
    to,
    from,
    subject: "Je inloglink voor Wingman",
    text: `Klik op deze link om in te loggen bij Wingman. Hij is 15 minuten geldig.\n\n${url}\n\nHeb je dit niet aangevraagd? Dan kun je deze mail negeren.`,
    html: `<p>Klik op onderstaande link om in te loggen bij Wingman. Hij is 15 minuten geldig.</p><p><a href="${url}">${url}</a></p><p>Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>`,
  });
}
