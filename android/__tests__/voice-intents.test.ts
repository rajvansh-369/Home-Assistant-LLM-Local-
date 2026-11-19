// Voice V3 (docs/aster-voice-plan.md §5): what was said, as a reminder, a read-out, a reply, a
// confirmation or stop; anything else is a question for the chat. Times use the phone's zone.
import { nameMatches, normalize, parseIntent, resolveClock } from '@/features/voice/intents';

/** Wed 19 Nov 2026, local time. */
const at = (hour: number, minute = 0, day = 19) => new Date(2026, 10, day, hour, minute, 0, 0);

function reminder(said: string, now: Date) {
  const intent = parseIntent(said, now);
  if (intent?.kind !== 'reminder') throw new Error(`not a reminder: ${said}`);
  return intent;
}

describe('normalize', () => {
  test('drops the wake word, please and end punctuation', () => {
    expect(normalize('Hey Aster, remind me to call Mom at 9.')).toBe('remind me to call mom at 9');
    expect(normalize('  Please   stop! ')).toBe('stop');
    expect(normalize('Send it, please')).toBe('send it');
  });
});

describe('resolveClock: "9" is the next 9:00', () => {
  test('AM while it is still ahead, else PM, else tomorrow morning', () => {
    expect(resolveClock({ hour: 9, minute: 0, meridiem: null }, at(7))).toEqual(at(9));
    expect(resolveClock({ hour: 9, minute: 0, meridiem: null }, at(10))).toEqual(at(21));
    expect(resolveClock({ hour: 9, minute: 0, meridiem: null }, at(22))).toEqual(at(9, 0, 20));
  });

  test('AM / PM and 24-hour times are today, or tomorrow once past', () => {
    expect(resolveClock({ hour: 9, minute: 30, meridiem: 'pm' }, at(10))).toEqual(at(21, 30));
    expect(resolveClock({ hour: 7, minute: 0, meridiem: 'am' }, at(10))).toEqual(at(7, 0, 20));
    expect(resolveClock({ hour: 18, minute: 0, meridiem: null }, at(10))).toEqual(at(18));
    expect(resolveClock({ hour: 12, minute: 0, meridiem: 'am' }, at(10))).toEqual(at(0, 0, 20));
  });

  test('tomorrow: 7–11 is morning, other hours afternoon or evening; tonight is PM', () => {
    expect(resolveClock({ hour: 9, minute: 0, meridiem: null }, at(22), 'tomorrow')).toEqual(at(9, 0, 20));
    expect(resolveClock({ hour: 3, minute: 0, meridiem: null }, at(22), 'tomorrow')).toEqual(at(15, 0, 20));
    expect(resolveClock({ hour: 8, minute: 0, meridiem: null }, at(7), 'tonight')).toEqual(at(20));
  });
});

describe('reminders', () => {
  test('"Remind me to {X} at {time}"', () => {
    expect(reminder('Remind me to call Mom at 9', at(10))).toEqual({
      kind: 'reminder',
      title: 'Call Mom',
      trigger: 'time',
      dueAt: at(21),
    });
    expect(reminder('remind me to take the medicine at 9:30 p.m.', at(10)).dueAt).toEqual(at(21, 30));
    expect(reminder('Remind me to water the plants at nine', at(7)).dueAt).toEqual(at(9));
    expect(reminder('remind me at 6 pm to go to the market', at(10))).toMatchObject({
      title: 'Go to the market',
      dueAt: at(18),
    });
  });

  test('"in {n} minutes / hours"', () => {
    expect(reminder('Remind me to check the oven in 10 minutes', at(10)).dueAt).toEqual(at(10, 10));
    expect(reminder('remind me in an hour to call back', at(10))).toMatchObject({
      title: 'Call back',
      dueAt: at(11),
    });
    expect(reminder('remind me to stretch in half an hour', at(10)).dueAt).toEqual(at(10, 30));
    expect(reminder('remind me to stretch in two hours', at(10)).dueAt).toEqual(at(12));
  });

  test('"tomorrow at {time}" and "tonight"', () => {
    expect(reminder('Remind me to pay the rent tomorrow at 10', at(22)).dueAt).toEqual(at(10, 0, 20));
    expect(reminder('remind me to pay the rent at 10 am tomorrow', at(9)).dueAt).toEqual(at(10, 0, 20));
    expect(reminder('remind me to lock the door tonight', at(9)).dueAt).toEqual(at(21));
  });

  test('"when I get home"', () => {
    expect(reminder('Remind me to water the plants when I get home', at(10))).toEqual({
      kind: 'reminder',
      title: 'Water the plants',
      trigger: 'arrive_home',
      dueAt: null,
    });
    expect(reminder("remind me when I'm home to feed the cat", at(10))).toMatchObject({
      title: 'Feed the cat',
      trigger: 'arrive_home',
    });
  });

  test('no when: asked for one', () => {
    expect(reminder('Remind me to call the plumber', at(10))).toMatchObject({
      title: 'Call the plumber',
      trigger: null,
      dueAt: null,
    });
  });
});

describe('messages', () => {
  test('reading missed messages, all or from someone', () => {
    expect(parseIntent('Read my missed messages')).toEqual({ kind: 'read', name: null });
    expect(parseIntent('read my messages from Mom')).toEqual({ kind: 'read', name: 'mom' });
    expect(parseIntent('What did Asha say?')).toEqual({ kind: 'read', name: 'asha' });
    expect(parseIntent('Do I have any new messages')).toEqual({ kind: 'read', name: null });
    expect(parseIntent("read Ravi's messages")).toEqual({ kind: 'read', name: 'ravi' });
  });

  test('replies keep the words as said', () => {
    expect(parseIntent("Say I'll call at 9")).toEqual({ kind: 'reply', text: "I'll call at 9" });
    expect(parseIntent('Reply, On my way!')).toEqual({ kind: 'reply', text: 'On my way!' });
    expect(parseIntent('tell her that I will be late')).toEqual({
      kind: 'reply',
      text: 'I will be late',
    });
  });

  test('confirm, decline and stop', () => {
    expect(parseIntent('Send')).toEqual({ kind: 'confirm' });
    expect(parseIntent('Yes, send it')).toEqual({ kind: 'confirm' });
    expect(parseIntent('Not now')).toEqual({ kind: 'decline' });
    expect(parseIntent('Never mind')).toEqual({ kind: 'stop' });
    expect(parseIntent('Stop.')).toEqual({ kind: 'stop' });
  });

  test('questions are for the chat', () => {
    expect(parseIntent('What is the weather today?')).toBeNull();
    expect(parseIntent('How do I make chai')).toBeNull();
    expect(parseIntent('')).toBeNull();
  });

  test('a spoken name matches a VIP, a title or a sender', () => {
    expect(nameMatches('mom', ['Mom', null])).toBe(true);
    expect(nameMatches('my mom', [undefined, 'Mom'])).toBe(true);
    expect(nameMatches('asha', ['Asha Rao'])).toBe(true);
    expect(nameMatches('asha', ['Ashok'])).toBe(false);
  });
});
