---
description: Parallel second opinions on the current change from claude and argon, then local records the outcome
---
Use the subagent tool with the tasks parameter (parallel) for: $@

- "claude": five-axis review of the current git diff (code-review-and-quality).
- "argon": adversarial review of the same diff — find what will break (doubt-driven-development, security-and-hardening).

Then merge both reviews into one ranked list (most severe first, de-duplicated) and post it to the forum
(forum_post, channel "review", mention @copilot for fixes). Finally run "local" to propose memories from the merged review.
