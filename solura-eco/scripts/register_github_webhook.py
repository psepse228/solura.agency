#!/usr/bin/env python3
"""Register a GitHub webhook for push events, pointed at the deployed
backend's /webhooks/github. Uses the gh CLI (already authenticated) rather
than a raw token, so no GitHub credential needs to touch this script.

Usage: python scripts/register_github_webhook.py <owner/repo> <webhook-url> <secret>
Example:
  python scripts/register_github_webhook.py psepse228/Argus \
    https://backend-production-7694a.up.railway.app/webhooks/github \
    <same value as GITHUB_WEBHOOK_SECRET>
"""
import json
import subprocess
import sys


def main():
    if len(sys.argv) != 4:
        print(
            "Usage: python scripts/register_github_webhook.py <owner/repo> <webhook-url> <secret>",
            file=sys.stderr,
        )
        sys.exit(1)

    repo, webhook_url, secret = sys.argv[1], sys.argv[2], sys.argv[3]

    result = subprocess.run(
        [
            "gh", "api", f"repos/{repo}/hooks",
            "-f", "name=web",
            "-F", "active=true",  # -F (not -f) so gh sends a real boolean, not the string "true"
            "-f", "events[]=push",
            "-f", f"config[url]={webhook_url}",
            "-f", "config[content_type]=json",
            "-f", f"config[secret]={secret}",
        ],
        capture_output=True, text=True,
    )

    if result.returncode != 0:
        # Don't print result.stderr verbatim -- it's GitHub's raw API error
        # response, not something guaranteed to never echo back request
        # data. Strip the secret out defensively even though it shouldn't
        # appear there in practice.
        safe_stderr = result.stderr.replace(secret, "***")
        print(f"FAILED for {repo}: {safe_stderr}", file=sys.stderr)
        sys.exit(1)

    hook = json.loads(result.stdout)
    print(f"Registered webhook {hook['id']} on {repo} -> {webhook_url}")


if __name__ == "__main__":
    main()
