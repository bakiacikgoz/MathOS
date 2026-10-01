import { expect, test } from "bun:test"
import { SANDBOX_IMAGE, dockerRunArguments } from "../packages/computation/src/platform/container-sandbox.ts"

test("the production sandbox runs one immutable multi-platform image rather than a mutable tag", () => {
  expect(SANDBOX_IMAGE).toMatch(/^python:3\.12-alpine@sha256:[a-f0-9]{64}$/)
  const arguments_ = dockerRunArguments("fixture-work", "fixture-container")
  expect(arguments_).toContain(SANDBOX_IMAGE)
  expect(arguments_).not.toContain("python:3.12-alpine")
})
