# Design brief: choosing your services and channels

**Date:** 2026-09-15 · **For:** Claude Design (mock-ups), then implementation in the native app · **Owner:** Joe · **Surfaces:** onboarding step 2, Profile → Streaming Services, Where to Watch on a title

---

## 1. What Videx is, in one paragraph

Videx is a UK app that tells you what to watch across the streaming services you already pay for. You tell it which services you have; it recommends films and series that are included with them, and one tap opens the title in the right app. The whole product rests on one question being answered correctly: **what can this person watch without paying anything extra?**

## 2. What changed, and why this brief exists

Some services sell other services inside themselves:

- **Prime Video Channels** — Shudder, MGM+, HBO Max, Paramount+ and others, each a separate monthly add-on bought inside Amazon.
- **Apple TV Channels** — the same idea inside the Apple TV app.
- **NOW passes** — NOW has no base plan; you buy Cinema, Entertainment or Hayu passes.

Having Prime does not mean having Shudder. Until this week Videx could not tell the difference, so it either recommended Shudder films to every Prime subscriber or to nobody. We have now built the model: a user can say "I have Prime, and Shudder and MGM+ inside it", and recommendations and Where to Watch respect it. It is live and works on device.

**The screen for choosing them is confusing.** Joe, after the device check:

> It's open by default, so it's a little confusing to understand whether I was looking at services under Netflix or under Prime. They're next to each other, so I had to stop and actually read.

We want better options for how a person picks their services and the channels inside them, in onboarding and in Profile.

## 3. The current UI (what to improve on)

Both onboarding step 2 and Profile → Streaming Services use the same picker:

1. A **two-column grid of 15 service tiles** (logo, name, one-line description, check circle). Selected tiles get an orange border and orange-tinted fill.
2. When Prime Video, Apple TV+ or NOW is selected, a **full-width panel of channel chips** appears **beneath the row that contains that tile** — titled "CHANNELS THROUGH PRIME VIDEO", with pill chips (orange tint + tick when held).

Why it confuses:

| Problem | Cause |
|---|---|
| You can't tell which tile the chips belong to | Prime sits in the right column next to Netflix; the panel spans both columns below them, so it reads as belonging to either |
| It is open by default | Selecting the tile expands the panel immediately; in Profile, a user with Prime and Apple sees two long panels the moment the screen opens, even if they hold no channels |
| The screen gets long and noisy | Prime alone offers 14 chips; Prime + Apple + NOW is 24 chips inside a 15-tile grid |
| Some chips duplicate tiles | HBO Max, Paramount+, discovery+, Crunchyroll and MUBI are both tiles and chips; toggling one toggles the other (on purpose — see §5), which is surprising if you don't expect it |
| Nothing on the tile says channels exist | A user who hasn't selected Prime yet has no hint that there is more to choose |

A secondary copy problem: NOW's tile description reads "Sky Cinema & HBO", which no longer describes what NOW is.

## 4. Customer journeys

### A. New user — onboarding

Onboarding is five steps with a progress bar: **1 Create Account → 2 Connect Services → 3 Your Watch History → 4 Your Tastes → 5 Fine-Tune**. Step 2 is this brief.

- **Who:** someone who has just made an account, is keen to get to recommendations, and knows which services they pay for but may not think of "Shudder on Prime" as a separate thing.
- **Job:** tick the services they have; if they have channels inside Prime/Apple/NOW, say so — without being made to wade through lists they don't need.
- **Must:** select at least one service to continue; "Select all" exists today; progress is saved if they leave and come back.
- **Tone:** quick, confident, no jargon. Most people have no channels; the design must not slow them down.

### B. Existing user — Profile → Streaming Services

Profile shows a row **"Streaming Services · 5 services connected"** that opens the picker as a sub-screen with a Save button.

- **Who:** someone who just subscribed to (or cancelled) something, or who noticed a title "via a channel" and realised they hold it.
- **Job:** find the service, change it, save. They should see at a glance what they currently hold, including channels.
- **Implication:** the Profile row's summary should probably mention channels ("5 services · 2 channels").

### C. The payoff — Where to Watch on a title

On a title page, Where to Watch lists, in order:

1. **On your stack** — orange rows, "Watch on Netflix". Channels the user holds now join here: "Watch on Shudder · via Prime Video".
2. **Also available on** — services the user doesn't have.
3. **Rent or buy** — prices.
4. **Via a channel** — channels the user does *not* hold, labelled "Shudder · on Prime Video", with the note "Needs a subscription to the channel, not just the service it sits in".

Worth exploring: from a "Via a channel" row, a lightweight way to say "I have this" without leaving the title. Not required, but it is the moment a user is most likely to realise they hold a channel.

### D. Recommendations

After adding a channel, For You starts including that channel's titles (within about 20 minutes, sooner on pull-to-refresh). No UI is required, but a confirmation after saving ("We'll include Shudder titles in For You") would close the loop.

## 5. Rules the design must respect

These are how the system works; the UI can present them however it likes but must not contradict them.

1. **One channel, one choice.** A channel is held once, however it was bought. Hayu via Prime and Hayu via a NOW pass are the same selection.
2. **Some channels are also services.** HBO Max, Paramount+, discovery+, Crunchyroll and MUBI exist as their own tiles *and* inside Prime/Apple. Holding the service means holding the channel everywhere. The UI must show these as the same choice, never two independent toggles.
3. **Other channels need their parent.** Shudder only counts if the user also has Prime (or Apple, where Apple sells it).
4. **NOW is not a special case.** It behaves like Prime and Apple: a parent tile with three passes.
5. **The channel list is data, not design.** It is edited without an app release. Designs must cope with 0 to about 20 channels under a parent and names from 3 to 22 characters ("MGM+", "STUDIOCANAL Presents").
6. **The channel list can fail to load.** The services picker must still work; channels simply don't appear.
7. **Saving:** onboarding saves everything at the end of the flow; Profile saves on an explicit Save today (changing that is in scope if a design argues for it).

## 6. Content to design with

### Services (15, current display order)

| Service | Current description |
|---|---|
| Netflix | Movies & Series |
| Prime Video | Amazon Originals |
| Disney+ | Disney, Marvel, Star Wars |
| BBC iPlayer | BBC Originals & Live |
| ITVX | ITV Originals & Live |
| Channel 4 | Channel 4 & Film4 |
| NOW | Sky Cinema & HBO *(stale — needs new copy)* |
| Sky Go | Live TV & Sky Originals |
| Apple TV+ | Apple Originals |
| Paramount+ | CBS & Paramount |
| HBO Max | HBO, Max Originals & DC |
| Pluto TV | Free, Ad-Supported |
| Discovery+ | Factual & Real-Life |
| Crunchyroll | Anime & Simulcasts |
| MUBI | Curated Arthouse Cinema |

### Channels by parent

Numbers are the titles in Videx's catalogue that you can **only** watch through that channel (15 Sept, before about 2,300 more were queued) — a rough guide to what holding it unlocks.

**Prime Video (14):** STUDIOCANAL Presents 301 · Lionsgate+ 267 · MGM+ 201 · BFI Player 150 · Curzon 145 · Shudder 126 · Crunchyroll* 66 · Paramount+* 60 · ITVX Premium 41 · discovery+* 12 · Acorn TV 8 · MUBI* 8 · HBO Max* 6 · Hayu 4

**Apple TV+ (7):** STUDIOCANAL Presents 221 · BFI Player 84 · Paramount+* 35 · MUBI* 12 · Crunchyroll* 10 · Acorn TV 7 · discovery+* 1

**NOW (3):** Entertainment 42 · Cinema 24 · Hayu 11

\* also a standalone service tile.

The current order is a fixed sort (standalone services first, then the rest); ordering by what the channel unlocks is a legitimate design choice.

### A realistic user to mock up

"Sam": Netflix, Prime Video, BBC iPlayer, ITVX, Apple TV+. Holds Shudder and MGM+ inside Prime. Doesn't know Apple sells channels. Use Sam for the Profile and Where to Watch states.

## 7. Directions worth exploring

Not prescriptive — give us at least two genuinely different ones.

- **Collapsed by default, disclosed from the tile.** Each Prime/Apple/NOW tile carries a quiet affordance ("+ Add channels" or "2 channels") that opens its channels in place, visually attached to that tile (e.g. the tile grows into a card), never spanning two columns.
- **A sheet per parent.** Tapping "Channels" on the tile opens a bottom sheet titled "Inside Prime Video" with a searchable or grouped list; the tile shows a summary afterwards.
- **A list instead of a grid.** One service per row, full width, so disclosure beneath a row is unambiguous; channels indent under their parent.
- **A follow-up question in onboarding.** Step 2 stays a simple grid; if the user picked Prime, Apple or NOW, a short interstitial asks "Any channels inside Prime Video?" before step 3 (this changes the step count or makes step 2 two screens — call that out).

Whatever the direction, show how the five service-and-channel duplicates (rule 2) read, and how a tile summarises held channels when collapsed.

## 8. What we'd like back from Claude Design

Dark theme, iPhone portrait (390 × 844), annotated where behaviour isn't obvious.

1. **Onboarding step 2**, for each direction: nothing selected · Prime selected, channels not opened · Prime channels open with two held · Prime + Apple + NOW selected (the long case).
2. **Profile → Streaming Services** for Sam: arriving on the screen · editing channels · the saved confirmation.
3. **The Profile row** summarising services and channels.
4. **Where to Watch** for a title Sam can watch via Shudder: held channel in "On your stack", and an unheld channel under "Via a channel" (with the optional "I have this" affordance if a direction includes it).
5. Edge cases on one board: long channel name, parent with 1 channel, channel list failed to load.

## 9. Design system to use

Videx uses its "Editorial Direction A" system (full package: `design_handoff_videx` — `tokens.css`, `videx-design-system.html`, reference screens; Joe can attach it).

| Token | Value | Use |
|---|---|---|
| Background | `#0a0a0f` | screen |
| Card | `#14141c` | tiles, panels |
| Foreground | `#f5f1e8` (cream) | primary text |
| Muted text | cream at 62% · faint 40% | descriptions, captions |
| Border | cream at 10% | tile and card outlines |
| Primary | `#e85d25` | CTAs, selected borders, kickers — use sparingly |
| Primary soft / edge | orange at 14% / 42% | selected fills, active chips |
| Radii | card 12 · lg 14 · pill 999 | tiles/cards · CTA · chips |
| Type | Fraunces (editorial serif, optical cuts per role) for headlines; DM Sans for UI | headline 28, section 18, body/meta 13, kicker 11 uppercase tracked |
| Service badges | brand-coloured logo squares, 28 / 38 / 48 px | tiles use 48 |

Principles from the system that apply here: restraint (orange is reserved, not decoration); editorial kickers in small uppercase; primary CTA is a filled 14-radius button, pills are for chips only.

## 10. What good looks like

- In a five-second look, a user can say which service a channel belongs to without reading a heading.
- A user with no channels sees a screen no longer or busier than today's grid.
- Adding a channel takes at most two taps from the service tile.
- The five duplicate services (rule 2) never look like two separate things.
- In Profile, what you currently hold — services and channels — is visible without opening anything.
- Accessible: 44 pt touch targets; a screen reader announces "Shudder, channel in Prime Video, selected".

## 11. Out of scope

Pricing for channels (Profile's monthly-spend figure counts services only — flag it if a design wants to show channel cost, but don't design the model); the rest of onboarding (steps 1, 3–5); search and browse filters; light theme.

## 12. After the mock-ups

Joe shares the chosen direction back; implementation lands in the shared picker component (`native/src/components/services/ServicePicker.tsx`, used by both onboarding and Profile), the Profile row, and Where to Watch — no backend change needed for any direction in §7.
