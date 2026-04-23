"""Compile brand/logo/logo-mark-{16,32}.png into a multi-size favicon.ico.

Also copies the canonical icon PNGs into src/app/ per Next.js app-router conventions.
"""
from pathlib import Path
import shutil
from PIL import Image

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent / "src" / "app"

# 1. Multi-size favicon.ico
mark32 = Image.open(HERE / "logo-mark-32.png").convert("RGBA")
favicon_path = APP / "favicon.ico"
mark32.save(favicon_path, format="ICO", sizes=[(16, 16), (32, 32)])
print(f"wrote {favicon_path}")

# 2. Next.js app-router icon convention
shutil.copy(HERE / "logo-mark-32.png", APP / "icon.png")
print(f"wrote {APP / 'icon.png'}")

# 3. iOS home-screen icon
shutil.copy(HERE / "logo-mark-180.png", APP / "apple-icon.png")
print(f"wrote {APP / 'apple-icon.png'}")

print("done.")
