import Capacitor
import Foundation
import Security

/**
 * Device-only, when-unlocked iOS Keychain storage for a refresh credential.
 * No access token, account email, ranked score or private profile is persisted.
 */
@objc(CpiSecureSession)
public class CpiSecureSession: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CpiSecureSession"
    public let jsName = "CpiSecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "readRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearRefreshToken", returnType: CAPPluginReturnPromise)
    ]

    private func itemQuery() -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "cpi") + ".secure-session.v1",
            kSecAttrAccount as String: "refresh"
        ]
    }

    /**
     * Keychain entries can survive uninstall. Clear any orphan on first install;
     * only this app's own service/account is touched.
     */
    private func prepareInstall() -> Bool {
        let marker = "cpi.secure-session.installed.v1"
        if UserDefaults.standard.bool(forKey: marker) { return true }
        let status = SecItemDelete(itemQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { return false }
        UserDefaults.standard.set(true, forKey: marker)
        return true
    }

    private func valid(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        return bytes.count >= 16 && bytes.count <= 4096 && bytes.allSatisfy { $0 >= 33 && $0 <= 126 }
    }

    @objc func readRefreshToken(_ call: CAPPluginCall) {
        guard prepareInstall() else { call.reject("Protected session is unavailable."); return }
        var query = itemQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let bytes = result as? Data,
              let value = String(data: bytes, encoding: .utf8),
              valid(value) else {
            call.reject("Protected session could not be restored.")
            return
        }
        call.resolve(["value": value])
    }

    @objc func writeRefreshToken(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), valid(value) else {
            call.reject("Invalid refresh credential.")
            return
        }
        guard prepareInstall() else { call.reject("Protected credential storage is unavailable."); return }
        let data = Data(value.utf8)
        var status = SecItemUpdate(
            itemQuery() as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if status == errSecItemNotFound {
            var item = itemQuery()
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            item[kSecAttrSynchronizable as String] = false
            status = SecItemAdd(item as CFDictionary, nil)
        }
        if status == errSecSuccess { call.resolve() }
        else { call.reject("Protected credential storage is unavailable.") }
    }

    @objc func clearRefreshToken(_ call: CAPPluginCall) {
        guard prepareInstall() else { call.reject("Protected session is unavailable."); return }
        let status = SecItemDelete(itemQuery() as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() }
        else { call.reject("Protected credential could not be cleared.") }
    }
}
