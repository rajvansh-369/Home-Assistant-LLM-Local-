package expo.modules.astersystem

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

internal data class StoredMessage(
  val id: Long,
  val threadKey: String,
  val source: String,
  val isGroup: Boolean,
  val title: String,
  val sender: String,
  val text: String,
  /** The message's own time (ms). */
  val at: Long,
  val outgoing: Boolean,
  val otp: Boolean,
  val read: Boolean,
  /** When Aster alerted about it (spoken or held), else null. */
  val alertedAt: Long?,
  /** When Aster read it aloud, else null. */
  val spokenAt: Long?
)

internal data class StoredThread(
  val key: String,
  val source: String,
  val title: String,
  val isGroup: Boolean,
  val last: StoredMessage,
  val count: Int,
  /** The sender of each unread received message, oldest first, for VIP counts in JS. */
  val unreadSenders: List<String>,
  val spokenAt: Long?
)

internal data class AlertTimer(val threadKey: String, val kind: String, val dueAt: Long)

/**
 * Captured messages on the phone (docs/aster-messages-alerts-plan.md §4 Stored): SQLite, with the
 * title, sender and text of each row in one AES-GCM blob. Kept 7 days, at most 2,000 rows. Also
 * holds the alert timers, so a restart can arm them again.
 */
internal class MessageStore private constructor(private val context: Context) :
  SQLiteOpenHelper(context, "aster-messages.db", null, 1) {

  companion object {
    const val KEEP_MS = 7L * 24 * 60 * 60 * 1000
    const val MAX_ROWS = 2_000

    @Volatile private var instance: MessageStore? = null

    fun get(context: Context): MessageStore =
      instance ?: synchronized(this) {
        instance ?: MessageStore(context.applicationContext).also { instance = it }
      }
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_key TEXT NOT NULL,
        source TEXT NOT NULL,
        is_group INTEGER NOT NULL,
        at INTEGER NOT NULL,
        captured_at INTEGER NOT NULL,
        outgoing INTEGER NOT NULL DEFAULT 0,
        otp INTEGER NOT NULL DEFAULT 0,
        read INTEGER NOT NULL DEFAULT 0,
        alerted_at INTEGER,
        spoken_at INTEGER,
        digest TEXT NOT NULL UNIQUE,
        body BLOB NOT NULL
      )
      """.trimIndent()
    )
    db.execSQL("CREATE INDEX messages_thread ON messages (thread_key, at)")
    db.execSQL(
      """
      CREATE TABLE timers (
        thread_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        PRIMARY KEY (thread_key, kind)
      )
      """.trimIndent()
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  private fun seal(title: String, sender: String, text: String): ByteArray =
    Crypto.encrypt(
      context,
      JSONObject().put("title", title).put("sender", sender).put("text", text).toString()
    )

  /** Stores the notification's messages not seen before. Returns the new ones. */
  fun insert(parsed: ParsedNotification, now: Long): List<StoredMessage> {
    val db = writableDatabase
    val key = parsed.threadKey
    val added = mutableListOf<StoredMessage>()
    db.beginTransaction()
    try {
      for (message in parsed.messages) {
        val at = if (message.time > 0) message.time else now
        val otp = MessageText.isOneTimeCode(message.text)
        val values = ContentValues().apply {
          put("thread_key", key)
          put("source", parsed.source)
          put("is_group", if (parsed.isGroup) 1 else 0)
          put("at", at)
          put("captured_at", now)
          put("otp", if (otp) 1 else 0)
          put("digest", MessageText.digest(key, message.sender, message.time, message.text))
          put("body", seal(parsed.title, message.sender, message.text))
        }
        val id = db.insertWithOnConflict("messages", null, values, SQLiteDatabase.CONFLICT_IGNORE)
        if (id != -1L) {
          added += StoredMessage(
            id, key, parsed.source, parsed.isGroup, parsed.title, message.sender, message.text, at,
            outgoing = false, otp = otp, read = false, alertedAt = null, spokenAt = null
          )
        }
      }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
    return added
  }

  /** A reply sent from 4.2, shown as the user's message. */
  fun insertOutgoing(thread: StoredThread, text: String, now: Long) {
    val values = ContentValues().apply {
      put("thread_key", thread.key)
      put("source", thread.source)
      put("is_group", if (thread.isGroup) 1 else 0)
      put("at", now)
      put("captured_at", now)
      put("outgoing", 1)
      put("read", 1)
      put("digest", MessageText.digest(thread.key, "", now, text) + ":out")
      put("body", seal(thread.title, "", text))
    }
    writableDatabase.insertWithOnConflict("messages", null, values, SQLiteDatabase.CONFLICT_IGNORE)
  }

  private fun query(where: String?, args: Array<String>?, order: String, limit: String? = null): List<StoredMessage> {
    val rows = mutableListOf<StoredMessage>()
    val unreadable = mutableListOf<Long>()
    readableDatabase.query(
      "messages",
      arrayOf(
        "id", "thread_key", "source", "is_group", "at", "outgoing", "otp", "read", "alerted_at",
        "spoken_at", "body"
      ),
      where, args, null, null, order, limit
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getLong(0)
        val body = Crypto.decrypt(context, cursor.getBlob(10))?.let(::JSONObject)
        if (body == null) {
          unreadable += id
          continue
        }
        rows += StoredMessage(
          id = id,
          threadKey = cursor.getString(1),
          source = cursor.getString(2),
          isGroup = cursor.getInt(3) == 1,
          title = body.optString("title"),
          sender = body.optString("sender"),
          text = body.optString("text"),
          at = cursor.getLong(4),
          outgoing = cursor.getInt(5) == 1,
          otp = cursor.getInt(6) == 1,
          read = cursor.getInt(7) == 1,
          alertedAt = if (cursor.isNull(8)) null else cursor.getLong(8),
          spokenAt = if (cursor.isNull(9)) null else cursor.getLong(9)
        )
      }
    }
    if (unreadable.isNotEmpty()) {
      writableDatabase.delete("messages", "id IN (${unreadable.joinToString(",")})", null)
    }
    return rows
  }

  private fun summarise(key: String, messages: List<StoredMessage>): StoredThread {
    val last = messages.last()
    return StoredThread(
      key = key,
      source = last.source,
      title = last.title,
      isGroup = last.isGroup,
      last = last,
      count = messages.size,
      unreadSenders = messages.filter { !it.read && !it.outgoing }.map { it.sender },
      spokenAt = messages.mapNotNull { it.spokenAt }.maxOrNull()
    )
  }

  /** Every thread, newest first. */
  fun threads(): List<StoredThread> =
    query(null, null, "at ASC, id ASC")
      .groupBy { it.threadKey }
      .map { (key, messages) -> summarise(key, messages) }
      .sortedByDescending { it.last.at }

  fun thread(key: String): StoredThread? =
    query("thread_key = ?", arrayOf(key), "at ASC, id ASC")
      .takeIf { it.isNotEmpty() }
      ?.let { summarise(key, it) }

  /** The thread's newest `limit` messages, oldest first. */
  fun messages(threadKey: String, limit: Int): List<StoredMessage> =
    query("thread_key = ?", arrayOf(threadKey), "at DESC, id DESC", limit.toString()).reversed()

  /** Marks the thread's received messages read. Returns how many changed. */
  fun markRead(threadKey: String): Int {
    val values = ContentValues().apply { put("read", 1) }
    return writableDatabase.update("messages", values, "thread_key = ? AND read = 0", arrayOf(threadKey))
  }

  /** Unread received messages that aren't one-time codes; with `again`, already alerted ones too. */
  fun unreadForAlert(threadKey: String, again: Boolean): List<StoredMessage> {
    val alerted = if (again) "" else " AND alerted_at IS NULL"
    return query(
      "thread_key = ? AND read = 0 AND outgoing = 0 AND otp = 0$alerted",
      arrayOf(threadKey),
      "at ASC, id ASC"
    )
  }

  fun markAlerted(ids: List<Long>, at: Long, spoken: Boolean) {
    if (ids.isEmpty()) return
    val values = ContentValues().apply {
      put("alerted_at", at)
      if (spoken) put("spoken_at", at)
    }
    writableDatabase.update("messages", values, "id IN (${ids.joinToString(",")})", null)
  }

  /** `replace` false keeps an earlier due time: later messages don't restart the missed timer. */
  fun putTimer(threadKey: String, kind: String, dueAt: Long, replace: Boolean) {
    val values = ContentValues().apply {
      put("thread_key", threadKey)
      put("kind", kind)
      put("due_at", dueAt)
    }
    val conflict = if (replace) SQLiteDatabase.CONFLICT_REPLACE else SQLiteDatabase.CONFLICT_IGNORE
    writableDatabase.insertWithOnConflict("timers", null, values, conflict)
  }

  fun deleteTimer(threadKey: String, kind: String) {
    writableDatabase.delete("timers", "thread_key = ? AND kind = ?", arrayOf(threadKey, kind))
  }

  fun timers(): List<AlertTimer> {
    val timers = mutableListOf<AlertTimer>()
    readableDatabase.query("timers", arrayOf("thread_key", "kind", "due_at"), null, null, null, null, null)
      .use { cursor ->
        while (cursor.moveToNext()) {
          timers += AlertTimer(cursor.getString(0), cursor.getString(1), cursor.getLong(2))
        }
      }
    return timers
  }

  /** Drops messages older than 7 days and the oldest beyond 2,000, and timers of gone threads. */
  fun purge(now: Long) {
    val db = writableDatabase
    db.delete("messages", "captured_at < ?", arrayOf((now - KEEP_MS).toString()))
    db.execSQL(
      "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT $MAX_ROWS)"
    )
    db.execSQL("DELETE FROM timers WHERE thread_key NOT IN (SELECT DISTINCT thread_key FROM messages)")
  }

  /** Sign-out and reset. */
  fun clear() {
    val db = writableDatabase
    db.delete("messages", null, null)
    db.delete("timers", null, null)
  }
}
