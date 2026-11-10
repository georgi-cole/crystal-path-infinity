import Foundation
import Capacitor
import GoogleMobileAds

@objc(CpiRewardedAds)
public class CpiRewardedAds: CAPPlugin, CAPBridgedPlugin, FullScreenContentDelegate {
    public let identifier = "CpiRewardedAds"
    public let jsName = "CpiRewardedAds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "inventory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dispose", returnType: CAPPluginReturnPromise)
    ]
    private var loaded: RewardedAd?
    private var presented: RewardedAd?
    private var key: String?
    private var generation = 0
    private var localPractice = false
    private var showing = false
    private var presentingKey: String?

    @objc func inventory(_ call: CAPPluginCall) {
        let version = MobileAds.shared.versionNumber
        call.resolve(["sdkVersion": "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"])
    }
    @objc func load(_ call: CAPPluginCall) {
        guard let unit = call.getString("adUnitId"), unit.range(of: "^ca-app-pub-[0-9]{16}/[0-9]{10}$", options: .regularExpression) != nil,
              let owner = call.getString("key"), owner.range(of: "^[A-Za-z0-9_-]{16,100}$", options: .regularExpression) != nil else {
            call.reject("Unavailable"); return
        }
        DispatchQueue.main.async {
            guard !self.showing else { call.reject("Unavailable"); return }
            self.generation += 1
            let epoch = self.generation
            self.loaded = nil
            self.key = owner
            self.localPractice = call.getBool("localPractice") ?? false
            let configuration = MobileAds.shared.requestConfiguration
            if self.localPractice || call.getBool("childDirected") != nil {
                configuration.tagForChildDirectedTreatment = NSNumber(
                    value: self.localPractice || call.getBool("childDirected") == true
                )
            }
            if self.localPractice || call.getBool("underAgeOfConsent") != nil {
                configuration.tagForUnderAgeOfConsent = NSNumber(
                    value: self.localPractice || call.getBool("underAgeOfConsent") == true
                )
            }
            if self.localPractice { configuration.maxAdContentRating = GADMaxAdContentRating.general }
            let request = Request()
            if self.localPractice || (call.getBool("nonPersonalized") ?? true) {
                let extras = Extras()
                extras.additionalParameters = ["npa": "1"]
                request.register(extras)
            }
            RewardedAd.load(with: unit, request: request) { ad, error in
                guard epoch == self.generation else { call.resolve(["status": "error"]); return }
                guard let ad = ad, error == nil else {
                    call.resolve(["status": (error as NSError?)?.code == 1 ? "no_fill" : "error"]); return
                }
                self.loaded = ad
                call.resolve(["status": "loaded"])
            }
        }
    }
    private func event(_ type: String) {
        guard let owner = presentingKey else { return }
        notifyListeners("state", data: ["type": type, "key": owner])
    }
    @objc func show(_ call: CAPPluginCall) {
        guard let owner = call.getString("key") else { call.reject("Unavailable"); return }
        let nonce = call.getString("customData")
        DispatchQueue.main.async {
            let validNonce = nonce?.range(of: "^[A-Za-z0-9._~-]{24,1024}$", options: .regularExpression) != nil
            guard !self.showing, owner == self.key,
                  (self.localPractice ? nonce == nil : validNonce),
                  let ad = self.loaded, let view = self.bridge?.viewController else {
                call.reject("Unavailable"); return
            }
            if let nonce = nonce {
                let verification = ServerSideVerificationOptions()
                verification.customRewardText = nonce
                ad.serverSideVerificationOptions = verification
            }
            ad.fullScreenContentDelegate = self
            self.loaded = nil
            self.presented = ad
            self.showing = true
            self.presentingKey = owner
            ad.present(from: view) {
                if self.presentingKey == owner { self.event("earned") }
            }
            call.resolve()
        }
    }
    public func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        showing = false
        presented = nil
        event("closed")
        presentingKey = nil
    }
    public func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        showing = false
        presented = nil
        event("failed")
        presentingKey = nil
    }
    @objc func dispose(_ call: CAPPluginCall) {
        let owner = call.getString("key")
        DispatchQueue.main.async {
            if owner == nil || owner == self.key { self.generation += 1; self.loaded = nil }
            call.resolve()
        }
    }
}
