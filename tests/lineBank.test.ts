import { describe, expect, it } from "vitest";
import { addToBank, bankEntries, isLineBankName, lineBankName, removeFromBank } from "../src/fountain/lineBank";

describe("line bank", () => {
  it("starts a bank with a heading and adds entries at the end", () => {
    let bank = addToBank("", "I never liked this house.");
    bank = addToBank(bank, "NORA\nYou always say that.");
    expect(bank).toBe("# Line bank\n\nI never liked this house.\n\nNORA\nYou always say that.\n");
    expect(bankEntries(bank)).toEqual(["I never liked this house.", "NORA\nYou always say that."]);
  });

  it("keeps an entry together, without blank lines inside it", () => {
    expect(bankEntries(addToBank("", "  NORA\n\nHello.  \n"))).toEqual(["NORA\nHello."]);
    expect(addToBank("# Line bank\n", "   ")).toBe("# Line bank\n");
  });

  it("removes an entry, and leaves the bank alone if it isn't there", () => {
    const bank = "# Line bank\n\nOne.\n\nTwo.\n\nThree.\n";
    expect(removeFromBank(bank, "Two.")).toBe("# Line bank\n\nOne.\n\nThree.\n");
    expect(removeFromBank(bank, "Three.")).toBe("# Line bank\n\nOne.\n\nTwo.\n");
    expect(removeFromBank(bank, "Four.")).toBe(bank);
    expect(removeFromBank("# Line bank\n\nOne.\n", "One.")).toBe("# Line bank\n");
  });

  it("removes an entry edited by hand with space at the ends of its lines", () => {
    const bank = "# Line bank\n\nNORA  \nHello. \n\nTwo.\n";
    const [entry] = bankEntries(bank);
    expect(removeFromBank(bank, entry)).toBe("# Line bank\n\nTwo.\n");
  });

  it("takes an entry out and puts it back at the end, as undo does", () => {
    const bank = "# Line bank\n\nOne.\n\nTwo.\n";
    expect(addToBank(removeFromBank(bank, "One."), "One.")).toBe("# Line bank\n\nTwo.\n\nOne.\n");
  });

  it("names the bank after the play", () => {
    expect(lineBankName("Play")).toBe("Play - Line bank");
    expect(lineBankName("Still: A Play?")).toBe("Still A Play - Line bank");
    expect(isLineBankName("Play - Line bank")).toBe(true);
    expect(isLineBankName("Play")).toBe(false);
  });
});
