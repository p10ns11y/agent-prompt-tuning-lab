# Gold sessions

Committable reference for manually tagged exemplar sessions. No transcript content — ids and repo hints only.

Tag locally:

```bash
pnpm tag-manifest -- --tag gold --session-id <uuid>
```

## Tagged sessions (devprofile, premflow, thepulimaangani)

Heuristics: longer parent sessions, multi-tool threads, skills present where available, plus high-value subagents under those repos.

| session_id | repo_hint | kind | notes |
|------------|-----------|------|-------|
| da0a7b6c-c14d-4732-a576-d10b2ccb61a1 | devprofile | parent | Long session; skills + heavy tool use |
| 8e4875bb-e42d-403f-b039-aef1a7275d10 | devprofile | parent | 400+ JSONL lines |
| 4ce82142-34fb-4c04-8eb1-107cb4abe0fc | devprofile | parent | 200+ lines |
| 3a86b4c7-a4ae-48c9-b064-5d79d433a8c6 | devprofile | parent | Medium BDD-style thread |
| 98ed1afd-2aaf-4caa-89a8-b5c8192339f1 | devprofile | subagent | Child of da0a7b6c; skills sample |
| fd93f31d-bb54-422a-ac5b-2bcbef0455c2 | premflow | parent | Largest premflow session |
| 421b7ace-c139-4788-af26-cc8564fa4c8d | premflow | parent | Short QA-style |
| 7583c61f-f6c5-4ee7-9853-b2afc4cc3e4f | premflow | subagent | Under fd93f31d |
| 771942db-74ba-4c68-8fc4-62920bcdb951 | premflow | subagent | Under fd93f31d |
| 27c03414-f39b-4b57-abe7-0332eb6f1a7d | thepulimaangani | parent | Largest session in corpus |
| b5affb61-37a8-4101-ae0d-903e6944b71f | thepulimaangani | parent | 250+ lines |
| 98211046-e58d-43a8-9473-809bd67320a0 | thepulimaangani | parent | 240+ lines |
| ff97d3ea-3b29-4703-96e1-8c93351a926d | thepulimaangani | parent | Multi subagent parent |
| d9f54bee-ad63-4806-bbfa-2997f35c28c4 | thepulimaangani | parent | Focused shorter thread |
| 052a0715-e83f-403a-89ba-71fe210fce01 | thepulimaangani | subagent | Under 27c03414 |
| edee9be5-3770-46cf-8a62-cb9941ac0d73 | thepulimaangani | subagent | Under 27c03414 |
| 08c20004-cf76-420e-808f-5a2db123eb74 | thepulimaangani | subagent | Under ff97d3ea |
| 34ce5712-348c-41e0-bb4a-381e4c675cb4 | thepulimaangani | subagent | Under ff97d3ea |
| c1e6bca8-1763-499a-96ce-aca771629876 | thepulimaangani | subagent | Under ff97d3ea |

**Count:** 18 gold-tagged session ids (10 parent, 8 subagent).

Re-apply tags after re-seeding manifest:

```bash
node scripts/tag-manifest.mjs --tag gold --session-id \
  da0a7b6c-c14d-4732-a576-d10b2ccb61a1,8e4875bb-e42d-403f-b039-aef1a7275d10,4ce82142-34fb-4c04-8eb1-107cb4abe0fc,3a86b4c7-a4ae-48c9-b064-5d79d433a8c6,98ed1afd-2aaf-4caa-89a8-b5c8192339f1,fd93f31d-bb54-422a-ac5b-2bcbef0455c2,421b7ace-c139-4788-af26-cc8564fa4c8d,7583c61f-f6c5-4ee7-9853-b2afc4cc3e4f,771942db-74ba-4c68-8fc4-62920bcdb951,27c03414-f39b-4b57-abe7-0332eb6f1a7d,b5affb61-37a8-4101-ae0d-903e6944b71f,98211046-e58d-43a8-9473-809bd67320a0,ff97d3ea-3b29-4703-96e1-8c93351a926d,d9f54bee-ad63-4806-bbfa-2997f35c28c4,052a0715-e83f-403a-89ba-71fe210fce01,edee9be5-3770-46cf-8a62-cb9941ac0d73,08c20004-cf76-420e-808f-5a2db123eb74,34ce5712-348c-41e0-bb4a-381e4c675cb4,c1e6bca8-1763-499a-96ce-aca771629876
```
