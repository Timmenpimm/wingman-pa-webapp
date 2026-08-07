import { execSync } from "node:child_process";

/**
 * Draait `prisma migrate deploy` tijdens de Vercel-build — maar alleen voor
 * production. Preview-deploys van open PR's zouden anders hun migraties al
 * op de database zetten vóórdat de PR gereviewd of gemerged is; een schema
 * hoort pas te veranderen op het moment dat de code die erbij hoort ook
 * live gaat.
 *
 * Lokaal (geen VERCEL_ENV) doet dit script niets: `npm run build` blijft
 * migratievrij, precies zoals DEPLOY.md §1 het wil — dev-schema gaat bewust,
 * niet als bijwerking van een build.
 */
const env = process.env.VERCEL_ENV;

if (env !== "production") {
  console.log(`migrate-bij-deploy: ${env ?? "lokale build"} — migraties overgeslagen.`);
  process.exit(0);
}

execSync("npx prisma migrate deploy", { stdio: "inherit" });
