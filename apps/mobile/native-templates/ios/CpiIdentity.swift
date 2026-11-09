import AuthenticationServices
import Capacitor
import CryptoKit
import Security
import UIKit

@objc(CpiIdentity)
public final class CpiIdentity: CAPPlugin, CAPBridgedPlugin,
    ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding,
    ASWebAuthenticationPresentationContextProviding {
    public let identifier = "CpiIdentity"
    public let jsName = "CpiIdentity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var pending: CAPPluginCall?
    private var appleController: ASAuthorizationController?
    private var googleSession: ASWebAuthenticationSession?

    @objc public func authorize(_ call: CAPPluginCall) {
        guard let provider = call.getString("provider"),
              let nonce = call.getString("nonce"),
              nonce.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
            call.reject("Sign-in unavailable")
            return
        }
        DispatchQueue.main.async {
            guard self.pending == nil, self.bridge?.viewController?.view.window != nil else {
                call.reject("Sign-in unavailable")
                return
            }
            self.pending = call
            switch provider {
            case "apple": self.authorizeApple(nonce)
            case "google": self.authorizeGoogle(nonce)
            default: self.fail()
            }
        }
    }

    private func authorizeApple(_ nonce: String) {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.nonce = nonce
        request.requestedScopes = [.email]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        appleController = controller
        controller.performRequests()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(
        controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard controller === appleController,
              let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }),
              let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) else {
            fail()
            return
        }
        resolve(["status": "authorized", "credential": ["identityToken": token, "code": code]])
    }

    public func authorizationController(
        controller: ASAuthorizationController, didCompleteWithError error: Error
    ) {
        guard controller === appleController else { return }
        if (error as? ASAuthorizationError)?.code == .canceled {
            resolve(["status": "cancelled"])
        } else {
            fail()
        }
    }

    private func base64Url(_ bytes: Data) -> String {
        bytes.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func randomToken() -> String? {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            return nil
        }
        return base64Url(Data(bytes))
    }

    private func authorizeGoogle(_ nonce: String) {
        guard let clientId = Bundle.main.object(forInfoDictionaryKey: "CpiGoogleSignInClientID") as? String,
              clientId.range(of: #"^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$"#, options: .regularExpression) != nil,
              let verifier = randomToken(), let state = randomToken(),
              var url = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth") else {
            fail()
            return
        }
        let scheme = clientId.split(separator: ".").reversed().joined(separator: ".")
        let path = "/oauth2redirect"
        let challenge = base64Url(Data(SHA256.hash(data: Data(verifier.utf8))))
        url.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: scheme + ":" + path),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email"),
            URLQueryItem(name: "prompt", value: "select_account"),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256")
        ]
        guard let authorizeUrl = url.url else {
            fail()
            return
        }
        let browser = ASWebAuthenticationSession(url: authorizeUrl, callbackURLScheme: scheme) { [weak self] response, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
                    self.resolve(["status": "cancelled"])
                    return
                }
                guard let response,
                      let callback = URLComponents(url: response, resolvingAgainstBaseURL: false),
                      callback.scheme == scheme, callback.host == nil, callback.path == path,
                      let query = callback.queryItems else {
                    self.fail()
                    return
                }
                let states = query.filter { $0.name == "state" }
                let codes = query.filter { $0.name == "code" }
                guard states.count == 1, states.first?.value == state,
                      codes.count == 1, let code = codes.first?.value,
                      !query.contains(where: { $0.name == "error" }) else {
                    self.fail()
                    return
                }
                self.resolve(["status": "authorized", "credential": ["code": code, "verifier": verifier]])
            }
        }
        browser.presentationContextProvider = self
        googleSession = browser
        if !browser.start() { fail() }
    }

    private func takeCall() -> CAPPluginCall? {
        let call = pending
        pending = nil
        appleController = nil
        googleSession = nil
        return call
    }

    private func fail() {
        takeCall()?.reject("Sign-in unavailable")
    }

    private func resolve(_ result: [String: Any]) {
        takeCall()?.resolve(result)
    }
}
