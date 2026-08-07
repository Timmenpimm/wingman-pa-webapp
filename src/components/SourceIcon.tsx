import type { Icon } from "@phosphor-icons/react";
import {
  Bank,
  CalendarBlank,
  ChatCircleDots,
  EnvelopeSimple,
  Lightning,
  PaperPlaneTilt,
} from "@phosphor-icons/react/dist/ssr";

/**
 * Klein gekleurd icoonbadge per bron — getemperde merktint, geen neon: dit
 * blijft het rustige navy-palet, niet de volle Google/Gmail/WhatsApp-kleuren
 * uit het losse referentiebeeld. Eén plek voor de mapping zodat Vandaag,
 * Inbox, Open eindjes en Instellingen dezelfde badge tonen voor dezelfde bron.
 */
export type SourceKind =
  | "email"
  | "calendar"
  | "chat"
  | "inference"
  | "manual"
  | "voice"
  | "app"
  | "siri"
  | "capture"
  | "mail_forward"
  | "telegram"
  | "google"
  | "caldav"
  | "gmail"
  | "imap"
  | "ponto";

const KIND_META: Record<SourceKind, { icon: Icon; tint: string; label: string }> = {
  email: { icon: EnvelopeSimple, tint: "#e2986b", label: "Mail" },
  calendar: { icon: CalendarBlank, tint: "#6b9be2", label: "Agenda" },
  chat: { icon: ChatCircleDots, tint: "#67c98c", label: "Chat" },
  inference: { icon: Lightning, tint: "#b892e8", label: "Afgeleid" },
  manual: { icon: PaperPlaneTilt, tint: "#8da2b8", label: "Notitie" },
  voice: { icon: PaperPlaneTilt, tint: "#8da2b8", label: "Siri" },
  app: { icon: PaperPlaneTilt, tint: "#8da2b8", label: "App" },
  siri: { icon: PaperPlaneTilt, tint: "#8da2b8", label: "Siri" },
  capture: { icon: PaperPlaneTilt, tint: "#8da2b8", label: "Capture" },
  mail_forward: { icon: EnvelopeSimple, tint: "#e2986b", label: "Doorgestuurde mail" },
  telegram: { icon: ChatCircleDots, tint: "#67c98c", label: "Telegram" },
  google: { icon: CalendarBlank, tint: "#6b9be2", label: "Google Agenda" },
  caldav: { icon: CalendarBlank, tint: "#6b9be2", label: "Apple / CalDAV" },
  gmail: { icon: EnvelopeSimple, tint: "#e2986b", label: "Gmail" },
  imap: { icon: EnvelopeSimple, tint: "#e2986b", label: "IMAP" },
  ponto: { icon: Bank, tint: "#d7a850", label: "Bank via Ponto" },
};

export function SourceIcon({
  kind,
  size = "md",
}: {
  kind: string;
  size?: "sm" | "md";
}) {
  const meta = KIND_META[kind as SourceKind] ?? KIND_META.manual;
  const Icon = meta.icon;
  return (
    <span
      className={`source-icon source-icon--${size}`}
      style={{ "--source-tint": meta.tint } as React.CSSProperties}
      aria-hidden="true"
      title={meta.label}
    >
      <Icon weight="fill" />
    </span>
  );
}
