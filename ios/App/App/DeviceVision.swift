import Foundation
import Vision
import ImageIO

// No URL loading or file persistence: all requests operate on supplied image bytes.
enum DeviceVision {
    static func languages() throws -> [String] {
        try VNRecognizeTextRequest().supportedRecognitionLanguages()
    }
    static func recognize(_ data: Data, languages requested: [String]) throws -> [String: Any] {
        guard data.count <= 15 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= 20000, height <= 20000,
              width * height <= 24_000_000 else {
            throw NSError(domain: "KidLoopOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid image or image exceeds 15 MB / 24 megapixels"])
        }
        let orientation = CGImagePropertyOrientation(rawValue: (properties[kCGImagePropertyOrientation] as? UInt32) ?? 1) ?? .up
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let supported = try request.supportedRecognitionLanguages()
        let languages = requested.filter { supported.contains($0) }
        guard !languages.isEmpty else {
            throw NSError(domain: "KidLoopOCR", code: 2, userInfo: [NSLocalizedDescriptionKey: "Requested recognition languages are unavailable on this device"])
        }
        request.recognitionLanguages = languages
        try VNImageRequestHandler(data: data, orientation: orientation).perform([request])
        let blocks: [[String: Any]] = (request.results ?? []).compactMap { observation in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let rect = observation.boundingBox
            return ["text": candidate.string, "confidence": candidate.confidence,
                    "box": ["x": Double(rect.minX), "y": Double(1 - rect.maxY), "width": Double(rect.width), "height": Double(rect.height)]]
        }
        let rotated = [5, 6, 7, 8].contains(Int(orientation.rawValue))
        return ["text": blocks.compactMap { $0["text"] as? String }.joined(separator: "\n"),
                "blocks": blocks, "languages": languages,
                "width": rotated ? height : width, "height": rotated ? width : height]
    }
}
