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

# Ensure UTF-8 printing in Windows console
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def main():
    os.chdir(DIRECTORY)
    socketserver.TCPServer.allow_reuse_address = True
    
    selected_port = None
    httpd = None
    for port in [8000, 8080, 8081, 8888, 3000]:
        try:
            httpd = socketserver.TCPServer(("", port), Handler)
            selected_port = port
            break
        except OSError:
            continue

    if not httpd:
        print("Error: Could not bind to any port.")
        return

    with httpd:
        url = f"http://localhost:{selected_port}"
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
        print("Press Ctrl+C to stop the server.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")

if __name__ == "__main__":
    main()
