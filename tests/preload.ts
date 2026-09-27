import { tmpdir } from "node:os"
import { join } from "node:path"

// Tests never see (or start installing) the computer's shared Lean runtime; a test that wants one sets its own.
process.env.MATHOS_LEAN_RUNTIME ??= join(tmpdir(), "mathos-test-no-lean-runtime")
process.env.MATHOS_LEAN_AUTO_INSTALL ??= "0"
