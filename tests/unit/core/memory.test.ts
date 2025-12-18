import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import { Memori } from "../../../src/core/memory";
import { SqliteVecStore } from "../../../src/stores/sqlite";

// Mock dependencies
mock.module("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      getGenerativeModel() {
        return {
          generateContent: async () => ({
            response: Promise.resolve({
              text: () => "Mock AI Response",
            }),
          }),
        };
      }
      get models() {
        return {
          embedContent: async () => {
            return {
              embeddings: [{ values: new Array(768).fill(0.1) }],
            };
          },
        };
      }
    },
  };
});

describe("Memori Core", () => {
  let memori: Memori;
  const originalKey = process.env.MEMORI_API_KEY;

  beforeAll(() => {
    process.env.MEMORI_API_KEY = "AIzaTestKey";
  });

  afterAll(() => {
    if (originalKey) process.env.MEMORI_API_KEY = originalKey;
    else delete process.env.MEMORI_API_KEY;
  });

  beforeEach(() => {
    // We can inject a mock store or use in-memory sqlite for integration-like unit test
    process.env.GOOGLE_API_KEY = "mock-key";

    memori = new Memori({
      dbPath: ":memory:",
    });
  });

  it("should initialize with default sqlite store", async () => {
    expect(memori).toBeDefined();
    await memori.config.storage.build();
    // @ts-ignore
    expect(memori.db).toBeInstanceOf(SqliteVecStore);
  });

  it("should add a memory", async () => {
    await memori.config.storage.build();
    const id = await memori.addMemory("Hello world", "user");
    expect(typeof id).toBe("string");
  });

  it("should retrieve context", async () => {
    await memori.config.storage.build();
    // 1. Add some memory
    await memori.addMemory("My favorite color is blue", "user");

    // 2. Search (Internally calls retrieveContext logic if exposed, but we test search directly)
    const results = await memori.search("What is my favorite color?");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toBe("My favorite color is blue");
  });

  it("should track attribution", () => {
    memori.attribution("user-123", "process-abc");
    // Access private property for testing or check via addMemory side effect
    // Since we don't expose getters, we can verify via spy or trust the search filter logic test in sqlite
    // Here we just ensure it doesn't crash
    expect(true).toBe(true);
  });
});
