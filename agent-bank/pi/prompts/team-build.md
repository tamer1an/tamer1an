---
description: Team workflow — claude specs, copilot builds, argon doubts, claude signs off, local records memories
---
Use the subagent tool with the chain parameter to run this workflow for: $@

1. "claude": write a short spec and split it into thin slices with acceptance criteria (spec-driven-development, planning-and-task-breakdown). Search memory first.
2. "copilot": implement the FIRST slice only, test first (test-driven-development, incremental-implementation). Input: {previous}
3. "argon": adversarial review of that change (doubt-driven-development, code-review-and-quality). Input: {previous}
4. "claude": decide ship / fix — if fix, list the exact changes. Save the decisions to memory. Input: {previous}
5. "local": summarise the whole run in 5 lines and propose durable memories. Input: {previous}

Execute this as a chain, passing output between steps via {previous}. Stop after step 5 and report.
