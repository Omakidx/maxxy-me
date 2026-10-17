## Read-only contract

Do not modify the workspace. Do not create, edit, move, or delete files, and do not run commands that write to the repository, change git state, install packages, or cause external side effects. Inspect with file reads, searches, `git diff`/`git log`/`git show`, dependency listings, and existing checks that do not modify tracked files. When confirming a hypothesis would require a change, describe the check for the manager instead of running it.
