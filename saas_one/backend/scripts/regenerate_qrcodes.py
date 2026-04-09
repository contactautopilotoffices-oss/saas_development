import httpx
import os
import subprocess
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def regenerate_all_qrcodes():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    # URL to fetch all stock items
    rest_url = f"{SUPABASE_URL}/rest/v1/stock_items?select=id,barcode"
    
    print(f"Fetching items from {SUPABASE_URL}...")
    
    try:
        with httpx.Client() as client:
            response = client.get(rest_url, headers=headers)
            response.raise_for_status()
            items = response.json()
            
            print(f"Found {len(items)} items. Starting regeneration...")
            
            success_count = 0
            for item in items:
                barcode = item.get("barcode")
                if not barcode:
                    print(f"Skipping item {item['id']} as it has no barcode")
                    continue
                
                output_path = os.path.join("public", "qrcodes", barcode)
                
                print(f"Generating QR code for {barcode}...")
                # Call the qr_gen.py script
                result = subprocess.run(
                    ["python", "backend/qr_gen.py", barcode, output_path],
                    capture_output=True,
                    text=True
                )
                
                if result.returncode == 0:
                    success_count += 1
                else:
                    print(f"Failed to generate for {barcode}: {result.stderr}")
            
            print(f"Regeneration complete. Successfully generated {success_count}/{len(items)} QR codes.")
            
    except Exception as e:
        print(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    regenerate_all_qrcodes()
