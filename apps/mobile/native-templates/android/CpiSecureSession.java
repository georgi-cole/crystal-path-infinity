package __PACKAGE__;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Refresh token only; device-bound AndroidKeyStore AES-GCM.
 * SharedPreferences holds ciphertext and IV, never the plaintext.
 * The generated Android application disables OS backup and restore.
 */
@CapacitorPlugin(name = "CpiSecureSession")
public final class CpiSecureSession extends Plugin {
    private static final String KEY_ALIAS = "CpiSecureSessionV1";
    private static final String PREFS = "cpi_secure_session_v1";
    private static final String REFRESH = "encrypted_refresh";
    private static final Object LOCK = new Object();

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    private static boolean valid(String value) {
        if (value == null || value.length() < 16 || value.length() > 4096) return false;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch < 33 || ch > 126) return false;
        }
        return true;
    }

    @PluginMethod public void readRefreshToken(PluginCall call) {
        synchronized (LOCK) {
            try {
                String encrypted = prefs().getString(REFRESH, null);
                JSObject result = new JSObject();
                if (encrypted == null) {
                    result.put("value", org.json.JSONObject.NULL);
                    call.resolve(result);
                    return;
                }
                String[] fields = encrypted.split(":", -1);
                if (fields.length != 2) throw new IllegalStateException("Invalid ciphertext envelope");
                byte[] iv = Base64.decode(fields[0], Base64.NO_WRAP);
                byte[] cipherText = Base64.decode(fields[1], Base64.NO_WRAP);
                if (iv.length != 12 || cipherText.length > 8192) throw new IllegalStateException("Invalid ciphertext");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
                String token = new String(cipher.doFinal(cipherText), StandardCharsets.US_ASCII);
                if (!valid(token)) throw new IllegalStateException("Invalid decrypted credential");
                result.put("value", token);
                call.resolve(result);
            } catch (Exception ignored) {
                // An invalidated keystore key or restored ciphertext cannot authenticate.
                prefs().edit().remove(REFRESH).commit();
                call.reject("Protected session could not be restored.");
            }
        }
    }

    @PluginMethod public void writeRefreshToken(PluginCall call) {
        String value = call.getString("value");
        if (!valid(value)) {
            call.reject("Invalid refresh credential.");
            return;
        }
        synchronized (LOCK) {
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key());
                byte[] iv = cipher.getIV();
                if (iv.length != 12) throw new IllegalStateException("Unexpected GCM IV");
                byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.US_ASCII));
                String envelope = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" +
                    Base64.encodeToString(ciphertext, Base64.NO_WRAP);
                if (!prefs().edit().putString(REFRESH, envelope).commit()) {
                    throw new IllegalStateException("Credential was not committed");
                }
                call.resolve();
            } catch (Exception ignored) {
                call.reject("Protected credential storage is unavailable.");
            }
        }
    }

    @PluginMethod public void clearRefreshToken(PluginCall call) {
        synchronized (LOCK) {
            if (prefs().edit().remove(REFRESH).commit()) call.resolve();
            else call.reject("Protected credential could not be cleared.");
        }
    }
}
