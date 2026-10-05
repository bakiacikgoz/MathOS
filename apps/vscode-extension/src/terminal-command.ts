type TerminalWindow = {
  createTerminal(options: { name: string; cwd: string; shellPath?: string; shellArgs?: string[] }): {
    show(): void
  }
}

export function openMathOSTerminal(window: TerminalWindow, executablePath: string, workspaceRoot: string, command: "doctor" | "atlas") {
  const terminal = window.createTerminal({
    name: command === "atlas" ? "MathOS Atlas" : "MathOS Doctor",
    cwd: workspaceRoot,
    shellPath: executablePath,
    shellArgs: [command],
  })
  terminal.show()
}
