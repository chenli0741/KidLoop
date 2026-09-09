# Pickup camera models

YuNet face detection and SFace embeddings from OpenCV Zoo:
- https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface

Downloaded 2026-09-08. Original model files are unchanged. See YUNET-LICENSE.txt (MIT) and SFACE-LICENSE.txt (Apache-2.0). SHA256 checksums are in SHA256SUMS.

These are browser WASM models, not Apple Vision or Apple Intelligence. Model inference and student-photo comparison stay in browser memory; embeddings and cabin photos are not stored. Seatbelt assistance is a separate optional server request.
