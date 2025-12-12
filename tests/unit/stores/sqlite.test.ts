import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SqliteVecStore } from "../../../src/stores/sqlite";
import { VectorStore } from "../../../src/core/types";

describe("SqliteVecStore", () => {
  let store: SqliteVecStore;

  beforeEach(async () => {
    // Use :memory: for ultra-fast, ephemeral testing
    store = new SqliteVecStore(":memory:");
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  it("should initialize correct tables", async () => {
    const tableCheck = await new Promise<any>((resolve) => {
      store.db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'",
        (err, row) => resolve(row)
      );
    });
    expect(tableCheck).toBeDefined();
    expect(tableCheck.name).toBe("memories");
  });

  it("should insert and retrieve a memory", async () => {
    const embedding = new Array(768).fill(0.1);
    const content = "Test memory content";
    const id = await store.insert(content, embedding, { role: "user" });

    expect(id).toBeDefined();
    expect(typeof id).toBe("string");

    // Verify raw row
    const row = await new Promise<any>((resolve) => {
      store.db.get("SELECT * FROM memories WHERE rowid = ?", [id], (err, row) =>
        resolve(row)
      );
    });
    expect(row).toBeDefined();
    expect(row.content).toBe(content);
  });

  it("should search and find similar vectors", async () => {
    // 1. Insert Vector A
    const vecA = new Array(768).fill(0);
    vecA[0] = 1.0; // Pointing in X direction
    const idA = await store.insert("Vector A", vecA, { role: "user" });

    // 2. Insert Vector B (Orthogonal/Different)
    const vecB = new Array(768).fill(0);
    vecB[1] = 1.0; // Pointing in Y direction
    await store.insert("Vector B", vecB, { role: "user" });

    // 3. Search near A
    const results = await store.search(vecA, 1);

    expect(results.length).toBe(1);
    expect(results[0].id).toBe(idA);
    expect(results[0].content).toBe("Vector A");
    // Distance should be very small (close to 0)
    expect(results[0].distance).toBeLessThan(0.0001);
  });

  it("should filter results by entityId", async () => {
    const vec = new Array(768).fill(0.5);

    await store.insert("Entity 1 Memory", vec, { entityId: "user-1" });
    await store.insert("Entity 2 Memory", vec, { entityId: "user-2" });

    const results = await store.search(vec, 5, { entityId: "user-1" });

    expect(results.length).toBe(1);
    expect(results[0].content).toBe("Entity 1 Memory");
  });

  it("should delete a memory", async () => {
    const vec = new Array(768).fill(0);
    const id = await store.insert("To be deleted", vec);

    await store.delete(id);

    const row = await new Promise((resolve) => {
      store.db.get("SELECT * FROM memories WHERE rowid = ?", [id], (err, row) =>
        resolve(row)
      );
    });
    expect(row).toBeUndefined();
  });
});
