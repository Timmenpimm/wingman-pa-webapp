import { describe, expect, it } from "vitest";
import { asPermission, gate } from "@/lib/tools/permission";
import { assertNoMailSending, findTool, toolCatalog } from "@/lib/tools/registry";
import { asToolError } from "@/lib/tools/execute";
import { ToolError, type Permission, type ToolEffect } from "@/lib/tools/types";

const base = {
  connectorLabel: "Gmail",
  connectorStatus: "active" as const,
  permission: "propose" as Permission,
  effect: "read" as ToolEffect,
};

describe("permissiepoort", () => {
  it("laat lezen toe in elke stand", () => {
    for (const permission of ["propose", "draft", "act_and_report", "silent"] as Permission[]) {
      const verdict = gate({ ...base, permission, effect: "read" });
      expect(verdict.allow, permission).toBe(true);
      expect(verdict.allow && verdict.requiresApproval).toBe(false);
    }
  });

  it("vraagt bij 'voorstellen' om een ja, ook voor een concept", () => {
    for (const effect of ["draft", "write"] as ToolEffect[]) {
      const verdict = gate({ ...base, permission: "propose", effect });
      expect(verdict.allow).toBe(true);
      expect(verdict.allow && verdict.requiresApproval, effect).toBe(true);
    }
  });

  it("laat 'concept maken' concepten doen, maar niet schrijven", () => {
    expect(gate({ ...base, permission: "draft", effect: "draft" })).toMatchObject({
      allow: true,
      requiresApproval: false,
    });
    expect(gate({ ...base, permission: "draft", effect: "write" })).toMatchObject({
      allow: true,
      requiresApproval: true,
    });
  });

  it("meldt alleen bij 'doen en melden', niet bij 'stil doen'", () => {
    expect(gate({ ...base, permission: "act_and_report", effect: "write" })).toMatchObject({
      allow: true,
      requiresApproval: false,
      notify: true,
    });
    expect(gate({ ...base, permission: "silent", effect: "write" })).toMatchObject({
      allow: true,
      requiresApproval: false,
      notify: false,
    });
  });

  it("meldt niet wat de gebruiker zelf net heeft goedgekeurd", () => {
    const verdict = gate({ ...base, permission: "propose", effect: "write" });
    expect(verdict.allow && verdict.notify).toBe(false);
  });

  it("blokkeert op de staat van de connector vóór de permissie", () => {
    // "stil doen" is de ruimste stand; een verlopen token wint daar alsnog van.
    const verlopen = gate({
      ...base,
      permission: "silent",
      effect: "write",
      connectorStatus: "reauth_required",
    });
    expect(verlopen.allow).toBe(false);
    expect(!verlopen.allow && verlopen.error.code).toBe("Authentication");

    const weg = gate({ ...base, permission: "silent", connectorStatus: "not_connected" });
    expect(!weg.allow && weg.error.code).toBe("ConnectorOffline");
  });

  it("laat lezen van een bron in error toe, maar geen handelen", () => {
    expect(gate({ ...base, connectorStatus: "error", effect: "read" }).allow).toBe(true);
    expect(
      gate({ ...base, connectorStatus: "error", effect: "write", permission: "silent" }).allow,
    ).toBe(false);
  });

  it("valt terug op de strengste stand bij onzin in de database", () => {
    expect(asPermission("act_and_report")).toBe("act_and_report");
    expect(asPermission("")).toBe("propose");
    expect(asPermission("admin")).toBe("propose");
  });
});

describe("registry", () => {
  it("kent elke tool onder een unieke naam", () => {
    const names = toolCatalog().map((t) => t.tool.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it("gooit een herkenbare fout op een onbekende naam", () => {
    expect(() => findTool("gmail.send_now")).toThrowError(ToolError);
  });

  // CLAUDE.md, regel 5. Geen review-afspraak maar een test: wie hier een
  // verstuur-tool toevoegt, ziet het vóór de merge.
  it("heeft geen enkele mailtool die naar buiten schrijft", () => {
    expect(() => assertNoMailSending()).not.toThrow();
  });

  it("geeft de bank geen tools — die is alleen-lezen (§6.7)", () => {
    expect(toolCatalog().filter((t) => t.type === "bank")).toHaveLength(0);
  });
});

describe("parametervalidatie", () => {
  it("weigert een agenda-afspraak zonder geldige tijden", () => {
    const { tool } = findTool("calendar.create_event");
    expect(tool.params.safeParse({ title: "Koffie" }).success).toBe(false);
    expect(
      tool.params.safeParse({
        title: "Koffie",
        start: "2026-08-07T10:00:00+02:00",
        end: "2026-08-07T11:00:00+02:00",
      }).success,
    ).toBe(true);
  });

  it("weigert een concept-mail zonder geldig adres", () => {
    const { tool } = findTool("gmail.draft_reply");
    expect(
      tool.params.safeParse({ to: "geen adres", subject: "Hoi", body: "Tekst" }).success,
    ).toBe(false);
  });

  it("zet geen mailinhoud in de samenvatting", () => {
    const { tool } = findTool("gmail.draft_reply");
    const summary = tool.describe({
      to: "stijn@voetstepp.nl",
      subject: "Flyers",
      body: "Vertrouwelijke tekst die niemand in een melding hoort te zien.",
    });
    expect(summary).not.toContain("Vertrouwelijke");
    expect(summary).toContain("stijn@voetstepp.nl");
  });
});

describe("foutvertaling", () => {
  it("herkent een verlopen koppeling in een ruwe adapterfout", () => {
    expect(asToolError(new Error("Gmail HTTP 401"), "Gmail").code).toBe("Authentication");
    expect(asToolError(new Error("Google Calendar 429"), "Agenda").code).toBe("RateLimit");
    expect(asToolError(new Error("Google Calendar 403"), "Agenda").code).toBe("Permission");
    expect(asToolError(new Error("socket hang up"), "Agenda").code).toBe("ToolFailed");
  });

  it("laat een al vertaalde fout ongemoeid", () => {
    const original = new ToolError("Timeout", "duurde te lang");
    expect(asToolError(original, "Gmail")).toBe(original);
  });
});
