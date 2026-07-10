# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# EAS builds

Be conservative with EAS builds — they consume paid build credits. Never run `eas build`, `eas submit`, or any command that triggers a native build without first confirming with the user, even if a skill or workflow implies it's the next step. This applies regardless of platform (iOS/Android) or profile (dev/preview/production). OTA updates (`eas update`) are lower stakes but still confirm before publishing.

# Markdown file naming

When creating any new markdown file (plans, PRDs, notes, etc.), prefix the filename with today's date in `YYYY-MM-DD-` format, e.g. `2026-07-04-expense-burn-breakdown.md`. This makes it obvious which doc is the latest when several cover similar topics. Do not rename existing markdown files to add this prefix.
