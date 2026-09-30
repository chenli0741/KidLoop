import Foundation
import Capacitor
import UIKit
import UserNotifications

@objc(KidLoopNotificationsPlugin)
public class KidLoopNotificationsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KidLoopNotificationsPlugin"
    public let jsName = "KidLoopNotifications"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingRoute", returnType: CAPPluginReturnPromise)
    ]
    private static weak var active: KidLoopNotificationsPlugin?
    private static var pendingCall: CAPPluginCall?
    private static var pendingPath: String?

    public override func load() { KidLoopNotificationsPlugin.active = self }

    @objc func register(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            DispatchQueue.main.async {
                if let error = error { call.reject(error.localizedDescription); return }
                guard granted else { call.resolve(self.registration(status: "denied", token: nil)); return }
                KidLoopNotificationsPlugin.pendingCall = call
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    @objc func getPendingRoute(_ call: CAPPluginCall) {
        let path = KidLoopNotificationsPlugin.pendingPath
        KidLoopNotificationsPlugin.pendingPath = nil
        call.resolve(path == nil ? [:] : ["path": path!])
    }

    private func registration(status: String, token: String?) -> [String: Any] {
        var identifier = UserDefaults.standard.string(forKey: "kidloop.notification.installation")
        if identifier == nil { identifier = UUID().uuidString.lowercased(); UserDefaults.standard.set(identifier, forKey: "kidloop.notification.installation") }
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        var value: [String: Any] = ["status": status, "installationId": identifier!, "environment": environment]
        if let token = token { value["token"] = token }
        return value
    }

    static func didRegister(token: Data) {
        let value = token.map { String(format: "%02x", $0) }.joined()
        guard let plugin = active, let call = pendingCall else { return }
        pendingCall = nil
        call.resolve(plugin.registration(status: "authorized", token: value))
    }
    static func didFail(_ error: Error) { pendingCall?.reject(error.localizedDescription); pendingCall = nil }
    static func didOpen(path: String) {
        guard path.hasPrefix("/driver") else { return }
        pendingPath = path
        active?.notifyListeners("notificationOpened", data: ["path": path])
    }
}
