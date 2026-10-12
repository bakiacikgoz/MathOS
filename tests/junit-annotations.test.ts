import { expect, test } from "bun:test"
import { junitAnnotations } from "../scripts/ci/junit-annotations.ts"

test("every failing or timed-out test becomes one GitHub annotation", () => {
  const xml = `<testsuites><testsuite name="tests/a.test.ts">
    <testcase name="passes" file="tests/a.test.ts" line="2" />
    <testcase name="fails, badly" file="tests/a.test.ts" line="3"><failure type="AssertionError" message="m">Expected: 2&#10;Received: 1</failure></testcase>
    <testcase name="times out" file="tests/a.test.ts" line="4"><failure type="TimeoutError" message="test timed out" /></testcase>
  </testsuite></testsuites>`
  expect(junitAnnotations(xml)).toEqual([
    "::error file=tests/a.test.ts,line=3,title=AssertionError%3A fails%2C badly::Expected: 2%0AReceived: 1",
    "::error file=tests/a.test.ts,line=4,title=TimeoutError%3A times out::test timed out",
  ])
})
