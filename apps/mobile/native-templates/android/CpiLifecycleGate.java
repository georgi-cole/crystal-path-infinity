package com.getcapacitor;

import android.webkit.WebView;
import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/** Shared by the app plugin and generated bridge without exposing Cordova types. */
public final class CpiLifecycleGate {
    private static final Map<WebView, String> pages = Collections.synchronizedMap(new WeakHashMap<>());

    private CpiLifecycleGate() {}

    public static void setPage(WebView webView, String pageId) {
        if (pageId == null) pages.remove(webView);
        else pages.put(webView, pageId);
    }

    public static String getPage(WebView webView) { return pages.get(webView); }
}
