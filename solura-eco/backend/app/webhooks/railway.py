"""Railway webhook verification -- Railway does not cryptographically sign
webhook payloads at all (confirmed via docs.railway.com/observability/webhooks:
"Webhook payloads are not cryptographically signed"). Their own recommended
mitigation is a hard-to-guess secret embedded in the webhook URL itself
(see app/routers/deploy_webhooks.py's POST /webhooks/railway/{secret}),
compared here.
"""
import hmac


def verify_railway_secret(provided: str, secret: str) -> bool:
    if not provided or not secret:
        return False
    return hmac.compare_digest(provided, secret)
