import Foundation
import Capacitor
import UIKit

@objc(KidLoopNavigationPlugin)
public class KidLoopNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KidLoopNavigationPlugin"
    public let jsName = "KidLoopNavigation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "navigate", returnType: CAPPluginReturnPromise)
    ]

    @objc func navigate(_ call: CAPPluginCall) {
        let provider = call.getString("provider") ?? ""
        let address = call.getString("address")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !address.isEmpty, address.count <= 500 else {
            call.reject("Invalid destination", "INVALID_DESTINATION")
            return
        }
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        guard let encoded = address.addingPercentEncoding(withAllowedCharacters: allowed) else {
            call.reject("Invalid destination", "INVALID_DESTINATION")
            return
        }
        let value: String
        if provider == "apple" {
            value = "https://maps.apple.com/?daddr=\(encoded)&dirflg=d"
        } else if provider == "google" {
            value = "comgooglemaps://?daddr=\(encoded)&directionsmode=driving"
        } else {
            call.reject("Unsupported map provider", "INVALID_PROVIDER")
            return
        }
        guard let url = URL(string: value), UIApplication.shared.canOpenURL(url) else {
            call.reject("Selected map is unavailable", "MAP_UNAVAILABLE")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("Selected map could not open", "OPEN_FAILED") }
            }
        }
    }
}
