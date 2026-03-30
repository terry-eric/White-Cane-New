# White cane for 2026/01/22

## Local HTTPS dev server

For Web Bluetooth testing, run a temporary HTTPS server:

```bash
python3 scripts/dev_https_server.py --dir . --port 8443
```

Then open:

- https://localhost:8443
- or `https://<your-lan-ip>:8443` on another device in the same network

Notes:

- The script auto-generates a self-signed cert at `.cert/dev-cert.pem` and `.cert/dev-key.pem`.
- Browser may show a security warning for the self-signed cert; proceed manually for local testing.

### Create cert manually

If you want to create cert/key yourself first:

```bash
mkdir -p .cert
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 30 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -keyout .cert/dev-key.pem \
  -out .cert/dev-cert.pem
```

Then start server with your cert:

```bash
python3 scripts/dev_https_server.py --dir . --port 8443 --cert .cert/dev-cert.pem --key .cert/dev-key.pem
```

### Trusted cert for LAN/mobile (recommended)

For phone/LAN testing, use a trusted local CA (for example `mkcert`) so browser APIs are less likely to be blocked:

```bash
mkcert localhost 127.0.0.1 <your-lan-ip>
python3 scripts/dev_https_server.py --dir . --port 8443 --cert localhost+2.pem --key localhost+2-key.pem
```
