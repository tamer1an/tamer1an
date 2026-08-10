---
name: explain-by-analogy
description: >-
  Teach an unfamiliar framework, codebase, or system by mapping it onto what the
  learner already knows, in progressive layers from mental model down to the one
  repeating pattern. Use when asked to "explain how this works", "break down this
  codebase", "help me understand <framework> — I come from <other tool>", or to
  onboard someone into a new tech by analogy. Keywords: explain, breakdown, walk
  me through, mental model, I know X how does Y compare, teach me this codebase,
  onboarding, learning path.
---

# Explain by analogy (layered teaching)

Make something new click by anchoring every new concept to one the learner already
owns, then descend in layers from the big picture to the single pattern that
repeats everywhere. Distilled from a Godot/GDScript breakdown that mapped the
engine onto the learner's prior Flash and Blender knowledge.

## When to use

- "Explain how <framework/codebase> works" — especially from a stated background.
- Onboarding into unfamiliar tech, or a deep-dive walkthrough of a project.
- Any time comprehension, not just an answer, is the goal.

## The method: 7 layers, big → small

1. **Layer 0 — Mental model by analogy.** Before any detail, map the new system's
   core concepts onto the learner's known world in a side-by-side table.
   *(e.g. Godot Scene ≈ Flash MovieClip symbol ≈ Blender Collection/Prefab;
   Node ≈ Layer/nested clip ≈ Outliner object.)* This is the load-bearing layer —
   spend the most care here.
2. **Layer 1 — Architecture.** The handful of top-level pieces and how they divide
   the whole. Name them in the analogy's terms.
3. **Layer 2 — Structure.** The tree/graph/module layout — the "outliner" view.
4. **Layer 3 — Piece-by-piece deep dive.** Walk each unit (script/module/service)
   in turn, still tying back to the analogy.
5. **Layer 4 — Flow.** How the pieces talk — signals, events, calls, data flow.
6. **Layer 5 — Memory hook.** A compact mnemonic or one-paragraph story so it
   sticks after they close the page.
7. **Layer 6 — The one repeating pattern.** Surface the single idiom that recurs
   everywhere; once they see it, the rest is variation.

## Principles

- **Anchor to the learner's actual background.** Ask or infer what they already
  know (prior tools, languages) and build the analogy from *that*, not a generic one.
- **Big picture before syntax.** Never open with an API signature; open with "what
  is this, in terms you already have."
- **One new idea per analogy.** If an analogy needs its own explanation, it's the
  wrong analogy — pick a closer one.
- **Name the seams of the analogy.** Say where it breaks ("unlike a Flash symbol,
  a Godot scene can…") so the learner doesn't over-trust it.
- **End with retention, not just exposition.** Layers 5–6 are what make it durable;
  don't drop them to save space.

## Output shape

Use clear layer headers, a comparison **table** for Layer 0, and short prose per
layer. Diagrams (trees, signal-flow arrows) help Layers 2 and 4. Keep each layer
skimmable — this is a map the learner returns to, not a wall of text.

## Adapt the layer count

Not every subject needs all seven. A small utility might be Layers 0, 3, 6. A big
framework earns the full ladder. Keep the **shape** (analogy → architecture →
detail → flow → hook → pattern); prune layers that add nothing.
