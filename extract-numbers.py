import cv2
import pytesseract
import numpy as np
from PIL import Image
import os

# Verify if file exists
if not os.path.exists('./captcha.png'):
    print("Error: captcha.png not found")
    exit()

# Read the image and verify it was loaded
image = cv2.imread('./captcha.png')
if image is None:
    print("Error: Could not load image")
    exit()

# Convert to grayscale
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

# Apply thresholding to preprocess the image
thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

# Apply dilation to connect text components
kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2,2))
dilated = cv2.dilate(thresh, kernel, iterations=1)

# Add some padding around the image
padded = cv2.copyMakeBorder(dilated, 10, 10, 10, 10, cv2.BORDER_CONSTANT, value=[255,255,255])

# Perform OCR with specific configuration for digits
custom_config = r'--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789'
ocr_text = pytesseract.image_to_string(padded, config=custom_config)

# Clean and print the result
cleaned_text = ''.join(filter(str.isdigit, ocr_text))
print(cleaned_text if cleaned_text else "No numbers found")
