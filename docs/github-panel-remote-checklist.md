# GitHub panel remote-session checklist

This draft PR supplies a second card and a longer title for dogfooding.

- Confirm the session server has GitHub CLI installed and authenticated.
- Verify that the panel lists PRs authored by the server’s active account.
- Switch between session directories and verify that cards never leak between repositories.
- Hide the panel and confirm that periodic reads stop.
- Reopen it and confirm that cached cards appear while stale data refreshes.
- Interrupt connectivity and verify that cached cards remain with an error message.
- Restore connectivity and use Refresh to recover.

Close this draft when no longer needed; it does not need to be merged.
