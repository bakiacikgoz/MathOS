import { expect, test } from "bun:test"
import { withProjectImports } from "@mathos/lean"

test("Mathlib projects compile generated declarations in the project environment", () => {
  expect(withProjectImports("theorem t : True := by trivial", true)).toStartWith("import Mathlib\n\n")
  expect(withProjectImports("import Mathlib\n\ntheorem t : True := by trivial", true)).toBe("import Mathlib\n\ntheorem t : True := by trivial")
  expect(withProjectImports("theorem t : True := by trivial", false)).toBe("theorem t : True := by trivial")
})
