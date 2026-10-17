# fastx402-mcp

80+ small, fast tools for your AI agent, paid per call in USDC with [x402](https://x402.org). No account, no API key, no subscription: your agent pays a fraction of a cent per successful call, on Base or Solana.

Tools include background removal, image to SVG, image and video conversion, video to GIF, text to speech, QR codes, YAML/XML/CSV/JSON conversion, Markdown to HTML, text diffs, date math and formatting, cron descriptions, time zones, color conversion, unit conversion, IP and DNS lookups, email/IBAN/ISBN validation, hashing and JWT decoding, Ethereum/Base/Solana balances, token info, transaction status, gas prices, ENS and Basename resolution, web page text, screenshots, PDF text, OCR and audio transcription. The list is read live from [fastx402.tools](https://fastx402.tools), so new tools appear without updating this package.

## Quick start

**Claude Desktop, one click:** download `fastx402.mcpb` from the [latest release](https://github.com/tusk80/fastx402-mcp/releases/latest), double-click it, and fill in the form (wallet key and limits). Done.

**Any MCP client, by config:**

Create a **new, dedicated wallet** and put a few dollars of USDC in it (on Base, or on Solana). Never use your main wallet.

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`~/.cursor/mcp.json`) and most MCP clients:

```json
{
  "mcpServers": {
    "fastx402": {
      "command": "npx",
      "args": ["-y", "fastx402-mcp"],
      "env": {
        "FASTX402_EVM_PRIVATE_KEY": "0xYOUR_DEDICATED_WALLET_KEY",
        "FASTX402_MAX_USD_PER_DAY": "1"
      }
    }
  }
}
```

For Solana, set `FASTX402_SOLANA_PRIVATE_KEY` (base58 secret key) instead of, or next to, the EVM key.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `FASTX402_EVM_PRIVATE_KEY` | none | Wallet that pays in USDC on Base (0x + 64 hex) |
| `FASTX402_SOLANA_PRIVATE_KEY` | none | Wallet that pays in USDC on Solana (base58, 64-byte secret key) |
| `FASTX402_MAX_USD_PER_CALL` | `0.05` | Refuses any single payment above this, whatever the server asks |
| `FASTX402_MAX_USD_PER_DAY` | `1` | Stops paying once this much was spent today (kept in `~/.fastx402-mcp/spend.json`) |
| `FASTX402_URL` | `https://fastx402.tools` | The shop to use |

Without a key the server still lists every tool, so you can look before you pay.

## How paying works

1. The agent calls a tool; the server sends the request to fastx402.tools.
2. The shop answers `402 Payment Required` with the exact price.
3. Your key signs a USDC authorization for that amount only, locally. The key never leaves your machine.
4. The request is repeated with the signature; the facilitator settles it on-chain (it also pays the network fee) and the answer comes back.

Failed calls (bad input `400`, source down `502`) are not charged. Prices are shown in every tool description.

## Safety

- Use a dedicated wallet with a small balance; the limits above are a second line of defence.
- The key is only used to sign x402 USDC payments to fastx402.tools for the listed price.
- Source: this single file, `index.js`. Read it.

## Links

- Catalog and docs: https://fastx402.tools (also `/openapi.json` and `/llms.txt`)
- Contact: hello@fastx402.tools

MIT License.
