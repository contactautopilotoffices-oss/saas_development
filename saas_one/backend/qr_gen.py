"""
QR Code & Barcode Generator for Autopilot Inventory System

Purpose: Generates barcode images for inventory/stock items.
Each stock item gets a unique barcode (Code128 format) that can be scanned
for quick lookup in the warehouse or on-site stock management.

Why Code128: Chosen for its robustness with alphanumeric strings commonly
found in inventory codes (e.g., "ITEM-001", "STOCK-ABC123").
Supports all 128 ASCII characters and is industry-standard for inventory.
"""

import barcode
from barcode.writer import ImageWriter
import os
import sys


def generate_barcode(item_id, output_path):
    """
    Generates a Code128 barcode for a given item_id and saves it as a PNG.

    What it does:
      1. Creates a Code128 barcode object using the python-barcode library.
      2. Ensures the output directory exists.
      3. Renders the barcode as a PNG image with the specified look settings.
      4. Saves the file and returns a success/failure status.

    Why it works this way:
      - Code128 is used because it efficiently encodes alphanumeric inventory codes.
      - ImageWriter produces PNG output (widely compatible with all systems).
      - Output path extension is handled automatically (.png is appended).

    API / Library used:
      - `barcode.get_barcode_class('code128')` — Factory function that returns
        the Code128 barcode class from the python-barcode package.
      - `ImageWriter()` — Renders the barcode as a raster image (PNG).
      - `barcode.save(output_path, options)` — Writes the image to disk with
        the provided style options.

    Parameters:
      item_id (str): The inventory code/barcode value to encode (e.g., "STOCK-001").
      output_path (str): Full path (without .png extension) where the image will be saved.

    Returns:
      bool: True if the barcode was generated and saved successfully, False otherwise.
    """
    try:
        # Get the Code128 barcode class from the barcode library
        # Code128 is robust for alphanumeric strings commonly found in inventory codes
        CODE128 = barcode.get_barcode_class('code128')

        # Ensure the directory exists before writing
        # os.makedirs with exist_ok=True prevents errors if the directory already exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Create the barcode object with ImageWriter to support PNG output
        # display_value=True would add the text label below the bars (disabled here)
        my_barcode = CODE128(item_id, writer=ImageWriter())

        # Configuration options for the barcode appearance:
        #   module_height: Height of each bar in points (1 point = 1/72 inch)
        #   module_width: Width of each bar module (controls overall density)
        #   font_size: Size of the text label rendered below the barcode
        #   text_distance: Vertical gap between the bars and the text label
        #   quiet_zone: Minimum whitespace margin on left/right (prevents scan errors)
        options = {
            'module_height': 15.0,
            'module_width': 0.2,
            'font_size': 10,
            'text_distance': 5.0,
            'quiet_zone': 6.5,
        }

        # Save the image — ImageWriter automatically appends ".png" to the filename
        # Note: output_path should NOT include the file extension
        my_barcode.save(output_path, options)
        print(f"Barcode successfully saved to: {output_path}.png")
        return True
    except Exception as e:
        # Catch all errors (missing library, invalid chars, file system issues)
        print(f"Error generating barcode: {str(e)}")
        return False


if __name__ == "__main__":
    """
    CLI entry point for running the barcode generator standalone.

    Usage: python qr_gen.py <item_id> <output_path_without_extension>
    Example: python qr_gen.py STOCK-001 /public/qrcodes/STOCK-001

    Why CLI: Allows generating barcodes via scripts, cron jobs, or the
    Next.js API route without importing the function directly.
    """
    if len(sys.argv) < 3:
        print("Usage: python qr_gen.py <item_id> <output_path_without_extension>")
        sys.exit(1)

    # sys.argv[1] = the inventory item ID to encode
    # sys.argv[2] = the output file path (without .png extension)
    identifier = sys.argv[1]
    output_path = sys.argv[2]

    success = generate_barcode(identifier, output_path)
    if not success:
        sys.exit(1)
