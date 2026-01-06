import { describe, it, expect, mock } from "bun:test";
import { Memori } from "../../src/core/memory";

describe("Memori KV Store", () => {
  const config = {
      // Mock db path or use :memory:
      dbPath: ":memory:",
      apiKey: "test-key" // To pass config validation if needed, or mock
  };

  it("should support set and get operations", () => {
    // Need dummy config to satisfy constructor basic validation if strict
    // Memori constructor checks apiKey or embedding provider.
    // Let's assume we can pass a dummy embedding provider or apiKey.
    const memori = new Memori({
        apiKey: "sk-dummy-key", 
        // We can pass a dummy embedding provider if we want to avoid network or key check errors?
        // Code: if (apiKey.startsWith("sk-")) sets OpenAI. 
        // We just want KV, we don't care about VectorStore init failure (it catches error).
    });

    memori.set("user-theme", "dark");
    expect(memori.get<string>("user-theme")).toBe("dark");

    memori.set("user-settings", { notifications: true });
    expect(memori.get<any>("user-settings")).toEqual({ notifications: true });
  });

  it("should emit changes on set", () => {
    const memori = new Memori({ apiKey: "sk-dummy" });
    const listener = mock((key, val) => {});
    
    memori.subscribe(listener);

    memori.set("foo", "bar");
    expect(listener).toHaveBeenCalledWith("foo", "bar");
  });

  it("should support delete and emit undefined", () => {
    const memori = new Memori({ apiKey: "sk-dummy" });
    const listener = mock((key, val) => {});
    memori.subscribe(listener);

    memori.set("foo", "bar");
    memori.delete("foo");

    expect(memori.get("foo")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2); // set(bar) + delete(undefined)
    expect(listener).toHaveBeenLastCalledWith("foo", undefined);
  });
});
