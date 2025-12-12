import { MemoriDB } from "../src/core/db";

(async () => {
  console.log("Initializing MemoriDB...");
  const db = new MemoriDB(":memory:"); // In-memory for testing
  await db.init();

  // Mock 768-dim vector (all zeros with one 1)
  const vec1 = new Array(768).fill(0);
  vec1[0] = 1.0;

  const vec2 = new Array(768).fill(0);
  vec2[1] = 1.0;

  console.log("Inserting vector 1...");
  const id1 = await db.insert("Test Memory 1", vec1, { role: "user" });
  console.log(`Inserted ID: ${id1}`);

  console.log("Inserting vector 2...");
  const id2 = await db.insert("Test Memory 2", vec2, { role: "user" });
  console.log(`Inserted ID: ${id2}`);

  console.log("Searching for vector 1...");
  const results = await db.search(vec1, 1);
  console.log("Results:", results);

  if (results.length > 0 && results[0].content === "Test Memory 1") {
    console.log("SUCCESS: Vector search returned correct result.");
  } else {
    console.error("FAILURE: Vector search did not return expected result.");
    process.exit(1);
  }
})();
