import os
import cloudinary
import cloudinary.uploader
import cloudinary.api
from fastapi import UploadFile, HTTPException

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# Initialize Cloudinary if credentials are provided
if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET
    )

def upload_to_cloudinary(file: UploadFile, folder: str = "classbridge") -> str:
    """
    Uploads a file to Cloudinary and returns the secure URL.
    Returns None if Cloudinary is not configured or an error occurs.
    """
    if not CLOUDINARY_CLOUD_NAME:
        # Fallback for local dev if cloudinary is not set up
        return None
        
    try:
        # We read the file content
        contents = file.file.read()
        
        # Upload using the bytes
        result = cloudinary.uploader.upload(
            contents,
            folder=folder,
            resource_type="auto" # Automatically detect image/raw(document)/video
        )
        
        # Reset the file cursor in case it's needed again
        file.file.seek(0)
        
        return result.get("secure_url")
    except Exception as e:
        print(f"Cloudinary upload error: {e}")
        return None
