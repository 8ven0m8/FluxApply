"""
Blocks the JD scraper from being used to reach non-public addresses
(cloud metadata endpoints, localhost, internal network services, etc.)
via a user-submitted URL.

Two things make this different from a naive "check the URL string" filter:
  1. It resolves the hostname and checks the actual IP(s), not the string —
     so hostnames that just resolve to a private IP (custom DNS, /etc/hosts
     tricks, etc.) are caught, not just literal "127.0.0.1" in the URL.
  2. It's meant to be re-run on EVERY request during a page navigation
     (see scrape_jd's page.route handler), not just the original URL —
     otherwise a URL that resolves publicly but redirects to an internal
     address would sail through a one-time check.
"""

import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = {"http", "https"}


class SSRFBlockedError(ValueError):
    """Raised when a URL points (directly or via DNS) at a non-public address."""
    pass


def _is_disallowed_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    return (
        ip.is_private       # 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, etc.
        or ip.is_loopback   # 127.0.0.0/8, ::1
        or ip.is_link_local # 169.254.0.0/16 (AWS/GCP/Azure metadata lives here) and fe80::/10
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def assert_public_url(url: str) -> None:
    """
    Raises SSRFBlockedError if `url` is not a safe, public http(s) URL.
    Checks EVERY address a hostname resolves to (IPv4 + IPv6) — a hostname
    is blocked if ANY resolved address is private/internal, since an
    attacker only needs one resolver response to point at an internal IP.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ALLOWED_SCHEMES:
        raise SSRFBlockedError(f"URL scheme must be http or https, got {parsed.scheme!r}.")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFBlockedError("URL has no hostname.")

    if hostname.lower() in ("localhost", "localhost.localdomain"):
        raise SSRFBlockedError("URLs pointing at localhost are blocked.")

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise SSRFBlockedError(f"Could not resolve host {hostname!r}: {e}")

    for _family, _type, _proto, _canonname, sockaddr in addr_infos:
        ip_str = sockaddr[0]
        if _is_disallowed_ip(ip_str):
            raise SSRFBlockedError(
                f"{hostname!r} resolves to a non-public address ({ip_str}) and is blocked."
            )
