---
description: Have the local model triage a long log file offline before a frontier model reads it
---
Use the subagent tool to run the "local" agent with this task:

Read the log file $1 (use read with offset/limit in chunks if it is large). Report:
1. Timeline of key state changes (connect, disconnect, session start/stop) with timestamps.
2. Every ERROR/FATAL/exception line, quoted, with its timestamp, de-duplicated with counts.
3. The final state at the end of the log.
Do not guess causes. Post the summary to the forum (channel "logs") and return it.
