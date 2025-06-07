from flask import Flask, request, jsonify
import cv2
import numpy as np
from pyzbar.pyzbar import decode
import base64
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": "*",  
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept"],
    }
})  # Allow requests from React frontend

@app.route('/scan', methods=['POST'])
def scan_qr():
    data = request.get_json()
    image_b64 = data['image'].split(",")[1]
    image_bytes = base64.b64decode(image_b64)
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    qr_codes = decode(img)
    results = []

    for qr in qr_codes:
        results.append({
            "data": qr.data.decode("utf-8"),
            "position": {"x": qr.rect.left, "y": qr.rect.top}
        })

    return jsonify(results)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
