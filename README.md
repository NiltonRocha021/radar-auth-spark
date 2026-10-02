# Signal Radar Login

Create the complete authentication flow for AISignalRadar.
Dark theme ONLY: bg #0A0B0E, cards #111318, borders #1E2028.
Accents: blue #185FA5, cyan #378ADD. Text: #E6F1FB primary, #888780 muted.

## /login page
Full-screen centered layout. Single card (max-width 420px).
Subtle dot-grid CSS pattern on background.

Card header:
- Icon square (dark blue #0C447C, rounded 10px) with radar/candle SVG icon
- "AISignalRadar" (font-weight 500, white, 20px)
- "Intelligence Platform" (12px, muted)
- Thin divider

Tabs (pill toggle): [Sign In] [Create account]

### Sign In tab
- Email input (ti-mail prefix)
- Password input (ti-lock prefix) + show/hide eye toggle
- Row: "Remember me" checkbox + "Forgot password?" link (blue, right)
- Primary button: "Sign in" (full width, #185FA5)
- Divider: "or continue with"
- Google button: full width, #1E2028 bg, Google G SVG (4 brand colors: #4285F4 #34A853 #FBBC05 #EA4335), "Continue with Google", 44px height
- Footer: "By signing in you agree to our Terms of Service" (11px, muted)

### Create Account tab
- Full name input (ti-user)
- Email input (ti-mail)
- Password + strength bar (4 segments: red/amber/amber-green/green)
- Confirm password
- Terms checkbox
- Primary button: "Create account"
- Google button (same style)

### Forgot password flow
Replace card content:
- Back arrow (top left)
- "Reset your password" title
- Email input + "Send reset link" button
- Success state: green checkmark + "Check your inbox" + email shown

## /onboarding page (post-signup, 3 steps)
Progress bar at top (3 steps).

Step 1: "What's your trading experience?"
Large selectable cards (single select):
Beginner (<1yr) | Intermediate (1–3yr) | Advanced (3+yr) | Professional

Step 2: "What do you trade?"
Multi-select cards: Crypto | Forex | Stocks | Indices | Futures

Step 3: "What's your main goal?"
Single select: Better entries | Avoid manipulation | Understand context | Improve consistency | Reduce emotional trading

"Continue" button advances. "Skip" link bottom-right.
Slide animation between steps.
Last step: "Start using AISignalRadar →" → /dashboard

## Micro-interactions
- Input focus: border → #378ADD (smooth)
- Error states inline (not toast): red border + message below field
- Loading state on buttons: spinner replaces text
- All errors: "Invalid email" / "Password min 8 chars" / "Passwords don't match"

## After login: /dashboard | After register: /onboarding

Tech: React + TypeScript + Tailwind + shadcn/ui + react-hook-form + zod + @react-oauth/google

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://radar-auth-spark.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5db6f068-5b7e-4ea5-8f34-81f0a2ceb33c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
