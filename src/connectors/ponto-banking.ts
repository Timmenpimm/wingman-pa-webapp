import type {
  AdapterContext,
  ConnectorAdapter,
  ConnectorHealth,
  NormalizedTransaction,
} from "@/lib/types";

/**
 * Ponto (Isabel Group) → NormalizedTransaction. Eén flow voor alle Europese banken.
 *
 * PSD2-consent verloopt na 90 dagen. Dat is geen randgeval maar een terugkerende
 * UI-staat: de gebruiker moet de vervaldatum zien vóórdat de briefing stilletjes
 * incompleet wordt (§6.7, §9.3). health() geeft daarom consent_expires_at terug,
 * ook als de connector verder gezond is.
 *
 * Bank is standaard alleen-lezen + categoriseren. Nooit betalingen initiëren.
 */
export const pontoBanking: ConnectorAdapter<NormalizedTransaction> = {
  provider: "ponto",
  type: "bank",

  async fetchDelta(ctx: AdapterContext, since?: Date): Promise<NormalizedTransaction[]> {
    if (!ctx.accessToken) return [];

    const res = await fetch(
      `https://api.myponto.com/accounts/${ctx.accountId}/transactions?limit=100`,
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
    );
    if (!res.ok) throw new Error(`Ponto HTTP ${res.status}`);

    const body = (await res.json()) as { data?: PontoTx[]; meta?: { account?: PontoAccount } };
    const acct = body.meta?.account;
    const cutoff = since?.getTime() ?? 0;
    const now = new Date();

    return (body.data ?? [])
      .map((tx) => {
        const bookedAt = new Date(tx.attributes.executionDate ?? tx.attributes.valueDate);
        return {
          id: `ponto:${tx.id}`,
          provider: "ponto" as const,
          account_id: ctx.accountId,
          bank_account: {
            iban: acct?.attributes.reference ?? "",
            name: acct?.attributes.description ?? "Betaalrekening",
            currency: acct?.attributes.currency ?? "EUR",
          },
          amount: tx.attributes.amount,
          currency: tx.attributes.currency ?? "EUR",
          booked_at: bookedAt,
          value_date: tx.attributes.valueDate ? new Date(tx.attributes.valueDate) : undefined,
          counterparty: tx.attributes.counterpartName
            ? {
                name: tx.attributes.counterpartName,
                iban: tx.attributes.counterpartReference,
              }
            : undefined,
          remittance_information: tx.attributes.remittanceInformation,
          transaction_type: mapType(tx.attributes.bankTransactionCode),
          status: "booked" as const,
          raw: tx,
          synced_at: now,
        };
      })
      .filter((tx) => tx.booked_at.getTime() >= cutoff);
  },

  async health(ctx: AdapterContext): Promise<ConnectorHealth> {
    if (!ctx.accessToken) return { status: "not_connected" };
    const res = await fetch(`https://api.myponto.com/accounts/${ctx.accountId}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });
    if (res.status === 401 || res.status === 403) return { status: "reauth_required" };
    if (!res.ok) return { status: "error", error_message: `HTTP ${res.status}` };

    const body = (await res.json()) as { data?: PontoAccount };
    const auth = body.data?.attributes.authorizationExpirationExpectedAt;
    return {
      status: "active",
      last_sync_at: new Date(),
      consent_expires_at: auth ? new Date(auth) : undefined,
    };
  },
};

function mapType(code?: string): NormalizedTransaction["transaction_type"] {
  const c = (code ?? "").toLowerCase();
  if (c.includes("card")) return "card";
  if (c.includes("dd") || c.includes("direct")) return "direct_debit";
  if (c.includes("standing")) return "standing_order";
  if (c.includes("fee") || c.includes("charge")) return "fee";
  if (c.includes("interest")) return "interest";
  if (c.includes("transfer") || c.includes("sepa")) return "transfer";
  return "other";
}

interface PontoTx {
  id: string;
  attributes: {
    amount: number;
    currency?: string;
    executionDate?: string;
    valueDate: string;
    counterpartName?: string;
    counterpartReference?: string;
    remittanceInformation?: string;
    bankTransactionCode?: string;
  };
}

interface PontoAccount {
  id: string;
  attributes: {
    reference: string;
    description?: string;
    currency?: string;
    authorizationExpirationExpectedAt?: string;
  };
}
