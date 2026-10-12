// Turns the failing tests in a bun JUnit report into GitHub annotations. A timed-out bun test fails the job without
// an annotation, and annotations are the only part of a run the public API shows without a token.
import { existsSync, readFileSync } from "node:fs"

const unescape = (value: string) => value.replace(/&#10;/g, "\n").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
// Workflow commands end at a newline; the message keeps its lines as %0A.
const property = (value: string) => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A").replace(/,/g, "%2C")
const message = (value: string) => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")
const attribute = (tag: string, name: string) => unescape(tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? "")

export function junitAnnotations(xml: string): string[] {
  const lines: string[] = []
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const failure = match[2]?.match(/<failure\b([^>]*?)(?:\/>|>([\s\S]*?)<\/failure>)/)
    if (!failure) continue
    const file = attribute(match[1]!, "file"), line = attribute(match[1]!, "line"), name = attribute(match[1]!, "name")
    const detail = (unescape(failure[2] ?? "") || attribute(failure[1]!, "message") || attribute(failure[1]!, "type")).trim().slice(0, 1800)
    lines.push(`::error file=${property(file)},line=${line || 1},title=${property(`${attribute(failure[1]!, "type") || "Failure"}: ${name}`)}::${message(detail)}`)
  }
  return lines
}

if (import.meta.main) {
  const path = process.argv[2]
  if (!path || !existsSync(path)) { console.log(`::warning::No JUnit report at ${path ?? "(none)"}; the test run ended before writing it.`); process.exit(0) }
  const lines = junitAnnotations(readFileSync(path, "utf8"))
  console.log(lines.length ? lines.join("\n") : "::warning::The JUnit report lists no failing test; the run failed outside a test (a crash, an unhandled error or a load failure).")
}
