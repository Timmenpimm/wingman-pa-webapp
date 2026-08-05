import { describe, expect, it } from "vitest";
import { safeReturnPath } from "@/lib/return-path";

/**
 * Een inlogscherm dat een aanvaller kan laten doorsturen is de standaardopzet
 * van phishing. "Begint met /" is niet genoeg: //host is protocol-relatief.
 */
describe("doorsturen na inloggen", () => {
  it("laat een eigen pad door", () => {
    expect(safeReturnPath("/graaf")).toBe("/graaf");
    expect(safeReturnPath("/projecten/abc?x=1")).toBe("/projecten/abc?x=1");
  });

  it("weigert een protocol-relatieve URL", () => {
    expect(safeReturnPath("//kwaadaardig.nl")).toBe("/");
    expect(safeReturnPath("%2F%2Fkwaadaardig.nl")).toBe("/");
  });

  it("weigert een absolute URL", () => {
    expect(safeReturnPath("https://kwaadaardig.nl")).toBe("/");
  });

  it("weigert backslash- en newline-trucs", () => {
    expect(safeReturnPath("/\\kwaadaardig.nl")).toBe("/");
    expect(safeReturnPath("/pad\nLocation: https://kwaadaardig.nl")).toBe("/");
  });

  it("valt terug op de homepage zonder waarde", () => {
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath("")).toBe("/");
  });
});
