# Prototype-user re-onboarding runbook (LAUNCH-1 W4)

**Why:** ENG-1 changed how taste profiles work — multi-interest centroids, positive-only interaction weights, a new bootstrap path. Existing prototype profiles ride a legacy single-vector anchor and won't get the new multi-interest behaviour without re-bootstrapping. The clean way is a full account reset → fresh onboarding. Bonus: deleting the account end-to-end exercises the UK GDPR Art. 17 deletion flow on real accounts right before launch — doubling as live evidence for the solicitor review (IN-XPS-014) that "Delete my account" does what the Privacy Policy claims.

**Who:** the two prototype testers. Known: **joegreenwas@gmail.com** (Joe's Videx testing account — NOT josephgreen1515@gmail.com). Second tester: _[Joe to fill]_.

**Prerequisite:** each tester has the signed release APK (LAUNCH-1 W2, v1.1.0) installed. The signature change from the debug build forces an uninstall/reinstall — that's fine, all real data lives server-side; only local caches reset.

---

## Per-user steps (each tester does this on their own phone)

1. **Install the v1.1.0 release APK** (replaces any earlier Videx build).
2. **Open the app, sign in** with the existing account.
3. **Profile → Settings → Privacy & Data → Delete my account.** Confirm. This is irreversible and wipes every server-side row (Art. 17 flow). Expect to land back on the signed-out / welcome screen within a second or two.
4. **Create a fresh account** (same email is fine — it was just deleted, so it's free again; or a new one).
5. **Complete onboarding fully:** pick UK streaming services, complete the taste-cluster / grid step, finish to the end (don't drop out mid-flow — the bootstrap needs the full signal).
6. **Open For You.** Confirm it renders rows (hero, fingerprint card, recommendations). Drag a fingerprint slider once to confirm live re-ranking. That's the user-visible "it worked" check.

Send Joe a thumbs-up when done.

## Joe's message to send the testers

> Hi — quick reset needed on Videx before the next phase. I've sent you the new version (v1.1.0). Once it's installed:
> 1. Open it, sign in.
> 2. Go to Profile → Settings → Privacy & Data → **Delete my account** (this fully wipes the old profile — it's intentional).
> 3. Sign up fresh and go through onboarding again (pick your services + taste picks, finish to the end).
> 4. Open the **For You** tab and have a quick scroll to check it loads.
> Ping me when you're done. Takes ~3 minutes. Thanks!

_(Attach the v1.1.0 APK.)_

## Server-side verification (CC runs after both testers confirm)

For each new user id, confirm the profile bootstrapped correctly. Run via Supabase (read-only):

```sql
-- Per re-onboarded user: taste vector present + interest centroids built.
select
  p.id,
  (tp.taste_vector is not null)                as has_taste_vector,
  count(uic.slot)                              as centroid_count,   -- expect 1–3
  (select count(*) from user_services us where us.user_id = p.id)  as services,
  (select count(*) from user_genres   ug where ug.user_id = p.id)  as genre_picks
from profiles p
left join taste_profiles        tp  on tp.user_id = p.id
left join user_interest_centroids uic on uic.user_id = p.id
where p.id in ('<new-user-id-1>', '<new-user-id-2>')
group by p.id, tp.taste_vector;
```

**Pass criteria:** `has_taste_vector = true`, `centroid_count` between 1 and 3, `services ≥ 1`, `genre_picks ≥ 1`. If `centroid_count = 0`, the bootstrap fell back to the legacy single-vector path — re-check the onboarding completed fully (step 5), and confirm the catalogue embeddings the bootstrap groups over are present.

## Notes

- Full deletion (not a softer "reset taste profile") was the chosen mechanism — confirmed with Joe: few testers, light usage, and it validates the legal deletion flow.
- This is the trigger that starts the D4 / IN-PX-59 clock (delete the client For You fallback pipeline one release after this ships).
