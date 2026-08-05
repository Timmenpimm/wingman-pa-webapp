/**
 * Bewijst dat row-level security echt afschermt.
 *
 * Lokaal: npm run rls:bewijs (leest .env). In CI staan DATABASE_URL en
 * DIRECT_URL al in de omgeving, dan volstaat `node scripts/rls-bewijs.mjs`.
 *
 * Niet: "de policy staat er". Wel: gebruiker A vraagt expliciet naar de rijen
 * van gebruiker B en krijgt ze niet — ook niet met een where op B's id.
 */
import { PrismaClient } from "@prisma/client";

const eigenaar = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const app = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const alsGebruiker = (userId, fn) =>
  app.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });

let fouten = 0;
const check = (naam, goed, detail = "") => {
  console.log(`${goed ? "  ok  " : "  FOUT"} ${naam}${detail ? ` — ${detail}` : ""}`);
  if (!goed) fouten++;
};

const a = await eigenaar.user.findUniqueOrThrow({ where: { email: "nora@voorbeeld.nl" } });

// Tweede gebruiker met één eigen open eindje.
const b = await eigenaar.user.upsert({
  where: { email: "test@voorbeeld.nl" },
  update: {},
  create: { email: "test@voorbeeld.nl", name: "Testgebruiker" },
});
const geheim = await eigenaar.commitment.create({
  data: {
    user_id: b.id,
    source: "manual",
    source_ref: "bewijs",
    direction: "i_owe",
    party: "Alleen van B",
    what: "GEHEIM VAN B",
  },
});

console.log("\nRLS-bewijs\n");

const vanA = await alsGebruiker(a.id, (tx) => tx.commitment.findMany());
check("A ziet alleen eigen open eindjes", vanA.every((c) => c.user_id === a.id), `${vanA.length} rijen`);
check("A ziet B's rij niet", !vanA.some((c) => c.id === geheim.id));

// De harde variant: expliciet naar B's rij vragen.
const gericht = await alsGebruiker(a.id, (tx) =>
  tx.commitment.findMany({ where: { user_id: b.id } }),
);
check("A krijgt niets bij een expliciete where op B", gericht.length === 0, `${gericht.length} rijen`);

const opId = await alsGebruiker(a.id, (tx) =>
  tx.commitment.findUnique({ where: { id: geheim.id } }),
);
check("A krijgt niets bij opvragen van B's id", opId === null);

// Schrijven namens een ander moet ook geweigerd worden.
let geweigerd = false;
try {
  await alsGebruiker(a.id, (tx) =>
    tx.commitment.create({
      data: { user_id: b.id, source: "manual", source_ref: "x", direction: "i_owe", party: "x", what: "smokkel" },
    }),
  );
} catch {
  geweigerd = true;
}
check("A kan geen rij voor B aanmaken", geweigerd);

// En zonder gezette gebruiker: niets.
const zonder = await app.commitment.findMany();
check("zonder app.user_id komt er niets terug", zonder.length === 0, `${zonder.length} rijen`);

// Opruimen.
await eigenaar.commitment.deleteMany({ where: { user_id: b.id } });
await eigenaar.user.delete({ where: { id: b.id } });

console.log(`\n${fouten === 0 ? "RLS schermt af." : `${fouten} controle(s) mislukt.`}\n`);
await eigenaar.$disconnect();
await app.$disconnect();
process.exit(fouten === 0 ? 0 : 1);
