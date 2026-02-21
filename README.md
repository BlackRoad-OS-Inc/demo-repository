# BlackRoad OS, Inc.

**The operating system for governed AI.**

BlackRoad OS is the infrastructure platform that lets you deploy, monitor, and govern thousands of autonomous AI agents with cryptographic identity, immutable audit trails, and policy enforcement.

## Organization Repositories

| Repository | Description |
|---|---|
| [blackroad-core](https://github.com/BlackRoad-OS-Inc/blackroad-core) | Tokenless gateway and orchestration engine |
| [blackroad-web](https://github.com/BlackRoad-OS-Inc/blackroad-web) | Next.js 15 management dashboard |
| [blackroad-agents](https://github.com/BlackRoad-OS-Inc/blackroad-agents) | Agent definitions, prompts, and personality system |
| [blackroad-infra](https://github.com/BlackRoad-OS-Inc/blackroad-infra) | Terraform, Docker, CI/CD, and deployment scripts |
| [blackroad-docs](https://github.com/BlackRoad-OS-Inc/blackroad-docs) | Architecture docs, brand system, governance, and guides |
| [blackroad-operator](https://github.com/BlackRoad-OS-Inc/blackroad-operator) | CLI tooling (`br` command) for fleet management |

## Quick Start

```bash
# Install the CLI
npm install -g @blackroad/operator

# Initialize a project
br init my-project

# Deploy an agent
br deploy --agent lucidia --target production

# Check fleet status
br status
```

## Architecture

```
                    ┌──────────────────┐
                    │  blackroad-web   │  Dashboard UI
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  blackroad-core  │  Tokenless Gateway
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───┐  ┌──────▼─────┐  ┌─────▼──────┐
     │  Anthropic  │  │   OpenAI   │  │   Ollama   │  Providers
     └─────────────┘  └────────────┘  └────────────┘
```

## Key Features

- **Tokenless Gateway** — Agents never hold API keys. All provider calls route through the governed gateway.
- **PS-SHA-infinity** — Cryptographic identity chains for every agent, every action.
- **RoadChain Ledger** — Immutable, append-only audit trail with tamper detection.
- **Multi-Provider** — Route to Anthropic, OpenAI, Ollama, Gemini, or custom models.
- **Policy Engine** — Define and enforce behavioral policies before execution.
- **Edge Compute** — Deploy to Raspberry Pi clusters with Hailo-8 AI accelerators.

## Infrastructure

- **17 GitHub Organizations** — 1,825+ repositories
- **205 Cloudflare Pages Projects** — Global edge deployment
- **8 Physical Devices** — Pi cluster with 52 TOPS AI compute
- **WireGuard Mesh** — Encrypted device-to-device networking across the fleet

## License

All code, documentation, and assets are the exclusive proprietary property of **BlackRoad OS, Inc.**
Public visibility does not constitute open-source licensing.

Copyright 2024-2026 BlackRoad OS, Inc. All rights reserved.
