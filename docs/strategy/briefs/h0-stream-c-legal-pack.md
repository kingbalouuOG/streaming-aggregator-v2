# H0 Stream C — Legal & compliance pack (solicitor review)

**Context:** Roadmap v1.0 H0 item 0.1 — **the hard public-launch blocker** (IN-XPS-014, filed Phase 5.5). The Privacy Policy + ToS drafts at `docs/legal/{privacy-policy,terms-of-service}.md` are descriptive of current behaviour but not lawyer-vetted, and intentionally carry placeholder contact details. One solicitor pass must cover the app as it will be at release — including **two additions landing in H0**: completed click-out logging (Stream A2) and push tokens/notification consent (Stream B Phase 1).

**Joe-led for engagement/booking; a session can assemble the pack.** Book the solicitor immediately — calendar time dominates; the pack follows within the fortnight.

## The pack to assemble

1. **Current drafts:** `docs/legal/privacy-policy.md` + `docs/legal/terms-of-service.md` (note their lawyer-vetting caveat footers; §2 of the policy mirrors the in-app "What Videx learns" modal).
2. **Data-flow inventory** (one page): what's collected, where it lives, retention — profiles/auth (Supabase, London region), watchlist, taste vectors + interaction events, card impressions (90-day retention + rollup), onboarding events, app feedback, availability reports, GDPR Art. 17 delete (`delete_own_account`, migration 042) + Art. 20 export (`export_user_data`, 043). **New in H0:** deep-link click metadata now includes link type + price shown (Stream A2); push tokens + per-type notification consent (Stream B Phase 1 — its half-page data-model note slots in here verbatim).
3. **Questions for the solicitor:**
   - Are the drafts fit for App Store / Play public release for a UK-based sole operator?
   - Controller contact details: is email-only sufficient under UK GDPR Art. 13(1)(a)? (Prior analysis: yes, legally.) Joe's options: email-only · registered-office address service (~£30–50/yr, recommended over home address) · PO Box. **Joe decides before the pack goes out.**
   - ICO registration: required at this scale/processing profile? (Likely yes and cheap — confirm tier.)
   - Any age-gating obligations given no under-18 targeting (relevant: ICO Children's Code posture — the app does not target children and the roadmap explicitly rejects a kids product).
   - Forward-looking heads-up only (not for detailed review yet): future affiliate links will need ASA/CMA disclosure copy; future Premium adds consumer-contract terms — flag so the drafting anticipates rather than blocks.
4. **Logistics:** suggest fixed-fee review; typical turnaround expectations; note the two H0 additions so the review happens ONCE.

## Sequencing

- **This week:** Joe picks the contact-address option and books/enquires (fixed-fee UK tech/commercial solicitor; a session can shortlist firms if useful).
- **Week 1–2:** Stream B Phase 1 note lands → pack finalised → sent.
- **Blocker linkage:** the quiet release (0.12) cannot happen until this clears. Everything else in H0 proceeds in parallel.

## Done means

Solicitor engaged · pack sent covering current app + click-out + push consent · feedback incorporated into `docs/legal/*` (placeholders replaced with the chosen contact route) · IN-XPS-014 closed in the pre-launch-blockers register + parking lot · wiki log entry.
