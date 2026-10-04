#!/usr/bin/env python3
"""
AERORES-AI Local Simulation Server
Team Pegasus - SIH 2026 (Qualcomm Inc. PS-26177)
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import socket

DEFAULT_PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

def find_available_server(start_port=8000, max_attempts=10):
    for port in range(start_port, start_port + max_attempts):
        try:
            httpd = ReusableTCPServer(("", port), Handler)
            return httpd, port
        except OSError as e:
            if getattr(e, 'errno', None) in (48, 98, 10048): # Address already in use (macOS/Linux/Windows)
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                        print(f"[*] Port {port} is already active and serving.")
                except Exception:
                    pass
                continue
            raise
    return None, None

def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
    os.chdir(DIRECTORY)
    httpd, port = find_available_server(DEFAULT_PORT)

    if not httpd:
        url = f"http://localhost:{DEFAULT_PORT}"
        print(f"[*] Simulation server is already running on {url}!")
        print("Opening simulation in your web browser...")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        return

    url = f"http://localhost:{port}"
    print("=" * 65)
    print("  🚁 AERORES-AI: Autonomous Disaster Rescue UAV Simulation")
    print("  🏆 Team Pegasus | Smart India Hackathon 2026")
    print(f"  🌐 Running locally at: {url}")
    print("=" * 65)
    print("Opening simulation in your web browser...")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    print("Server active! Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server cleanly...")
    finally:
        httpd.server_close()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n[ERROR] Server encountered an error: {e}")
