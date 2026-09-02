# Model Provider Hub integration baseline

Captured at `2026-09-02T18:38:43Z` on `main`.

- Start revision: `845e0df9dbd05cc4184cffe2d3ccd4782196f3d4`
- `origin/main`: identical to the start revision
- Working tree before capture: clean
- Bun install: PASS, frozen lockfile unchanged
- TypeScript typecheck: PASS
- Build: PASS
- Tests: 691 pass, 10 environment-dependent skips, 0 fail (701 tests in 204 files)
- Release check: NOT_READY; the existing `final-product-capabilities` gate correctly reports missing live model, Docker sandbox, VS Code host, and Windows/macOS qualification evidence

The ten skips are existing real-environment gates: four retrieval checks and six Docker-backed computation checks. They are not counted as provider implementation evidence.

## Existing V1 profile fixture

The redacted fixture at `artifacts/provider-integration-baseline/model-profiles-v1.redacted.json` contains metadata only. No user configuration or credential was read or copied.

## Model package SHA-256 inventory

```text
2c491b50b2d299dda70c6a54befa6f010cabb69a83d34206cca148fd6ce1fc2d  config.ts
837752003d7f3307b1bcdef7be67c2967ea42af1c7f60c214e64d7cdd6978ffe  doctor.ts
5f223af83ce7bdbb87bf605fbf732117486ccd235d5a6bb70df40a05165ebf8b  errors.ts
5408329332b43ca738ce07c90ee5bfc5d3aa245b3ede9398d5b6b9ee85cda9ec  fake.ts
38b674a769c312a531b9428f32bd8bf290c4cfa54541e62636da24156d815871  health.ts
df8e0efec05cd3c5a573d76799c138c9f536bc97aa8bf7794899457ef1dc58d8  index.ts
8dc6e8ac18fbaac446deab4770c0eb2c9efd62248f0299ae3af09d6591939f08  json.ts
1049ee0f28aca36b82ccd2ea81b43644c6b9f4fb155bb7c3c9a5c58b784c5c18  openai.ts
d91c92799026725fa82142c631c5f69427a7e5ba845427cea24fcdb36623b10c  privacy.ts
ca95a390cb5024fc7edb6ecdabfc4b830696999c9aadcb1feb765a1e45b4242b  profile.ts
15a270670c37e6d813ff204113f8b2e4598842c684eadc9aa572ef5f5eb8d181  redact.ts
4b8b3ca0bde6628a8ae3366d63c1086fbdfec311b110fad0860c2204a092dd10  registry.ts
63d08a422a5957af9b96ab0cd3dde53f17f8418e7396062e0e795d7be98ab9e6  retry.ts
b442f5f079102aa5a0903adc18b4666817bba5f13345c148578e91cf16693ac9  router.ts
295f21480845e36cc86151be2a03e78f689b23d78ef563dd9bd26ad93d9e29f1  secret-store.ts
e5d356d52d8710a5a89f645a52aa35f755c37105ec319ab932e011537aa7b499  types.ts
d7333fb7691408354729921a5a29efcb2b49069c82ef994aa787967217e109d1  unified-config.ts
62e73ba2c1b3809dcadc465322c2c45d415ee164cebb13dd2a52ae15162bf00d  usage.ts
```

Official provider documentation was reviewed on 2026-09-02. Policy conclusions and source URLs are maintained in `docs/PROVIDER_TERMS_MATRIX.md`.
