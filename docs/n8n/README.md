# n8n — AIRI customer service agent

The WhatsApp / Facebook / Instagram agent that consumes this repo's
`GET /api/v1/agent/products/search` endpoint. Versioned here so the workflow and prompt travel
with the API they depend on — see [agent-product-search.md](../agent-product-search.md) for the
design and rationale.

**These files are reference copies, not the running system.** The live workflow lives in the n8n
instance, and the live prompt is a row in the n8n platform's Supabase (`get_company_prompts`,
types `core` / `evaluator`). Changing a file here changes nothing until it is imported/pasted.

| File | What it is |
|---|---|
| `tools-social-desk.json` | The n8n workflow, **sanitized** (see below). Mirrors `n8n/tools/Tools Social Desk.json`. |
| `airi-agent-prompt.md` | The agent's system prompt. Mirrors `n8n/tools/promptgrok.md`. |

## Sanitization — read before importing

The exported workflow contained live credentials inline in node parameters. They were replaced
with named placeholders here, so **this file cannot be imported and run as-is** — that is
deliberate.

| Placeholder | Where | Supply via |
|---|---|---|
| `REPLACE_WITH_SUPABASE_SERVICE_ROLE_KEY` | `GetPrompts`, `UpdateLeadsToProcessed`, `UpsertHumanPhoneBlock` | n8n credential |
| `REPLACE_WITH_SUPABASE_ANON_KEY` | `UpdateLeadsToProcessed` | n8n credential |
| `REPLACE_WITH_XAI_API_KEY` | `CompanySettings` | n8n credential |
| `REPLACE_WITH_REAL_CREDENTIAL_ID` | `SearchProducts` | n8n Bearer Auth credential holding `AGENT_API_KEY` |

Also stripped: `pinData` (a captured live webhook request containing a real customer access
token, phone number, and conversation ids), plus the instance-specific `id` / `versionId`.
`active` is set to `false` so an import can't start processing traffic unreviewed.

> ⚠️ The originals in `n8n/tools/` still contain those secrets, including a Supabase
> **`service_role`** key (bypasses RLS entirely) and a live xAI key, and they are committed to
> that repo's git history. **Rotate them.** Redacting the copy here does not undo the exposure.

## How the search tool works

`SearchProducts` is an `httpRequestTool` wired `ai_tool` → `AI Agent`, alongside `CreateLead`.

n8n does no keyword extraction — the **model** fills the `q` parameter via ordinary tool-calling,
so the parameter description is the contract. It instructs the model to normalize the customer's
message into a short English noun phrase and translate Patois first, e.g. "yo mi need a
screwdriva" → `q: "screwdriver"`. That is why the API can use plain Postgres full-text search and
still handle dialect: the LLM is the semantic layer.

Only `q` is model-provided. `inStock` / `maxPrice` / `limit` exist on the endpoint but are
deliberately **not** exposed — every extra model-filled parameter is somewhere the LLM can invent
a constraint (`maxPrice: 5000`) that silently turns a good answer into "we don't have that".

## Setup

1. Run `apps/api/supabase/migrations/0005_search.sql` in the Supabase SQL Editor.
2. Set `AGENT_API_KEY` (min 32 chars, e.g. `openssl rand -hex 32`) in `apps/api/.env` and in
   Railway. Until it is set the endpoint returns 404 by design — it fails closed rather than open.
3. Import `tools-social-desk.json` into n8n.
4. Create an n8n **Bearer Auth** credential named e.g. "Tools Jamaica Agent API Key" holding the
   value from step 2, and attach it to the `SearchProducts` node.
5. Replace the placeholder URL in `SearchProducts` with the real deployed origin
   (it currently points at `tools-jamaica-production.up.railway.app`, matching `APP_BASE_URL`).
6. Reattach the Supabase / xAI / Redis / Postgres credentials for the other placeholders above.
7. Paste `airi-agent-prompt.md` into the `core` prompt row in the n8n platform's Supabase.

Node type `n8n-nodes-base.httpRequestTool` (typeVersion 1.1) was written by hand and not verified
against a running n8n — if your version names it differently, the import will flag it.
