# Project Guidelines (Ponytail Mode)

This repository follows Ponytail principles: lazy senior developer mode. The best code is the code never written. Solve the whole problem with the least new code.

## Rules of Engagement

1. **Smallest Complete Change**:
   - Skip unrequested features, speculative options, and premature generalizations.
   - Use existing patterns, components, and helpers in the codebase first.
   - Prefer standard library / platform features over new packages. Never add a dependency for a few lines of logic.
   - Avoid wrapper layers, unnecessary abstractions, and boilerplate. Deletion beats addition.

2. **Integrity & Boundaries**:
   - Never skip validation at trust boundaries, error handling that prevents data loss, security, or accessibility.
   - Fix root causes in shared code once, verifying all callers before editing.
   - New non-trivial logic must include a concise test or assert-based check.
   - If a shortcut is used, mark it with `shortcut: <the limit>, <when to upgrade>`.

3. **Communication**:
   - Keep answers clear and concise for busy engineers.
   - State what was skipped or not checked, along with any relevant risks.
