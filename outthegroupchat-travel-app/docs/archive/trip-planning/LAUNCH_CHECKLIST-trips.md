# Launch Checklist — Trip Planning Snapshot

> Snapshotted 2026-04-16 during Phase 1 archival.
> Source: outthegroupchat-travel-app/docs/LAUNCH_CHECKLIST.md (as of main commit after PR #40).
> This is a frozen record. The live docs will be updated to remove trip-specific content by Wave 2 agent G.

---

## Trip Management 🔶

- [x] Create trip API
- [x] Trip listing
- [x] Trip detail page
- [ ] Trip wizard (multi-step creation)
- [ ] Trip editing
- [ ] Trip deletion/archiving
- [x] Member invitation via email ✅ Dec 17
- [x] Activity management ✅ Dec 17
- [x] Itinerary route complete (GET/POST/PUT with $transaction atomicity) ✅ 2026-03-23

---

## Group Coordination 🔶

- [x] Survey API structure
- [x] Voting API structure
- [ ] Survey frontend integration
- [ ] Voting frontend integration
- [ ] Real-time vote updates
- [ ] Survey results display

---

## Trip-Related Security Fixes

From the Launch Checklist's Critical Fixes Required list (items that
affected trip-planning endpoints):

```
⚠️ MUST FIX BEFORE LAUNCH:

4. [x] Fix placeholder user creation abuse ✅ Dec 2025
   File: src/app/api/trips/[tripId]/invitations/route.ts

8. [x] Strip email from unauthenticated public trip responses ✅ 2026-03-25
   File: src/app/api/trips/[tripId]/route.ts (email removed from public GET)
```

---

## Trip-Related Testing Coverage (as of 2026-04-16)

From the Unit Tests section — trip-domain test files:

- API route tests (trips 30, voting 10, survey 11, feed 12) ✅ 2026-03-10
- API route tests (trips-suggestions 23, trips-flights 26, trips-members 29) ✅ 2026-03-20 — total: 382 tests across 22 files
- API route tests (trips-tripid 20, tripid-invitations 14, tripid-recommendations 11) ✅ 2026-03-22
- API route tests (trips-voting 50, trips-invitations 33, trips-itinerary 43) ✅ 2026-03-23 — total: 910+ tests across 46 files
- API route tests (trips-itinerary +21) ✅ 2026-03-24
- API route tests (invitations-post 18) ✅ 2026-03-25
- Service tests (survey.service 36) ✅ 2026-03-26
- API route tests (trips-survey-voting-extended 23) ✅ 2026-04-16

### Integration Tests
- [x] Trip CRUD tests ✅ 2026-03-10

### E2E Tests (Critical Flows) — trip-related
- [ ] User signup → trip creation → invite flow
- [ ] Survey completion flow
- [ ] Voting flow

### Manual Testing Checklist — trip-related items
```bash
□ Create a new trip
□ View trip details
□ Invite a member (link-based)
```

---

## Trip-Related UI/UX States

From the UI/UX Polish phase:

### Empty States
- [x] No trips empty state ✅ Dec 17

---

## Trip-Related Success Metrics

From the Success Metrics for Beta table:

| Metric | Target | How to Track |
|--------|--------|--------------|
| Trips created | 10+ | Database count |
