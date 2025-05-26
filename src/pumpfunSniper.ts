import WebSocket from "ws";
import { Connection, PublicKey } from "@solana/web3.js";
import { throttled } from "./rpcThrottled";

// === CONFIGURATION ===
const PUMPFUN_PROGRAM_ID = "7QxgMQYBz3X7cXWzX5QW8YvBkQh2dR8Fo7Q6B4Gm9K8E"; // Replace with actual pump.fun program address
const RPC_URL = process.env.HELIUS_HTTPS_URI || "https://api.mainnet-beta.solana.com";
const WEBSOCKET_URL = RPC_URL.replace(/^https/i, "wss"); // Helius/QuickNode support this, public Solana may not

// Utility: Extract mint address from transaction
async function extractMintAddress(connection: Connection, signature: string): Promise<string | null> {
  const tx = await throttled(() =>
    connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })
  );
  if (!tx?.meta?.postTokenBalances) return null;
  // Take first non-WSOL mint (you may want to refine)
  for (const balance of tx.meta.postTokenBalances) {
    if (balance.mint !== "So11111111111111111111111111111111111111112") {
      return balance.mint;
    }
  }
  return null;
}

// MAIN SNIPER LOGIC
async function startPumpfunSniper() {
  console.log("Starting Pump.fun Token Sniper...");
  console.log("Using RPC endpoint:", RPC_URL);

  const connection = new Connection(RPC_URL, "confirmed");
  const ws = new WebSocket(WEBSOCKET_URL);

  ws.on("open", () => {
    console.log("WebSocket connected. Subscribing to pump.fun logs...");
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "logsSubscribe",
        params: [
          { mentions: [PUMPFUN_PROGRAM_ID] },
          { commitment: "confirmed" }
        ]
      })
    );
  });

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const logs = msg?.params?.result?.value?.logs;
      const signature = msg?.params?.result?.value?.signature;
      if (!Array.isArray(logs) || !signature) return;

      // Detect likely new token creation -- adjust log text as needed!
      if (logs.some((log: string) => log.includes("InitializeMint") || log.includes("CreatePool"))) {
        console.log("\n🆕 Detected new pump.fun token creation tx:", signature);
        console.log("https://solscan.io/tx/" + signature);

        // Extract mint address (throttled)
        const mint = await extractMintAddress(connection, signature);
        if (mint) {
          console.log("🎉 New token mint address:", mint);
          console.log("🔗 View: https://solscan.io/token/" + mint);
          // TODO: Add your logic here (auto-buy, alert, save, etc)
        } else {
          console.log("⚠️ Could not extract mint address from tx:", signature);
        }
      }
    } catch (err) {
      // Fail quietly
    }
  });

  ws.on("close", () => {
    console.log("WebSocket closed. Attempting to reconnect in 5 seconds...");
    setTimeout(startPumpfunSniper, 5000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

startPumpfunSniper();