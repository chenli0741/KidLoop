import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = KidLoopBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

class KidLoopBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        let nativeMarker = WKUserScript(
            source: "window.__KIDLOOP_NATIVE__ = true; window.dispatchEvent(new Event('kidloopnative'));",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        webView?.configuration.userContentController.addUserScript(nativeMarker)
        bridge?.registerPluginInstance(KidLoopOCRPlugin())
        bridge?.registerPluginInstance(KidLoopMailAuthPlugin())
        bridge?.registerPluginInstance(KidLoopCalendarAuthPlugin())
        bridge?.registerPluginInstance(KidLoopNotificationsPlugin())
        bridge?.registerPluginInstance(KidLoopNavigationPlugin())
        bridge?.registerPluginInstance(KidLoopCredentialsPlugin())
    }
}
