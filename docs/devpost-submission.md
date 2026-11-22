# Devpost submission – copy & paste

## Project name

Readact

## Tagline (max 200 characters)

Understand any official letter in your language. Your name, address and IBAN are blacked out on your device before any cloud AI sees them.

## Platform

Web (Chrome)

## Links

- Live demo: https://readact-app.web.app
- Code: https://github.com/ahmetdogn/readact
- Video: https://youtu.be/VIDEO_ID

## Built with (tags)

firebase-ai-logic, gemini-nano, gemini, chrome-built-in-ai, firebase-app-check, firebase-remote-config, cloud-firestore, firebase-authentication, firebase-hosting, typescript, vite, tesseract.js, webcrypto, indexeddb

---

## About the project (main text field)

### Inspiration

In Germany, the letters that matter most are the hardest to read. A tax assessment, a job centre decision, a health insurer turning down rehab, a debt collector's "final reminder". Millions of people, including migrants, older people and many who simply don't speak legal German, miss deadlines and lose money because of letters like these.

What people do today is take a photo and paste it into a chatbot. That uploads the most sensitive data they have, full name, home address, IBAN, tax ID and sometimes a diagnosis, just to understand one paragraph.

On-device AI makes a different answer possible. I didn't want the local model as a fallback for bad Wi-Fi. I wanted it **in front of** the cloud, deciding what the cloud is allowed to see.

### What it does

You take a photo of a letter (or use the sample). Readact then:

1. **Reads it in the browser.** OCR runs in a Web Worker; the photo is never uploaded.
2. **Redacts it on the device.** Rules plus Gemini Nano replace names, addresses, IBANs, tax and insurance IDs, phone numbers, birth dates and diagnoses with placeholders like `[NAME_1]`. You see exactly what the cloud would see and confirm it.
3. **Explains it in your language** (10 languages): who wrote it, what they want, how much money, and the next steps. On Gemini Nano when available, otherwise in the cloud with the redacted text.
4. **Calculates the real deadline.** The model only extracts what the letter says ("within one month of notification"). Code computes the date with the German 4-day postal rule (new since 2025), §§ 187–193 BGB and the public holidays of your federal state, and shows how it got there. One tap adds it to your calendar with reminders.
5. **Checks for scams.** IBAN checksum, non-EU accounts, foreign or premium phone numbers, WhatsApp and Gmail contacts, look-alike domains, crypto and gift cards, threats. Then Gemini reviews the wording.
6. **Remembers the case.** The next letter about the same matter is linked automatically and explained in context, like "This is the decision on your objection. The payment drops to €214." Stored only on the device, encrypted.
7. **Shows your options and a reply template.** For hard cases a bigger cloud model lists what to double-check, your options, free advice services and a German reply template. Your real details are filled back in locally.

A small panel at the end shows what left your device: for example _2 cloud requests, 1,990 characters, 0 personal values_.

### How I built it with Firebase AI Logic

Every model call goes through the Firebase AI Logic Web SDK (`firebase/ai`), and each step uses the inference mode that matches its privacy needs and its cost on a small on-device model:

| Step                                                  | Inference mode                                     |
| ----------------------------------------------------- | -------------------------------------------------- |
| Find personal data the rules missed                   | `ONLY_ON_DEVICE`                                   |
| Independent privacy check right before any cloud call | `ONLY_ON_DEVICE`                                   |
| Explain the letter                                    | `PREFER_ON_DEVICE`                                 |
| Extract deadlines (no date maths)                     | `PREFER_IN_CLOUD`                                  |
| Scam wording check                                    | `PREFER_IN_CLOUD`                                  |
| Explain a deadline calmly                             | `PREFER_IN_CLOUD`                                  |
| Explain a letter in the context of a case             | `PREFER_IN_CLOUD`                                  |
| Options and reply template                            | `PREFER_IN_CLOUD` (bigger model, Nano as fallback) |

All four inference modes are used. Gemini Nano processes one request at a time, so it does the privacy work and the main explanation; the heavier redacted steps run in the cloud in parallel and fall back to Nano when the cloud is unreachable or rejects a request. In testing this cut the time to the first result from roughly half a minute to a few seconds.

The same JSON schema is used as `responseConstraint` on device and `responseJsonSchema` in the cloud, so the app handles both answers the same way. `inferenceSource` is shown on every result as "on device" or "cloud · anonymised". The design rule behind all of it: **anything that might reach the cloud is redacted first**, and a guard in code refuses any request that still contains a known private value.

Other Firebase products:

- **App Check** with reCAPTCHA Enterprise protects the AI endpoints
- **Remote Config** holds the cloud model names
- **Anonymous Authentication**, so nobody needs an account
- **Cloud Firestore** in the EU stores deadline reminders, with rules that allow only a title, a date and a task
- **Firebase Hosting** serves the app

The rest is TypeScript and Vite with plain CSS, tesseract.js for OCR, and WebCrypto + IndexedDB for the encrypted case file.

### Challenges I ran into

- **Gemini Nano echoed placeholders.** In the second privacy pass Nano sometimes returned text like `Herr [NAME_2]` as a "leak". The app stored it as a new private value, which then tripped my own guard and blocked every request. Fix: a model finding only counts if it is still visible in the redacted text. There is a regression test for it now.
- **Getting deadlines right.** Letting the model compute dates was unreliable. On top of that, the German postal rule changed from 3 to 4 days in 2025, and holidays differ between states. So the model only extracts and code computes, with 14 test cases (Easter Monday, Reformationstag in Lower Saxony vs. Bavaria, 31 January + 1 month …).
- **Redaction without on-device AI.** Gemini Nano isn't on every device, and the people who need this most often have cheap phones. So the privacy promise had to hold without it: Unicode-aware rules for the address block, salutations, family members and name lists catch 47 of 47 private values in my five test letters, and the user confirms before anything is sent.
- **Prompt injection.** A letter is untrusted text. Every prompt wraps it as data and tells the model to ignore instructions inside it.
- **App Check in production.** Locally a debug token hid the problem. In production it took a while to sort out that the website key and the legacy secret key look almost identical.

### Accomplishments that I'm proud of

- The local model has a real job: it is the privacy gatekeeper, not just a fallback.
- On every device the app can show exactly what the cloud received, down to the character.
- Deadline maths that a person can check step by step instead of trusting a model.
- A scam check that caught every red flag in a fake "tax office" letter without a single false alarm on real ones.

### What I learned

Hybrid inference changes the question from "where is it cheaper to run this?" to "what is each part of the system allowed to know?". Small on-device models are very good at narrow jobs like finding names, and much less good at maths, so the best results came from splitting work between the model, plain code and the user.

### What's next for Readact

- An Android app with Gemini Nano through the same SDK, for a native camera flow
- Reply templates reviewed with legal advice services, and a review against the German Legal Services Act (RDG) before a public launch
- A family mode, so someone can help their parents with letters without seeing their data

### Built during the submission period

Readact is a new project, built from scratch in November 2026 for #BuildHybridAI. No code existed before. I used Claude Code as an AI coding assistant. Open-source libraries: Firebase JS SDK, tesseract.js, Vite, Playwright (for screenshots) and the fonts Inter Tight, Instrument Serif and JetBrains Mono. All letters, names and numbers in the demo and tests are fictional.

---

## Testing instructions for judges

1. Open **https://readact-app.web.app** in desktop Chrome. No account or login is needed.
2. Click **"See it with a sample →"**, tick the confirmation box and click **"Explain this letter"**.
3. To see the on-device path: enable `chrome://flags/#prompt-api` → _Enabled Multilingual_, restart Chrome, then click **Download** in the status chip at the top right. Without Gemini Nano the app still works and the cloud receives only redacted text.
4. Things to try:
   - **Show what the cloud would see:** toggle it in step 2 to see the placeholders.
   - **Your options:** click it to get the reply template with your details filled back in.
   - **Case file:** click _Start a case file_, then paste a follow-up letter (`FOLLOW_UP` in `scripts/screenshots.mjs`).
   - **Scam check:** paste the scam letter (`SCAM` in `scripts/screenshots.mjs`).

Readact helps people understand letters. It is not legal advice.
