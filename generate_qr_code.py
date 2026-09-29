#!/usr/bin/env python3
"""
QR Code Generator for SIH 2026 Slide 7
Generates a high-resolution QR code PNG for your PPT
"""

import urllib.request
import urllib.parse
import sys
import os

# Ensure UTF-8 printing in Windows console
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def generate_qr(target_url, output_filename="simulation_qr_code.png"):
    print(f"Generating QR code for: {target_url}")
    encoded_url = urllib.parse.quote(target_url)
    api_url = f"https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&color=000000&bgcolor=ffffff&qzone=2&data={encoded_url}"
    
    try:
        req = urllib.request.Request(
            api_url,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req) as response, open(output_filename, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print(f"[SUCCESS] QR Code saved successfully as '{output_filename}' ({len(data)} bytes)!")
        print(f"[ACTION] You can now insert '{output_filename}' directly into Slide 7 of your SIH PPT!")
    except Exception as e:
        print(f"[ERROR] Error generating QR code: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        url = input("Enter your deployed simulation URL (e.g., https://yourname.github.io/disaster-rescue-drone/): ").strip()
        if not url:
            url = "https://team-pegasus-sih2026.github.io/disaster-rescue-uav/"
    generate_qr(url)
