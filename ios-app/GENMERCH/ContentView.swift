import SwiftUI
import WebKit
import UIKit

struct ContentView: View {
    @StateObject private var model = WebViewStore()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button(action: model.goBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 38, height: 38)
                        .background(Color(uiColor: .secondarySystemBackground), in: Circle())
                }
                .disabled(!model.canGoBack)
                .accessibilityLabel("Go back")

                Spacer(minLength: 8)

                Text("GENMERCH")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .tracking(1.1)
                    .accessibilityAddTraits(.isHeader)

                Spacer(minLength: 8)

                Button(action: model.reload) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 38, height: 38)
                        .background(Color(uiColor: .secondarySystemBackground), in: Circle())
                }
                .accessibilityLabel("Reload GENMERCH")
            }
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background(.ultraThinMaterial)

            if model.isLoading {
                ProgressView(value: model.progress)
                    .progressViewStyle(.linear)
                    .tint(Color(red: 0.86, green: 0.12, blue: 0.17))
                    .frame(height: 2)
            } else {
                Rectangle()
                    .fill(Color.clear)
                    .frame(height: 2)
            }

            ZStack {
                WebViewHost(webView: model.webView)

                if let message = model.errorMessage {
                    VStack(spacing: 14) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 34, weight: .medium))
                            .foregroundStyle(.secondary)

                        Text("Unable to load GENMERCH")
                            .font(.headline)

                        Text(message)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        Button(action: model.reload) {
                            Label("Try Again", systemImage: "arrow.clockwise")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 22)
                                .padding(.vertical, 11)
                                .background(Color(red: 0.82, green: 0.10, blue: 0.15), in: Capsule())
                        }
                        .padding(.top, 4)
                    }
                    .padding(28)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(uiColor: .systemBackground))
                }
            }
        }
        .background(Color(uiColor: .systemBackground))
    }
}

private struct WebViewHost: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView {
        webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

@MainActor
final class WebViewStore: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    static let storefrontURL = URL(string: "https://shopgenmerch.com/")!

    @Published private(set) var isLoading = true
    @Published private(set) var progress = 0.0
    @Published private(set) var canGoBack = false
    @Published private(set) var errorMessage: String?

    let webView: WKWebView
    private var progressObservation: NSKeyValueObservation?

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        let browser = WKWebView(frame: .zero, configuration: configuration)
        self.webView = browser
        super.init()

        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.allowsBackForwardNavigationGestures = true
        browser.scrollView.alwaysBounceVertical = true

        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(self, action: #selector(refreshFromGesture), for: .valueChanged)
        browser.scrollView.refreshControl = refreshControl

        progressObservation = browser.observe(\.estimatedProgress, options: [.initial, .new]) { [weak self] observedWebView, _ in
            DispatchQueue.main.async {
                self?.progress = observedWebView.estimatedProgress
            }
        }

        browser.load(URLRequest(url: Self.storefrontURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
    }

    func goBack() {
        guard webView.canGoBack else { return }
        webView.goBack()
    }

    func reload() {
        errorMessage = nil
        webView.reload()
    }

    @objc private func refreshFromGesture() {
        errorMessage = nil
        webView.reload()
    }

    private func updateNavigationState() {
        canGoBack = webView.canGoBack
    }

    private func finishLoading() {
        isLoading = false
        webView.scrollView.refreshControl?.endRefreshing()
        updateNavigationState()
    }

    private func isAllowedInApp(_ host: String) -> Bool {
        let normalizedHost = host.lowercased()
        return normalizedHost == "shopgenmerch.com"
            || normalizedHost.hasSuffix(".shopgenmerch.com")
            || normalizedHost == "csbaxyzfcaxhyyzxfxjw.supabase.co"
    }

    private func openOutsideApp(_ url: URL) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        errorMessage = nil
        progress = 0
        updateNavigationState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finishLoading()
        progress = 1
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleNavigationError(error)
    }

    private func handleNavigationError(_ error: Error) {
        let nsError = error as NSError
        finishLoading()
        guard nsError.code != NSURLErrorCancelled else { return }
        errorMessage = "Check your internet connection, then try again. (\(nsError.localizedDescription))"
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if navigationAction.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
            return
        }

        if url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }

        guard let scheme = url.scheme?.lowercased() else {
            decisionHandler(.cancel)
            return
        }

        if scheme == "https" || scheme == "http" {
            guard let host = url.host else {
                decisionHandler(.cancel)
                return
            }

            if isAllowedInApp(host) {
                if scheme == "http" {
                    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
                    components?.scheme = "https"
                    if let secureURL = components?.url {
                        webView.load(URLRequest(url: secureURL))
                    }
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }
            } else {
                openOutsideApp(url)
                decisionHandler(.cancel)
            }
            return
        }

        if ["mailto", "tel", "sms", "facetime", "itms-apps"].contains(scheme) {
            openOutsideApp(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else {
            return nil
        }

        if let host = url.host, isAllowedInApp(host), url.scheme?.lowercased() == "https" {
            webView.load(navigationAction.request)
        } else if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            openOutsideApp(url)
        }

        return nil
    }
}
