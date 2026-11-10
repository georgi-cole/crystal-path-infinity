package __PACKAGE__;

import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.ads.mediation.admob.AdMobAdapter;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions;

/** One preloaded ad. Verified play binds its server nonce immediately before show. */
@CapacitorPlugin(name = "CpiRewardedAds")
public class CpiRewardedAds extends Plugin {
    private RewardedAd loaded;
    private RewardedAd presented;
    private String key;
    private int generation;
    private boolean showing;
    private boolean localPractice;

    @PluginMethod public void inventory(PluginCall call) {
        JSObject result = new JSObject();
        result.put("sdkVersion", MobileAds.getVersion().toString());
        call.resolve(result);
    }

    @PluginMethod public void load(PluginCall call) {
        if (getActivity() == null) { call.reject("Unavailable"); return; }
        String unit = call.getString("adUnitId", "");
        String nextKey = call.getString("key", "");
        if (!unit.matches("ca-app-pub-[0-9]{16}/[0-9]{10}") || !nextKey.matches("[A-Za-z0-9_-]{16,100}")) {
            call.reject("Unavailable"); return;
        }
        getActivity().runOnUiThread(() -> {
            if (showing) { call.reject("Unavailable"); return; }
            final int epoch = ++generation;
            loaded = null;
            key = nextKey;
            localPractice = Boolean.TRUE.equals(call.getBoolean("localPractice", false));
            if (localPractice) {
                MobileAds.setRequestConfiguration(MobileAds.getRequestConfiguration().toBuilder()
                    .setTagForChildDirectedTreatment(RequestConfiguration.TAG_FOR_CHILD_DIRECTED_TREATMENT_TRUE)
                    .setTagForUnderAgeOfConsent(RequestConfiguration.TAG_FOR_UNDER_AGE_OF_CONSENT_TRUE)
                    .setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_G)
                    .build());
            }
            Bundle extras = new Bundle();
            if (localPractice || Boolean.TRUE.equals(call.getBoolean("nonPersonalized", true))) extras.putString("npa", "1");
            AdRequest request = new AdRequest.Builder().addNetworkExtrasBundle(AdMobAdapter.class, extras).build();
            RewardedAd.load(getContext(), unit, request, new RewardedAdLoadCallback() {
                @Override public void onAdLoaded(RewardedAd ad) {
                    JSObject result = new JSObject();
                    if (epoch != generation) { result.put("status", "error"); call.resolve(result); return; }
                    loaded = ad;
                    result.put("status", "loaded");
                    call.resolve(result);
                }
                @Override public void onAdFailedToLoad(LoadAdError error) {
                    if (epoch == generation) loaded = null;
                    JSObject result = new JSObject();
                    result.put("status", error.getCode() == AdRequest.ERROR_CODE_NO_FILL ? "no_fill" : "error");
                    call.resolve(result);
                }
            });
        });
    }

    private void event(String type, String owner) {
        JSObject payload = new JSObject();
        payload.put("type", type);
        payload.put("key", owner);
        notifyListeners("state", payload);
    }

    @PluginMethod public void show(PluginCall call) {
        if (getActivity() == null) { call.reject("Unavailable"); return; }
        String owner = call.getString("key", "");
        String nonce = call.getString("customData");
        getActivity().runOnUiThread(() -> {
            RewardedAd ad = loaded;
            boolean validNonce = nonce != null && nonce.matches("[A-Za-z0-9._~-]{24,1024}");
            if (showing || ad == null || !owner.equals(key) || (localPractice ? nonce != null : !validNonce)) {
                call.reject("Unavailable"); return;
            }
            loaded = null;
            showing = true;
            presented = ad;
            if (nonce != null) {
                ad.setServerSideVerificationOptions(new ServerSideVerificationOptions.Builder().setCustomData(nonce).build());
            }
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() { showing = false; presented = null; event("closed", owner); }
                @Override public void onAdFailedToShowFullScreenContent(AdError error) { showing = false; presented = null; event("failed", owner); }
            });
            try { ad.show(getActivity(), reward -> event("earned", owner)); call.resolve(); }
            catch (RuntimeException error) { showing = false; presented = null; call.reject("Unavailable"); }
        });
    }

    @PluginMethod public void dispose(PluginCall call) {
        if (getActivity() == null) { call.resolve(); return; }
        String owner = call.getString("key");
        getActivity().runOnUiThread(() -> {
            if (owner == null || owner.equals(key)) { generation++; loaded = null; }
            call.resolve();
        });
    }
    @Override protected void handleOnDestroy() { generation++; loaded = null; }
}
