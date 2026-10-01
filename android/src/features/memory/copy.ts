// 5.2 Memory and activity text (docs/aster-profiles-memory-plan.md §4). Canvas strings unless
// marked (proposed).
export const memory = {
  title: 'Memory and activity',
  rememberMe: 'Remember things about me',
  rememberDetail: (name: string) => `Kept on your home computer, only for ${name}`,
  notes: 'Notes about you',
  forget: 'Forget this',
  addNote: 'Add a note',
  notePlaceholder: 'Something Aster should remember', // (proposed)
  saveNote: 'Save note', // (proposed)
  noNotes: 'No notes yet. Aster adds them when you tell it about yourself.', // (proposed)
  learned: 'Learned answers',
  learnedCount: (n: number) => `${n} ${n === 1 ? 'answer' : 'answers'} learned from your chats`,
  ratedCount: (n: number) => `${n} rated · rate answers in chat to rank them`,
  marklCount: (n: number, engine: string) => `${n} ${n === 1 ? 'note' : 'notes'} kept by ${engine}`, // (proposed)
  forgetAll: 'Forget everything',
  forgetAllConfirm:
    'Every note and learned answer for this profile is removed from your home computer.', // (proposed)
  cancel: 'Cancel', // (proposed)
  activity: 'Activity log',
  clearLog: 'Clear log',
  clearConfirm: 'Every event in this log is removed from your server.', // (proposed)
  noActivity: 'Nothing here yet.', // (proposed)
  activityFailed: "Can't load the activity log. Check your connection.", // (proposed)
  today: 'Today', // (proposed)
  atHomeOnly: 'Memory can only be viewed and changed at home.',
  memoryOff: 'Memory is off. Turn it on to see and add notes.', // (proposed)
  memoryFailed: "Your home computer didn't answer. Try again in a moment.", // (proposed)
  retry: 'Try again', // (proposed)
  saveFailed: "Couldn't save. Check your connection and try again.", // (proposed)
} as const;
