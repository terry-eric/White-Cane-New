#!/usr/bin/env python3
from __future__ import annotations

import argparse
import socket
import ssl
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def ensure_certificates(cert_path: Path, key_path: Path, days: int) -> None:
    if cert_path.exists() and key_path.exists():
        return

    cert_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-nodes",
        "-days",
        str(days),
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,IP:127.0.0.1",
        "-keyout",
        str(key_path),
        "-out",
        str(cert_path),
    ]

    subprocess.run(cmd, check=True)


def resolve_local_ips() -> list[str]:
    ips = set()
    hostname = socket.gethostname()
    for family, _, _, _, sockaddr in socket.getaddrinfo(hostname, None):
        if family == socket.AF_INET:
            ip = sockaddr[0]
            if not ip.startswith("127."):
                ips.add(ip)
    return sorted(ips)


def main() -> None:
    parser = argparse.ArgumentParser(description="Temporary HTTPS static server for local testing.")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8443, help="Bind port (default: 8443)")
    parser.add_argument("--dir", default=".", help="Directory to serve (default: current directory)")
    parser.add_argument("--cert", default=".cert/dev-cert.pem", help="Certificate file path")
    parser.add_argument("--key", default=".cert/dev-key.pem", help="Private key file path")
    parser.add_argument("--days", type=int, default=30, help="Self-signed cert valid days")
    args = parser.parse_args()

    serve_dir = Path(args.dir).resolve()
    cert_path = Path(args.cert).resolve()
    key_path = Path(args.key).resolve()

    ensure_certificates(cert_path, key_path, args.days)

    handler = partial(SimpleHTTPRequestHandler, directory=str(serve_dir))
    httpd = ThreadingHTTPServer((args.host, args.port), handler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    print(f"Serving directory: {serve_dir}")
    print(f"HTTPS localhost: https://localhost:{args.port}")
    for ip in resolve_local_ips():
        print(f"HTTPS LAN: https://{ip}:{args.port}")
    print("Press Ctrl+C to stop.")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
