package expo.modules.astersystem

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AES-256-GCM for captured messages (docs/aster-messages-alerts-plan.md §4 Stored). A random data
 * key encrypts the rows in software, so reading a thread stays fast; that key is kept only wrapped
 * by a Keystore key, which never leaves the Keystore. The unwrapped key lives in memory.
 */
internal object Crypto {
  private const val KEK_ALIAS = "aster-messages"
  private const val PREFS = "aster.crypto"
  private const val WRAPPED = "data-key"
  private const val GCM = "AES/GCM/NoPadding"
  private const val IV_BYTES = 12
  private const val TAG_BITS = 128

  @Volatile private var dataKey: SecretKey? = null

  private fun keystoreKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEK_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        KEK_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  private fun key(context: Context): SecretKey {
    dataKey?.let { return it }
    synchronized(this) {
      dataKey?.let { return it }
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val kek = keystoreKey()
      val wrapped = prefs.getString(WRAPPED, null)?.let { Base64.decode(it, Base64.NO_WRAP) }
      val raw = wrapped?.let { open(kek, it) } ?: ByteArray(32).also {
        // No key yet, or one this Keystore can't open (a restored backup): start a new one. Rows
        // sealed with the old key can't be read and are dropped by MessageStore.
        SecureRandom().nextBytes(it)
        prefs.edit().putString(WRAPPED, Base64.encodeToString(seal(kek, it), Base64.NO_WRAP)).apply()
      }
      return SecretKeySpec(raw, "AES").also { dataKey = it }
    }
  }

  /** The IV (12 bytes) followed by the ciphertext and tag. */
  private fun seal(key: SecretKey, plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(GCM)
    if (key is SecretKeySpec) {
      val iv = ByteArray(IV_BYTES).also { SecureRandom().nextBytes(it) }
      cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
    } else {
      // Keystore keys choose their own random IV.
      cipher.init(Cipher.ENCRYPT_MODE, key)
    }
    return cipher.iv + cipher.doFinal(plain)
  }

  private fun open(key: SecretKey, blob: ByteArray): ByteArray? = try {
    val cipher = Cipher.getInstance(GCM)
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES))
    cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES)
  } catch (e: Exception) {
    null
  }

  fun encrypt(context: Context, plain: String): ByteArray =
    seal(key(context), plain.toByteArray(Charsets.UTF_8))

  /** Null when the blob can't be opened (another key, or damaged). */
  fun decrypt(context: Context, blob: ByteArray): String? =
    open(key(context), blob)?.let { String(it, Charsets.UTF_8) }
}
