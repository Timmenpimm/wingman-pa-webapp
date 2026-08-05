import { NextResponse } from "next/server";

/**
 * Een POST zonder body liet `req.json()` gooien, wat Next als een lege 500
 * naar buiten bracht: geen status die iets zegt, geen foutmelding om op te
 * handelen. Een client die dat krijgt kan niet zien of hij zelf iets fout deed
 * of dat de server stuk is.
 *
 * Alle routes lezen hun body dus hierlangs: ontbrekende of ongeldige JSON is
 * een 400 met een leesbare reden.
 */
export async function readJson<T extends object>(req: Request): Promise<T | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" ? (body as T) : null;
  } catch {
    return null;
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
