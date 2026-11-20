package expo.modules.astersystem

import android.Manifest
import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

/**
 * "Hey Aster" at home, also with the screen off (docs/aster-voice-plan.md §6, §7): a foreground
 * service of type microphone that owns the AudioRecord, runs the wake word on 80 ms frames and
 * shows the ongoing "At home · listening" notification with Pause 1 hour and Settings.
 *
 * JS starts it while Aster is open at home (Android 14+ allows a microphone service to start only
 * from the foreground) and stops it on leaving home, locking, sign-out or the 5.1 switch. Leaving
 * home also stops it natively (AlertEngine.setAtHome), since the geofence task may run headless.
 * The service locks itself when the session's token expires or "Lock when I leave" passes in the
 * background. While a voice turn listens, JS holds the microphone; the service records nothing.
 * Audio never leaves this class: nothing is stored past the frames it scores.
 */
class WakeWordService : Service() {

  internal companion object {
    private const val CHANNEL = "aster-listening"
    private const val HEARD_CHANNEL = "aster-wake"
    private const val NOTIFICATION_ID = 0x4153
    private const val HEARD_ID = 0x4154
    private const val ACTION_START = "expo.modules.astersystem.wake.START"
    private const val ACTION_PAUSE = "expo.modules.astersystem.wake.PAUSE"
    private const val ACTION_RESUME = "expo.modules.astersystem.wake.RESUME"
    private const val EXTRA_MINUTES = "minutes"

    /** A heard wake word that no voice turn took up gives the microphone back after this. */
    private const val HELD_BY_WAKE_MS = 30_000L

    /** How often the recording thread checks for a call, the lock and the app in front (frames). */
    private const val CHECK_EVERY = 25

    @Volatile var config: WakeConfig = WakeConfig()
    @Volatile var instance: WakeWordService? = null
      private set

    /** JS holds the microphone for a voice turn. */
    @Volatile var heldByTurn = false

    @Volatile var pausedUntil = 0L
      private set

    @Volatile var locked = false
      private set

    /** Why the service didn't start, for JS: null, "permission", "foreground", "models". */
    @Volatile var startError: String? = null
      private set

    val running: Boolean get() = instance != null

    fun parseConfig(json: String?): WakeConfig {
      val root = try {
        json?.let(::JSONObject)
      } catch (e: Exception) {
        null
      } ?: return WakeConfig()
      val defaults = WakeCopy()
      val words = root.optJSONObject("copy")
      fun text(key: String, fallback: String) =
        words?.optString(key)?.takeIf { it.isNotBlank() } ?: fallback
      return WakeConfig(
        copy = WakeCopy(
          channel = text("channel", defaults.channel),
          title = text("title", defaults.title),
          body = text("body", defaults.body),
          pause = text("pause", defaults.pause),
          resume = text("resume", defaults.resume),
          settings = text("settings", defaults.settings),
          paused = text("paused", defaults.paused),
          locked = text("locked", defaults.locked),
          heardTitle = text("heardTitle", defaults.heardTitle),
          heardBody = text("heardBody", defaults.heardBody),
        ),
        accent = root.optString("accent", "#FFFFFF"),
        lockAt = root.optDouble("lockAt", 0.0).toLong(),
        autoLockMinutes = if (root.has("autoLockMinutes") && !root.isNull("autoLockMinutes")) {
          root.optInt("autoLockMinutes")
        } else {
          null
        },
      )
    }

    /** Starts listening (or applies new rules to the running service). False when it can't. */
    fun start(context: Context, json: String?): Boolean {
      config = parseConfig(json)
      locked = false
      if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        startError = "permission"
        return false
      }
      if (WakeWord.keywordIn(context) == null) {
        startError = "models"
        return false
      }
      instance?.let {
        it.refresh()
        return true
      }
      startError = null
      return try {
        context.startForegroundService(Intent(context, WakeWordService::class.java).setAction(ACTION_START))
        true
      } catch (e: Exception) {
        // ForegroundServiceStartNotAllowedException: Aster isn't in front.
        startError = "foreground"
        false
      }
    }

    fun stop(context: Context) {
      instance?.let { it.stopSelfNow() }
        ?: context.stopService(Intent(context, WakeWordService::class.java))
      heldByTurn = false
      pausedUntil = 0
    }

    fun pause(minutes: Int) {
      instance?.pauseFor(minutes)
    }

    /**
     * A voice turn takes the microphone (true) or gives it back (false). Taking it also clears a
     * heard wake word's hold and its "Hey Aster" notification.
     */
    fun hold(context: Context, on: Boolean) {
      heldByTurn = on
      instance?.heldByWakeUntil = 0
      if (on) {
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(HEARD_ID)
      }
    }

    fun resume() {
      instance?.resumeNow()
    }

    fun state(): Bundle = Bundle().apply {
      putBoolean("running", running)
      putBoolean("listening", instance?.recording == true)
      putDouble("pausedUntil", pausedUntil.toDouble())
      putBoolean("locked", locked)
      putString("error", startError)
      putString("keyword", instance?.keyword)
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private var worker: Thread? = null
  @Volatile private var stopping = false
  @Volatile var recording = false
    private set
  @Volatile private var heldByWakeUntil = 0L
  @Volatile var keyword: String? = null
    private set
  private var backgroundSince: Long? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PAUSE -> pauseFor(intent.getIntExtra(EXTRA_MINUTES, 60))
      ACTION_RESUME -> resumeNow()
      else -> Unit
    }
    if (!goForeground()) {
      stopSelfNow()
      return START_NOT_STICKY
    }
    if (worker == null) startWorker()
    // Not restarted by the system: only Aster in front may start a microphone service.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopping = true
    worker?.interrupt()
    worker = null
    main.removeCallbacksAndMessages(null)
    if (instance === this) instance = null
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping Aster away keeps listening; the notification stays as the way back.
    super.onTaskRemoved(rootIntent)
  }

  fun stopSelfNow() {
    stopping = true
    worker?.interrupt()
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun goForeground(): Boolean = try {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    true
  } catch (e: Exception) {
    startError = "foreground"
    false
  }

  /** New rules or state: the notification again. */
  fun refresh() {
    try {
      manager().notify(NOTIFICATION_ID, buildNotification())
    } catch (e: SecurityException) {
      // Notifications not allowed: the service still runs (the system shows it as running).
    }
  }

  private fun pauseFor(minutes: Int) {
    pausedUntil = System.currentTimeMillis() + minutes.coerceIn(1, 24 * 60) * 60_000L
    main.removeCallbacks(resumeTask)
    main.postDelayed(resumeTask, minutes.coerceIn(1, 24 * 60) * 60_000L)
    refresh()
  }

  private val resumeTask = Runnable { resumeNow() }

  private fun resumeNow() {
    pausedUntil = 0
    main.removeCallbacks(resumeTask)
    refresh()
  }

  // Recording ------------------------------------------------------------------------------------

  private fun startWorker() {
    stopping = false
    worker = Thread({ listenLoop() }, "aster-wake-word").apply {
      priority = Thread.NORM_PRIORITY - 1
      start()
    }
  }

  private fun mayRecord(now: Long): Boolean =
    !heldByTurn && heldByWakeUntil <= now && pausedUntil <= System.currentTimeMillis() && !locked && !inCall()

  private fun inCall(): Boolean {
    val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return audio.mode == AudioManager.MODE_IN_CALL || audio.mode == AudioManager.MODE_IN_COMMUNICATION
  }

  private fun appInFront(): Boolean {
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    return state.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  /** Locks when the session ended; tells JS-less users through the notification. */
  private fun checkLock(now: Long) {
    if (appInFront()) backgroundSince = null else if (backgroundSince == null) backgroundSince = now
    if (!locked && config.locked(now, backgroundSince)) {
      locked = true
      main.post { refresh() }
    }
  }

  @SuppressLint("MissingPermission") // Checked in start().
  private fun openRecorder(): AudioRecord? {
    val min = AudioRecord.getMinBufferSize(
      WakeRules.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
    )
    if (min <= 0) return null
    return try {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION, WakeRules.SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
        maxOf(min, WakeRules.FRAME * 2 * 4),
      ).takeIf { it.state == AudioRecord.STATE_INITIALIZED }
    } catch (e: Exception) {
      null
    }
  }

  private fun listenLoop() {
    val models = WakeWord.load(this)
    if (models == null) {
      startError = "models"
      main.post { stopSelfNow() }
      return
    }
    keyword = models.keyword
    val detector = WakeDetector(models)
    val frame = ShortArray(WakeRules.FRAME)
    var recorder: AudioRecord? = null
    var count = 0
    try {
      while (!stopping) {
        val now = System.currentTimeMillis()
        if (count++ % CHECK_EVERY == 0) checkLock(now)
        if (!mayRecord(SystemClock.elapsedRealtime())) {
          if (recorder != null) {
            recorder.stop()
            recorder.release()
            recorder = null
            setRecording(false)
          }
          Thread.sleep(250)
          continue
        }
        if (recorder == null) {
          recorder = openRecorder()
          if (recorder == null) {
            Thread.sleep(1_000)
            continue
          }
          recorder.startRecording()
          detector.reset()
          setRecording(true)
        }
        var read = 0
        while (read < frame.size && !stopping) {
          val n = recorder.read(frame, read, frame.size - read)
          if (n <= 0) break
          read += n
        }
        if (read < frame.size) continue
        if (detector.process(frame, SystemClock.elapsedRealtime())) {
          recorder.stop()
          recorder.release()
          recorder = null
          setRecording(false)
          heldByWakeUntil = SystemClock.elapsedRealtime() + HELD_BY_WAKE_MS
          main.post { onHeard() }
        }
      }
    } catch (e: InterruptedException) {
      // Stopping.
    } finally {
      recorder?.let {
        try {
          it.stop()
        } catch (e: Exception) {
          // Already stopped.
        }
        it.release()
      }
      setRecording(false)
      models.close()
    }
  }

  private fun setRecording(on: Boolean) {
    if (recording == on) return
    recording = on
    main.post { refresh() }
  }

  /** "Hey Aster": a chime, then 3.6 listening — in the app, or over the lock screen. */
  private fun onHeard() {
    try {
      ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70).apply {
        startTone(ToneGenerator.TONE_PROP_ACK, 150)
        main.postDelayed({ release() }, 400)
      }
    } catch (e: Exception) {
      // No chime.
    }
    if (appInFront() && AsterEvents.sink != null) {
      AsterEvents.emit("onWakeWord", Bundle.EMPTY)
      return
    }
    postHeard()
  }

  /** Full-screen intent: opens 3.6 over the keyguard with the screen off; a heads-up otherwise. */
  private fun postHeard() {
    val manager = manager()
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(HEARD_CHANNEL, config.copy.heardTitle, NotificationManager.IMPORTANCE_HIGH)
        .apply {
          setSound(null, null)
          enableVibration(false)
        }
      manager.createNotificationChannel(channel)
    }
    val open = PendingIntent.getActivity(
      this, 7, voiceIntent(), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = builder(HEARD_CHANNEL)
      .setContentTitle(config.copy.heardTitle)
      .setContentText(config.copy.heardBody)
      .setCategory(Notification.CATEGORY_CALL)
      .setAutoCancel(true)
      .setTimeoutAfter(HELD_BY_WAKE_MS)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .build()
    try {
      manager.notify(HEARD_ID, notification)
    } catch (e: SecurityException) {
      // Notifications not allowed.
    }
  }

  private fun voiceIntent() =
    Intent(Intent.ACTION_VIEW, Uri.parse("aster://voice?wake=1"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

  // Notification ---------------------------------------------------------------------------------

  private fun manager() = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun icon(): Int {
    val id = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (id != 0) id else applicationInfo.icon
  }

  private fun builder(channel: String): Notification.Builder {
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, channel)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setDefaults(0).setSound(null)
    }
    val color = try {
      Color.parseColor(config.accent)
    } catch (e: Exception) {
      Color.WHITE
    }
    return builder.setSmallIcon(icon()).setColor(color)
  }

  private fun serviceAction(action: String, code: Int, minutes: Int = 0): PendingIntent =
    PendingIntent.getService(
      this, code,
      Intent(this, WakeWordService::class.java).setAction(action).putExtra(EXTRA_MINUTES, minutes),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun deepLink(path: String, code: Int): PendingIntent = PendingIntent.getActivity(
    this, code,
    Intent(Intent.ACTION_VIEW, Uri.parse("aster://$path")).setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  private fun buildNotification(): Notification {
    val copy = config.copy
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL, copy.channel, NotificationManager.IMPORTANCE_LOW).apply {
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      }
      manager().createNotificationChannel(channel)
    }
    val paused = pausedUntil > System.currentTimeMillis()
    val text = when {
      locked -> copy.locked
      paused -> copy.paused.replace(
        "{time}", DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(pausedUntil)),
      )
      else -> copy.body
    }
    val builder = builder(CHANNEL)
      .setContentTitle(copy.title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(deepLink(if (locked) "who" else "home", 1))
    if (!locked) {
      if (paused) {
        builder.addAction(Notification.Action.Builder(null, copy.resume, serviceAction(ACTION_RESUME, 2)).build())
      } else {
        builder.addAction(
          Notification.Action.Builder(null, copy.pause, serviceAction(ACTION_PAUSE, 3, 60)).build(),
        )
      }
    }
    builder.addAction(Notification.Action.Builder(null, copy.settings, deepLink("settings", 4)).build())
    if (Build.VERSION.SDK_INT >= 31) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    return builder.build()
  }
}
