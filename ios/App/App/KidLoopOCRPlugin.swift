import Foundation
import Capacitor

@objc(KidLoopOCRPlugin)
public class KidLoopOCRPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KidLoopOCRPlugin"
    public let jsName = "KidLoopOCR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "com.kidloop.ocr", qos: .userInitiated)
    private let lock = NSLock()
    private var busy = false

    @objc func capabilities(_ call: CAPPluginCall) {
        do { call.resolve(["onDevice": true, "languages": try DeviceVision.languages()]) }
        catch { call.reject("Text recognition unavailable", "OCR_UNAVAILABLE") }
    }
    @objc func recognize(_ call: CAPPluginCall) {
        lock.lock()
        if busy { lock.unlock(); call.reject("Recognition already running", "OCR_BUSY"); return }
        busy = true
        lock.unlock()
        let encoded = call.getString("base64") ?? ""
        let languages = call.getArray("languages", String.self) ?? ["zh-Hans", "zh-Hant", "en-US"]
        queue.async { [weak self] in
            guard let self else { call.reject("Recognition closed", "OCR_CLOSED"); return }
            defer { self.lock.lock(); self.busy = false; self.lock.unlock() }
            guard !encoded.isEmpty, encoded.utf8.count <= 20 * 1024 * 1024,
                  let data = Data(base64Encoded: encoded) else {
                call.reject("Invalid image data", "OCR_INVALID_IMAGE"); return
            }
            do { call.resolve(try DeviceVision.recognize(data, languages: languages)) }
            catch { call.reject(error.localizedDescription, "OCR_FAILED") }
        }
    }
}
