#!/usr/bin/env python3
"""
Generate a professional, high-resolution "RUN SIMULATION" QR Code Card
for SIH 2026 Judges & Presentation Slides.
"""

import qrcode
from PIL import Image, ImageDraw, ImageFont
import os

URL = "https://devanshlila.github.io/SIH2026/"

def create_qr_card():
    # 1. Generate high-resolution QR code
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(URL)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#070a12", back_color="#ffffff").convert("RGBA")
    qr_w, qr_h = qr_img.size  # approx 370x370

    # 2. Setup Card Canvas (Dark futuristic tech styling with cyan borders)
    card_w = 640
    card_h = 760
    card = Image.new("RGBA", (card_w, card_h), (7, 10, 18, 255))
    draw = ImageDraw.Draw(card)

    # 3. Outer Neon / Cyan Border
    draw.rounded_rectangle([(12, 12), (card_w - 12, card_h - 12)], radius=18, outline=(0, 240, 255, 230), width=3)
    draw.rounded_rectangle([(18, 18), (card_w - 18, card_h - 18)], radius=14, outline=(2, 132, 199, 100), width=1)

    # Corner tactical tick marks
    tick_len = 24
    draw.line([(12, 36), (12, 12), (36, 12)], fill=(0, 240, 255, 255), width=4)
    draw.line([(card_w - 36, 12), (card_w - 12, 12), (card_w - 12, 36)], fill=(0, 240, 255, 255), width=4)
    draw.line([(12, card_h - 36), (12, card_h - 12), (36, card_h - 12)], fill=(0, 240, 255, 255), width=4)
    draw.line([(card_w - 36, card_h - 12), (card_w - 12, card_h - 12), (card_w - 12, card_h - 36)], fill=(0, 240, 255, 255), width=4)

    # 4. Header Badges
    try:
        # Load standard system truetype fonts if available
        font_sub = ImageFont.truetype("arial.ttf", 15)
        font_title = ImageFont.truetype("arialbd.ttf", 34)
        font_url = ImageFont.truetype("consola.ttf", 15)
        font_footer = ImageFont.truetype("arial.ttf", 13)
    except Exception:
        font_sub = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_url = ImageFont.load_default()
        font_footer = ImageFont.load_default()

    # Top Subtitle
    top_badge = "🚁 AERORES-AI  //  SIH 2026 QUALCOMM PS-26177"
    draw.text((card_w // 2, 45), top_badge, fill=(56, 189, 248, 255), font=font_sub, anchor="mm")

    # Big Prominent Title: RUN SIMULATION
    title_text = "⚡ RUN SIMULATION ⚡"
    draw.text((card_w // 2, 88), title_text, fill=(0, 240, 255, 255), font=font_title, anchor="mm")

    # Call to action
    cta_text = "SCAN WITH ANY PHONE CAMERA TO LAUNCH LIVE"
    draw.text((card_w // 2, 128), cta_text, fill=(241, 245, 249, 255), font=font_sub, anchor="mm")

    # 5. Inner White Container for QR Code (ensures 100% camera contrast)
    box_pad = 14
    box_x1 = (card_w - qr_w) // 2 - box_pad
    box_y1 = 152
    box_x2 = box_x1 + qr_w + (box_pad * 2)
    box_y2 = box_y1 + qr_h + (box_pad * 2)
    draw.rounded_rectangle([(box_x1, box_y1), (box_x2, box_y2)], radius=12, fill=(255, 255, 255, 255), outline=(56, 189, 248, 255), width=2)

    # Paste QR image inside white container
    card.paste(qr_img, (box_x1 + box_pad, box_y1 + box_pad), qr_img)

    # 6. Direct URL Banner
    url_box_y = box_y2 + 18
    draw.rounded_rectangle([(50, url_box_y), (card_w - 50, url_box_y + 36)], radius=8, fill=(13, 22, 40, 255), outline=(2, 132, 199, 180), width=1)
    draw.text((card_w // 2, url_box_y + 18), "👉 " + URL, fill=(56, 189, 248, 255), font=font_url, anchor="mm")

    # 7. Footer
    draw.text((card_w // 2, url_box_y + 56), "No Installation Required • Runs on Chrome, Edge, Safari, Firefox", fill=(148, 163, 184, 255), font=font_footer, anchor="mm")
    draw.text((card_w // 2, url_box_y + 76), "Team Pegasus • Disaster Rescue UAV Simulation", fill=(100, 116, 139, 255), font=font_footer, anchor="mm")

    # Save to both target filenames
    card.save("run_simulation_qr.png", "PNG")
    card.save("simulation_qr_code.png", "PNG")
    print("[SUCCESS] Generated 'run_simulation_qr.png' and 'simulation_qr_code.png' successfully!")

if __name__ == "__main__":
    create_qr_card()
