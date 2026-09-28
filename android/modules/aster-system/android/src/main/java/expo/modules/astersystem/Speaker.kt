package expo.modules.astersystem

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.UUID

/**
 * Speaks in the phone's default voice (docs/aster-messages-alerts-plan.md §5 Speaking), with
 * transient audio focus so music ducks. The engine starts on first use and shuts down a minute after
 * the last utterance.
 */
internal object Speaker {
  private const val IDLE_MS = 60_000L

  private val main = Handler(Looper.getMainLooper())
  private var tts: TextToSpeech? = null
  private var ready = false
  private val waiting = mutableListOf<Pair<String, (Boolean) -> Unit>>()
  private val callbacks = mutableMapOf<String, (Boolean) -> Unit>()
  private var focus: AudioFocusRequest? = null
  private lateinit var app: Context

  private val attributes: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ASSISTANT)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()

  private val shutdown = Runnable {
    if (callbacks.isEmpty() && waiting.isEmpty()) {
      tts?.shutdown()
      tts = null
      ready = false
    }
  }

  private fun audio(): AudioManager = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  /** A headset, Bluetooth audio (a car's too) or a hearing aid is connected. */
  fun headsetConnected(context: Context): Boolean {
    val types = mutableSetOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO
    )
    if (Build.VERSION.SDK_INT >= 26) types += AudioDeviceInfo.TYPE_USB_HEADSET
    if (Build.VERSION.SDK_INT >= 28) types += AudioDeviceInfo.TYPE_HEARING_AID
    if (Build.VERSION.SDK_INT >= 31) {
      types += AudioDeviceInfo.TYPE_BLE_HEADSET
      types += AudioDeviceInfo.TYPE_BLE_SPEAKER
    }
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in types }
  }

  /** On a phone or video call: never talk over it. */
  fun inCall(context: Context): Boolean {
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return manager.mode == AudioManager.MODE_IN_CALL || manager.mode == AudioManager.MODE_IN_COMMUNICATION
  }

  /** Speaks `text`; `done(true)` once it has been said, `done(false)` if it couldn't be. */
  fun speak(context: Context, text: String, done: (Boolean) -> Unit = {}) {
    main.post {
      app = context.applicationContext
      main.removeCallbacks(shutdown)
      if (tts == null) {
        ready = false
        tts = TextToSpeech(app) { status -> main.post { onInit(status) } }
      }
      if (ready) say(text, done) else waiting += text to done
    }
  }

  fun stop() {
    main.post {
      if (!::app.isInitialized) return@post
      tts?.stop()
      val pending = callbacks.values.toList() + waiting.map { it.second }
      callbacks.clear()
      waiting.clear()
      releaseFocus()
      pending.forEach { it(false) }
      main.postDelayed(shutdown, IDLE_MS)
    }
  }

  private fun onInit(status: Int) {
    val engine = tts ?: return
    if (status != TextToSpeech.SUCCESS) {
      waiting.forEach { it.second(false) }
      waiting.clear()
      engine.shutdown()
      tts = null
      return
    }
    ready = true
    engine.setAudioAttributes(attributes)
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) = Unit
      override fun onDone(utteranceId: String?) = finish(utteranceId, true)

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) = finish(utteranceId, false)
      override fun onError(utteranceId: String?, errorCode: Int) = finish(utteranceId, false)
    })
    val queued = waiting.toList()
    waiting.clear()
    queued.forEach { (text, done) -> say(text, done) }
  }

  private fun say(text: String, done: (Boolean) -> Unit) {
    val engine = tts ?: return done(false)
    if (callbacks.isEmpty()) takeFocus()
    val id = UUID.randomUUID().toString()
    callbacks[id] = done
    if (engine.speak(text, TextToSpeech.QUEUE_ADD, null, id) != TextToSpeech.SUCCESS) {
      finish(id, false)
    }
  }

  private fun finish(utteranceId: String?, spoken: Boolean) {
    main.post {
      val done = callbacks.remove(utteranceId ?: return@post) ?: return@post
      if (callbacks.isEmpty()) {
        releaseFocus()
        main.postDelayed(shutdown, IDLE_MS)
      }
      done(spoken)
    }
  }

  private fun takeFocus() {
    if (Build.VERSION.SDK_INT >= 26) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributes)
        .build()
      focus = request
      audio().requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audio().requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    }
  }

  private fun releaseFocus() {
    if (Build.VERSION.SDK_INT >= 26) {
      focus?.let { audio().abandonAudioFocusRequest(it) }
      focus = null
    } else {
      @Suppress("DEPRECATION")
      audio().abandonAudioFocus(null)
    }
  }
}
