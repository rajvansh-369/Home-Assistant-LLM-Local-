// All first-run screen text (plan §4). Canvas strings are exact; (proposed) ones follow §4.
// Screens are filled in from Phase 3; Phase 1 adds what the shared components and gallery need.

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
  emailPlaceholder: 'you@example.com',
  passwordLabel: 'Password',
  submit: 'Sign in',
  registerLink: 'First time? Create the household account',
  checking: 'Checking…',
  reachable: (ms: number) => `Reachable · HTTPS · ${ms} ms`,
  needsHttps: 'Use an https:// address',
  unreachable: "Can't reach this server",
} as const;

export const createOwner = {
  title: 'Create the Owner profile',
  subtitle:
    "The Owner sets up other profiles and is the only one who can see this phone's messages and location.",
  nameLabel: 'Name',
  namePlaceholder: 'Your name',
  pinLabel: '6-digit PIN',
  pinHelper:
    "You'll enter this each time you open your profile. Your server keeps only a scrambled copy.",
  fingerprint: 'Unlock with fingerprint',
  lockWhenLeave: 'Lock when I leave',
  lockWhenLeaveSubtitle: 'After 2 minutes in the background',
  submit: 'Create profile',
} as const;

export const setHome = {
  title: 'Where is home?',
  subtitle: 'Aster switches on when your phone gets here.',
  homeArea: 'Home area',
  radii: [100, 150, 300, 500] as const,
  radiusLabel: (m: number) => `${m} m`,
  llmLabel: 'Home LLM server',
  llmPlaceholder: 'http://192.168.1.20:8000',
  testHint: 'Test works only on home Wi-Fi',
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
