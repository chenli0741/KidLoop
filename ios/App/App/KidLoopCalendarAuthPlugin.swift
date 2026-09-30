import Foundation
import Capacitor
import AuthenticationServices
import UIKit

@objc(KidLoopCalendarAuthPlugin)
public class KidLoopCalendarAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "KidLoopCalendarAuthPlugin"
    public let jsName = "KidLoopCalendarAuth"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)]
    private var session: ASWebAuthenticationSession?
    private var anchor: UIWindow?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value), url.scheme == "https",
              url.host == "accounts.google.com", url.path == "/o/oauth2/v2/auth", url.user == nil, url.password == nil else {
            call.reject("Invalid authorization URL", "INVALID_URL"); return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.session == nil, let window = self.bridge?.viewController?.view.window else {
                call.reject("Authentication window unavailable", "UNAVAILABLE"); return
            }
            self.anchor = window
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "kidloop-calendar") { [weak self] callback, error in
                DispatchQueue.main.async {
                    self?.session = nil; self?.anchor = nil
                    guard error == nil, let callback = callback, callback.scheme == "kidloop-calendar", callback.host == "complete" else {
                        call.reject("Authorization was not completed", "CANCELLED"); return
                    }
                    call.resolve(["url": callback.absoluteString])
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() { self.session = nil; self.anchor = nil; call.reject("Authentication window could not open", "UNAVAILABLE") }
        }
    }
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor ?? ASPresentationAnchor() }
}
