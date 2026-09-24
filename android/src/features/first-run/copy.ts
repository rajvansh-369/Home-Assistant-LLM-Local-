// All first-run screen text (plan §4). Canvas strings are exact; (proposed) ones follow §4.
// Strings marked (proposed) cover states the canvas doesn't draw.

export const common = {
  brand: 'Aster',
  back: 'Back',
  stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
  profileColour: 'Profile colour',
  colourNames: { mint: 'Mint', lilac: 'Lilac', sky: 'Sky', peach: 'Peach' },
  allow: 'Allow',
  allowFor: (title: string) => `Allow ${title}`,
  allowed: 'Allowed',
  test: 'Test',
  somethingWrong: 'Something went wrong. Try again.', // (proposed)
} as const;

export const welcome = {
  headline: 'Your assistant, running on your own computer.',
  features: {
    server: 'Answers come from the model on your home computer.',
    home: 'Wakes up by itself when you get home.',
    lock: "Everyone gets a locked profile. No one can open another person's chats.",
    voice: 'Reads out the messages you miss.',
  },
  cta: 'Set up Aster',
  caption: "You'll need your Aster server's address.",
} as const;

export const signIn = {
  title: 'Sign in to your Aster server',
  callout:
    'Your account, profiles and chat history live on this server, so they work anywhere. Answers still come from your computer at home.',
  serverLabel: 'Server address',
  serverPlaceholder: 'https://aster.yourdomain.com',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com', // (proposed)
  passwordLabel: 'Password',
  submit: 'Sign in',
  registerLink: 'First time? Create the household account',
  checking: 'Checking…', // (proposed)
  reachable: (ms: number) => `Reachable · HTTPS · ${ms} ms`,
  needsHttps: 'Use an https:// address', // (proposed)
  unreachable: "Can't reach this server", // (proposed)
  wrongCredentials: 'Email or password is wrong.', // (proposed)
  tooManyTries: (seconds: number) => `Too many tries. Try again in ${seconds} s.`, // (proposed)
  signInAgain: 'Please sign in again.', // (proposed)
  // Register mode (all proposed).
  registerTitle: 'Create the household account',
  registerSubmit: 'Continue',
  signInLink: 'Already set up? Sign in',
  passwordHelper: 'At least 8 characters',
} as const;

export const createOwner = {
  title: 'Create the Owner profile',
  subtitle:
    "The Owner sets up other profiles and is the only one who can see this phone's messages and location.",
  nameLabel: 'Name',
  namePlaceholder: 'Your name', // (proposed)
  pinLabel: '6-digit PIN',
  pinHelper:
    "You'll enter this each time you open your profile. Your server keeps only a scrambled copy.",
  fingerprint: 'Unlock with fingerprint',
  lockWhenLeave: 'Lock when I leave',
  lockWhenLeaveSubtitle: 'After 2 minutes in the background',
  submit: 'Create profile',
  noFingerprint: 'Set up a fingerprint in Android settings first', // (proposed)
  // Returning to 1.3 after the Owner exists (proposed).
  save: 'Save profile',
  pinLocked: 'Change your PIN later in Settings.',
} as const;

export const unlock = {
  ownerBadge: 'Owner',
  prompt: 'Enter your PIN',
  fingerprintHint: 'Or touch the fingerprint sensor',
  accepted: 'PIN accepted',
  fingerprintKey: 'Unlock with fingerprint',
  deleteKey: 'Delete last digit',
  lockNote: '5 wrong tries lock this profile for 30 seconds.',
  wrongPin: 'Wrong PIN', // (proposed)
  locked: (seconds: number) => `Locked. Try again in ${seconds} s`, // (proposed)
} as const;

export const setHome = {
  title: 'Where is home?',
  subtitle: 'Aster switches on when your phone gets here.',
  mapLabel: 'Map with your home and the area around it',
  searchLabel: 'Search for your address',
  locateLabel: 'Use my current location',
  withinRadius: (m: number) => `Aster turns on within ${m} m of here`,
  noPoint: 'Search for your address or use your location', // (proposed)
  locationOff: 'Location is off. Search for your address instead.', // (proposed)
  noMatch: (query: string) => `No match for “${query}”`, // (proposed)
  homeArea: 'Home area',
  radii: [100, 150, 300, 500] as const,
  radiusLabel: (m: number) => `${m} m`,
  wifiLabel: 'Home Wi-Fi (optional)',
  wifiPlaceholder: 'Your Wi-Fi name', // (proposed)
  wifiHelper: 'Confirms you’re really home before the assistant turns on.',
  llmLabel: 'Home LLM server',
  llmPlaceholder: 'http://192.168.1.20:8000',
  testHint: 'Test works only on home Wi-Fi',
  publicLlm: 'This looks like a public address. Keep zypherLL on your home network.', // (proposed)
  // Test results (all proposed).
  llmReady: (model: string, ms: number) => `Ready · ${model} · ${ms} ms`,
  llmLoading: 'Model is loading. Try again in a minute.',
  llmFailed: (error: string) => `Model failed to load: ${error}`,
  llmNoReply: 'No reply in 3 s. Are you on home Wi-Fi?',
  llmBlocked: (host: string) => `This build only allows plain HTTP to ${host}.`,
  submit: 'Save home',
} as const;

export const permissions = {
  title: 'Let Aster listen for you',
  subtitle: 'Android asks for each one separately. For location, pick “Allow all the time”.',
  rows: {
    notifications: {
      title: 'Notification access',
      description: 'Reads WhatsApp and Google Chat messages as they arrive.',
    },
    sms: { title: 'SMS', description: 'Reads your text messages.' },
    location: {
      title: 'Location, all the time',
      description: 'Knows when you get home, and saves your location to your server.',
    },
    microphone: {
      title: 'Microphone',
      description: 'For voice chat and the “Hey Aster” wake word.',
    },
    background: {
      title: 'Run in background',
      description: 'Keeps listening after you close the app, with a small ongoing notification.',
    },
    contacts: { title: 'Contacts', description: 'Matches senders like “Mom” to your VIP list.' },
  },
  finish: 'Finish setup',
  skip: 'Skip for now',
} as const;

// 3.1 Home placeholder (Phase 2). Replaced when row 2 builds the real Home.
export const homePlaceholder = {
  title: 'Home',
  subtitle: 'This screen stands in for 3.1 Home.',
  savedFacts: 'Saved first-run facts',
  none: '—',
  reset: 'Reset first run',
  gallery: 'Component gallery',
  facts: {
    server: 'Server',
    email: 'Email',
    owner: 'Owner',
    home: 'Home',
    wifi: 'Home Wi-Fi',
    llm: 'Home LLM',
    fingerprint: 'Fingerprint unlock',
    lockWhenLeave: 'Lock when I leave',
    permissionsDone: 'Permissions step done',
  },
  yes: 'On',
  no: 'Off',
} as const;

// Temporary controls on the Phase 2 placeholder screens. Phases 3–6 remove them.
export const placeholder = {
  next: 'Next',
  pinLabel: 'PIN',
  addressLabel: 'Address',
  latLabel: 'Latitude',
  lngLabel: 'Longitude',
} as const;
