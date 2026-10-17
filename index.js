#!/usr/bin/env node
// fastx402-mcp: every FastX402 tool as an MCP tool, paid per call with x402 (USDC on Base or Solana).
// Tools come from the live catalog (/openapi.json), so new tools appear without updating this package.
// Listing tools needs no wallet; calling one needs FASTX402_EVM_PRIVATE_KEY or FASTX402_SOLANA_PRIVATE_KEY.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";
import { privateKeyToAccount } from "viem/accounts";

const VERSION = "0.1.0";
const BASE = (process.env.FASTX402_URL || "https://fastx402.tools").replace(/\/$/, "");
const MAX_PER_CALL = Number(process.env.FASTX402_MAX_USD_PER_CALL || 0.05);
const MAX_PER_DAY = Number(process.env.FASTX402_MAX_USD_PER_DAY || 1);
const LEDGER = join(homedir(), ".fastx402-mcp", "spend.json");
const log = (...a) => console.error("[fastx402]", ...a); // stdout belongs to the MCP protocol

// ---------------------------------------------------------------- catalog
let catalog; // Map name -> { path, price, tool }
async function loadCatalog() {
  if (catalog) return catalog;
  const res = await fetch(`${BASE}/openapi.json`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`could not load the FastX402 catalog (${res.status})`);
  const spec = await res.json();
  catalog = new Map();
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    const op = ops.post;
    if (!op) continue;
    const price = Number(op["x-payment-info"]?.price?.amount ?? NaN);
    const name = path.slice(1).replace(/[^a-zA-Z0-9_-]/g, "_");
    catalog.set(name, {
      path,
      price,
      tool: {
        name,
        description: `${op.description || op.summary || name} Costs $${price} per successful call (USDC, paid automatically with x402).`,
        inputSchema: op.requestBody?.content?.["application/json"]?.schema ?? { type: "object", properties: {} },
      },
    });
  }
  log(`${catalog.size} tools from ${BASE}`);
  return catalog;
}

// ---------------------------------------------------------------- wallet and limits
let payFetch;
async function payer() {
  if (payFetch) return payFetch;
  const schemes = [];
  if (process.env.FASTX402_EVM_PRIVATE_KEY) schemes.push({ network: "eip155:*", client: new ExactEvmScheme(privateKeyToAccount(process.env.FASTX402_EVM_PRIVATE_KEY)) });
  if (process.env.FASTX402_SOLANA_PRIVATE_KEY)
    schemes.push({ network: "solana:*", client: new ExactSvmScheme(await createKeyPairSignerFromBytes(getBase58Encoder().encode(process.env.FASTX402_SOLANA_PRIVATE_KEY))) });
  if (!schemes.length) return null;
  // The x402 client refuses any single payment above this cap, whatever the server asks for.
  payFetch = wrapFetchWithPaymentFromConfig(fetch, { schemes, spendControls: { maxAmountPerPayment: `$${MAX_PER_CALL}` } });
  return payFetch;
}

const today = () => new Date().toISOString().slice(0, 10);
function spentToday() {
  try {
    const l = JSON.parse(readFileSync(LEDGER, "utf8"));
    return l.day === today() ? l.usd : 0;
  } catch {
    return 0;
  }
}
function addSpend(usd) {
  mkdirSync(join(homedir(), ".fastx402-mcp"), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify({ day: today(), usd: Math.round((spentToday() + usd) * 1e6) / 1e6 }));
}

// ---------------------------------------------------------------- MCP
const fail = (text) => ({ isError: true, content: [{ type: "text", text }] });
const server = new Server({ name: "fastx402", version: VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...(await loadCatalog()).values()].map((t) => t.tool) }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const entry = (await loadCatalog()).get(req.params.name);
  if (!entry) return fail(`Unknown tool ${req.params.name}.`);
  const pay = await payer();
  if (!pay) return fail("No wallet configured. Set FASTX402_EVM_PRIVATE_KEY (Base) or FASTX402_SOLANA_PRIVATE_KEY (Solana) for a wallet holding a little USDC; see https://fastx402.tools.");
  if (!(entry.price <= MAX_PER_CALL)) return fail(`${req.params.name} costs $${entry.price}, above FASTX402_MAX_USD_PER_CALL ($${MAX_PER_CALL}).`);
  if (spentToday() + entry.price > MAX_PER_DAY) return fail(`Daily limit reached: $${spentToday()} of FASTX402_MAX_USD_PER_DAY ($${MAX_PER_DAY}) spent today.`);

  let res;
  try {
    res = await pay(`${BASE}${entry.path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": `fastx402-mcp/${VERSION}` },
      body: JSON.stringify(req.params.arguments ?? {}),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    return fail(`Payment or request failed: ${e?.message ?? e}`);
  }
  const receipt = res.headers.get("payment-response");
  if (receipt) {
    try {
      if (decodePaymentResponseHeader(receipt).success) addSpend(entry.price);
    } catch {}
  }
  const text = await res.text();
  // 400 and 502 answers are not charged by the shop; say so, so the agent can fix its input or retry.
  if (!res.ok) return fail(`${req.params.name} answered ${res.status} (not charged): ${text.slice(0, 2000)}`);
  return { content: [{ type: "text", text }] };
});

await server.connect(new StdioServerTransport());
log(`fastx402-mcp ${VERSION} ready (limits: $${MAX_PER_CALL}/call, $${MAX_PER_DAY}/day)`);
