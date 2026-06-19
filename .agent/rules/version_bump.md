# Automatic Version Bumping Rule

Whenever you develop a new feature, fix a bug, modify any code, or update any files in this project, you MUST run the version bump script to increment the version number:

`cmd.exe /c node bump.cjs`

This script automatically updates the version in `package.json` and syncs it with `server/package.json` using base-10 carry rules (e.g., `3.2.9` -> `3.3.0`).

Always run this command as the final step of your code modifications, and inform the user of the new version number in your final response.
