import { Memori } from "../dist/index.js";

async function main() {
  console.log("Initializing Memori...");

  const memori = new Memori({
    googleApiKey: process.env.GOOGLE_API_KEY,
  });

  // Scenario: Multi-User System
  const userA = "user-alice-123";
  const userB = "user-bob-456";

  console.log("--- Storing Memory for Alice ---");
  memori.attribution(userA, "agent-v1");
  await memori.addMemory("My secret password is 'blue-banana'.", "user");

  console.log("--- Storing Memory for Bob ---");
  memori.attribution(userB, "agent-v1");
  await memori.addMemory("My secret password is 'red-apple'.", "user");

  console.log("\n--- Searching as Alice (Should find 'blue-banana') ---");
  memori.attribution(userA, "agent-v1");
  const resultsA = await memori.search("What is my secret password?");
  console.log(
    "Found:",
    resultsA.map((r) => r.content)
  );

  console.log("\n--- Searching as Bob (Should find 'red-apple') ---");
  memori.attribution(userB, "agent-v1");
  const resultsB = await memori.search("What is my secret password?");
  console.log(
    "Found:",
    resultsB.map((r) => r.content)
  );

  // Verification Logic
  const aliceFoundHers = resultsA.some((r) =>
    r.content.includes("blue-banana")
  );
  const aliceFoundBobs = resultsA.some((r) => r.content.includes("red-apple"));

  if (aliceFoundHers && !aliceFoundBobs) {
    console.log("\n✅ SUCCESS: Attribution Isolation Verified.");
  } else {
    console.error("\n❌ FAILURE: Isolation failed.");
    console.log("Alice found hers:", aliceFoundHers);
    console.log("Alice found Bobs:", aliceFoundBobs);
    process.exit(1);
  }
}

main().catch(console.error);
