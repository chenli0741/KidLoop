import Foundation
import Capacitor
import Security

@objc(KidLoopCredentialsPlugin)
public class KidLoopCredentialsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KidLoopCredentialsPlugin"
    public let jsName = "KidLoopCredentials"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "com.chenli0741.kidloop.saved-login"

    @objc func list(_ call: CAPPluginCall) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["accounts": []])
            return
        }
        guard status == errSecSuccess else {
            call.reject("Saved accounts could not be read", "KEYCHAIN_READ_FAILED")
            return
        }
        // Match-all normally returns an array. Accept one dictionary as well so
        // the picker still works across Keychain implementations and upgrades.
        let items: [[String: Any]]
        if let array = result as? [[String: Any]] {
            items = array
        } else if let item = result as? [String: Any] {
            items = [item]
        } else {
            call.reject("Saved accounts could not be decoded", "KEYCHAIN_READ_FAILED")
            return
        }
        let accounts = items.compactMap { item -> [String: String]? in
            guard let email = item[kSecAttrAccount as String] as? String,
                  let data = item[kSecValueData as String] as? Data,
                  let password = String(data: data, encoding: .utf8) else { return nil }
            return ["email": email, "password": password]
        }.sorted { ($0["email"] ?? "") < ($1["email"] ?? "") }
        call.resolve(["accounts": accounts])
    }

    @objc func save(_ call: CAPPluginCall) {
        let email = (call.getString("email") ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let password = call.getString("password") ?? ""
        guard !email.isEmpty, email.count <= 254, !password.isEmpty, password.count <= 128,
              let data = password.data(using: .utf8) else {
            call.reject("Invalid saved account", "INVALID_ACCOUNT")
            return
        }
        let key: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: email
        ]
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(key as CFDictionary, update as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var add = key
            update.forEach { add[$0.key] = $0.value }
            let addStatus = SecItemAdd(add as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                call.reject("Saved account could not be stored", "KEYCHAIN_SAVE_FAILED")
                return
            }
        } else if updateStatus != errSecSuccess {
            call.reject("Saved account could not be stored", "KEYCHAIN_SAVE_FAILED")
            return
        }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        let email = (call.getString("email") ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !email.isEmpty else {
            call.reject("Invalid saved account", "INVALID_ACCOUNT")
            return
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: email
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Saved account could not be removed", "KEYCHAIN_DELETE_FAILED")
            return
        }
        call.resolve()
    }
}
