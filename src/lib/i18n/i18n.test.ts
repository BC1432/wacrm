import { describe, expect, it } from "vitest";

import en from "./en.json";
import es from "./es.json";
import { translate } from "./translate";

type Dictionary = { [key: string]: string | Dictionary };

function flattenKeys(dict: Dictionary, prefix = ""): string[] {
  return Object.entries(dict).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

const placeholders = (value: string) =>
  [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionaries", () => {
  it("en.json and es.json expose the same key tree", () => {
    const enKeys = flattenKeys(en as Dictionary).sort();
    const esKeys = flattenKeys(es as Dictionary).sort();
    const missingInEs = enKeys.filter((k) => !esKeys.includes(k));
    const missingInEn = esKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEs, "keys missing in es.json").toEqual([]);
    expect(missingInEn, "keys missing in en.json").toEqual([]);
  });

  it("every key uses the same {placeholders} in both languages", () => {
    for (const key of flattenKeys(en as Dictionary)) {
      const enValue = lookup(en as Dictionary, key);
      const esValue = lookup(es as Dictionary, key);
      if (enValue === undefined || esValue === undefined) continue;
      expect(placeholders(esValue), `placeholder mismatch for "${key}"`).toEqual(
        placeholders(enValue),
      );
    }
  });
});

describe("translate()", () => {
  it("resolves nested keys per language", () => {
    expect(translate("en", "nav.settings")).toBe("Settings");
    expect(translate("es", "nav.settings")).toBe("Configuración");
  });

  it("falls back to English, then to the key itself", () => {
    expect(translate("es", "definitely.not.a.key")).toBe(
      "definitely.not.a.key",
    );
  });

  it("interpolates {vars}", () => {
    expect(translate("en", "appearance.useTheme", { name: "Violet" })).toBe(
      "Use Violet theme",
    );
  });

  it("selects _one/_other plural variants from vars.count", () => {
    expect(
      translate("en", "sidebar.unreadConversations", { count: 1 }),
    ).toBe("1 unread conversation");
    expect(
      translate("es", "sidebar.unreadConversations", { count: 3 }),
    ).toBe("3 conversaciones sin leer");
  });
});
