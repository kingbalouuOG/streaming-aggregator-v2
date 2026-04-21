"""One-off relabel of all 69 mood rooms (April 2026).

Background: run #2 of the clustering pipeline produced coherent clusters
but poor labels — the LLM at temperature=0 fell into a narrow bag of
evocative vocabulary (Whispers, Echoes, Shadows, Whimsical, Tales,
Chronicles, Realm, Allure, Reverie, Odyssey, Tapestry) that repeated
across unrelated rooms and obscured the actual content.

This script applies the agreed manual relabelling from the "Mood Rooms
Relabelling Brief" (approved by Joe, April 2026). No LLM call — the
69 labels below are final.

Cluster IDs and member titles are untouched. Only mood_rooms.label,
mood_rooms.description, and updated_at change. is_curated stays false
because these are style corrections, not per-room editorial curation.

The permanent prompt rewrite in label.py ships in the same commit; the
May 2026 cron run onward generates new clusters in the same style.

Usage (from repo root):
    python scripts/mood_rooms/oneoff/relabel_2026_04.py

Safety:
- Pre-flight: confirms all 69 current labels exist exactly once in the
  latest mood_rooms version before any UPDATE. Drift is surfaced
  up-front with a list of missing / duplicated labels.
- Transaction: all UPDATEs in one transaction; per-UPDATE rowcount
  assertion as defence-in-depth behind the pre-flight.
- Idempotence: running a second time will fail pre-flight (the old
  labels are gone) — that's the correct behaviour.
"""

from __future__ import annotations

import logging
import random
import sys
from pathlib import Path

# Allow `from persist import ...` when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from persist import connect, redact_exception  # noqa: E402


log = logging.getLogger("relabel")


# (current_label, new_label, new_description) - 69 rows, verbatim from the
# Mood Rooms Relabelling Brief section 3.1.
RELABELS: list[tuple[str, str, str]] = [
    ("Tokyo's Twilight Tales", "Late-Night Anime Drama", "Japanese animated drama with supernatural and emotional weight, ideal for late evening viewing."),
    ("Underworld Retribution", "Saturday Night Action", "Mid-budget action thrillers featuring professionals, criminals, and revenge."),
    ("Seoul's Dark Allure", "K-Drama Binge", "Korean drama spanning crime, romance, and supernatural - built for long sessions."),
    ("Haunted Ancestral Echoes", "Slow-Burn Horror", "Atmospheric horror centred on family legacies and ancestral homes."),
    ("Tamil Tales of Turmoil", "Tamil Crime Drama", "Tamil-language films exploring love, betrayal, and societal conflict."),
    ("Whimsical Playland", "Saturday Morning Cartoons", "Bright animated series for young children - adventure, friendship, lessons."),
    ("Whispers of Destiny", "Chinese Drama Binge", "Chinese-language drama spanning historical and contemporary stories."),
    ("Modern Romantic Misadventures", "Date Night Rom-Coms", "Contemporary romantic comedies for an easy evening."),
    ("Chilling Justice Chronicles", "True Crime Deep Dives", "True-crime documentaries and investigative series."),
    ("Secrets and Shadows", "Spanish-Language Drama", "Spanish-language drama centred on intrigue, betrayal, and hidden truths."),
    ("Nature's Majestic Tapestry", "Wind-Down Nature", "Nature documentaries - wildlife, ecosystems, calm viewing."),
    ("Cultural Echoes", "American Music & Film Docs", "Documentaries on American music, cinema, and cultural milestones."),
    ("Shadows of Justice", "Sunday-Night Crime", "British crime drama with moral complexity and character depth."),
    ("Dream Home Odyssey", "Cosy Renovation Shows", "British home renovation and transformation shows for relaxed viewing."),
    ("Culinary Showdown", "Kitchen Drama", "Cooking competitions where pressure produces the entertainment."),
    ("Bollywood Melodrama", "Bollywood Melodrama", "Classic Bollywood - love, revenge, family, and music."),
    ("Quirky British Antics", "Cosy British Comedy", "British sitcoms and observational comedy with eccentric characters."),
    ("Cosmic Descent", "Cerebral Space", "Hard sci-fi about deep space, isolation, and human resilience."),
    ("Whimsical Woodland Adventures", "Family Movie Night", "Talking-animal adventures and gentle family films."),
    ("Urban Shadows of India", "Indian Urban Thrillers", "Contemporary Indian films - power, identity, suspense, urban life."),
    ("Whimsical Winter Wonderland", "Christmas Comfort", "Christmas films - magic, romance, festive familiarity."),
    ("The Beautiful Game", "Football Documentaries", "Football documentaries and series from leagues around the world."),
    ("Shaolin Showdown", "Kung Fu Classics", "Classic martial arts cinema - action, comedy, good versus evil."),
    ("Heroic Chronicles", "Marvel Marathon", "Marvel superhero films and series for back-to-back viewing."),
    ("Paw-sitive Adventures", "Family Dog Films", "Films about the bond between humans and dogs."),
    ("Reality Romance Retreat", "Trashy Reality Romance", "Dating reality shows - competition, vulnerability, drama."),
    ("Dusty Trails of Valor", "Sunday Afternoon Westerns", "Classic westerns about honour, revenge, and survival."),
    ("Echoes of Valor", "WWII European Drama", "WWII drama from the European theatre - resistance, survival, moral weight."),
    ("Fairy Tale Reverie", "Bedtime Fairy Tales", "Enchanting tales with magical transformations and gentle adventure."),
    ("Quiz Show Quirkiness", "Easy Quiz Watching", "British quiz shows - humour, celebrity charm, light competition."),
    ("Nordic Noir Mystique", "Cold Weather Crime", "Nordic crime - bleak landscapes, dark secrets, moral ambiguity."),
    ("French Noir Intrigue", "Stylish French Crime", "French crime and mystery with moral ambiguity and visual flair."),
    ("Bollywood Love Chronicles", "Bollywood Romance", "Modern Bollywood romance with humour and contemporary settings."),
    ("Modern Family Dynamics", "Comfort Sitcoms", "American single-camera family sitcoms from the 2010s."),
    ("Abyssal Nightmares", "Deep Sea Scares", "Ocean horror - predatory creatures and unsettling waters."),
    ("Italian Shadows", "Italian Crime Drama", "Italian crime drama - society, conflict, dark humour."),
    ("Echoes of Antiquity", "Armchair History", "Ancient civilisations explored through archaeology and storytelling."),
    ("Urban Heroes Unmasked", "Background Procedurals", "Cop, paramedic, and emergency drama - easy to drop into."),
    ("Istanbul's Hidden Stories", "Turkish Drama", "Turkish-language drama set against Istanbul's contemporary backdrop."),
    ("Whispers of the Unknown", "Spooky Late Night", "Paranormal investigations and unsettling encounters."),
    ("Echoes of Conflict", "20th-Century War Documentaries", "War documentaries with archival footage and expert analysis."),
    ("Life on the Edge", "Hospital Drama", "Emergency medicine series - high-stakes, character-driven."),
    ("Epic Mythic Battles", "Mythological Epics", "Films and series about ancient gods, heroes, and legendary battles."),
    ("Charming Escapades", "Old Hollywood Glamour", "Classic Hollywood films - whimsical romance and escapism."),
    ("Polish Noir Chronicles", "Polish Crime", "Polish crime drama with moral ambiguity and historical weight."),
    ("Stand-Up Showcase", "Stand-Up Night", "Stand-up specials from a range of comic voices."),
    ("Dragon Dreams", "Dragon Fantasy", "Fantasy films and series featuring dragons as central characters."),
    ("Familia y Conflictos", "Spanish Family Drama", "Spanish-language family drama exploring identity and culture."),
    ("Galactic Adventures Unleashed", "Family Star Wars", "Star Wars animated series - accessible heroism for younger viewers."),
    ("Dino Dreamscape", "Dinosaur Adventures", "Films and series featuring dinosaurs and prehistoric adventure."),
    ("Tracks of Discovery", "Wind-Down Travel", "Travel and railway documentaries - calm, scenic, nostalgic."),
    ("Heartstrings and Crossroads", "Teen Drama", "Young-adult romance and coming-of-age stories."),
    ("Synthetic Reflections", "AI & Robots", "Films and series exploring human-machine relationships and tech ethics."),
    ("Fabulous Drag Universe", "Drag Race Night", "Drag competition shows - artistry, charisma, performance."),
    ("Espionage Echoes", "Slow-Burn Spy", "Cold War espionage with moral complexity and tradecraft."),
    ("Galactic Odyssey", "Heady Sci-Fi", "Cerebral space stories about morality, identity, and civilisation."),
    ("Apocalyptic Undead Haven", "Zombie Horror", "Zombie films and series - survival, infection, chaos."),
    ("Survival Showdown", "Edge-of-Survival TV", "Extreme survival reality in nature's harshest environments."),
    ("Racing Legends Unleashed", "Motorsport Documentaries", "Motorsport documentaries - drivers, teams, triumphs, tragedies."),
    ("Whimsical Disney Playhouse", "Pre-school Disney", "Disney content for the youngest viewers."),
    ("Victorian Echoes", "Sunday Period Drama", "19th and early-20th-century British period drama."),
    ("Gotham's Shadowed Realm", "Batman Marathon", "Batman and Gotham-set films and series."),
    ("Cult Exposés Unveiled", "Cult Deep Dives", "Documentaries on cults - manipulation, abuse, escape."),
    ("Regal Intrigue", "Royal Drama", "British royal history and court intrigue."),
    ("Wild Frontier Tales", "American West Drama", "Drama set in the American frontier - family, survival, freedom."),
    ("Echoes of Tyranny", "Nazi Germany Documentaries", "Documentaries on the Nazi regime, propaganda, and tyranny."),
    ("Dark Justice", "90s Courtroom Thrillers", "Late-20th-century thrillers about wrongful accusation, often with women at the centre."),
    ("Whispers of the Afterlife", "Cosy Ghost Stories", "Light supernatural comedy and ghost stories."),
    ("Cosmic Conspiracies", "Late-Night UFOs", "UFO documentaries and alien encounter investigations."),
]


def _preflight(cur) -> None:
    """Confirm every current_label exists exactly once in the latest version.

    Raises SystemExit on any drift. Pre-UPDATE check so a drift doesn't
    surface mid-transaction with no clear diagnostic.
    """
    cur.execute(
        "SELECT label, COUNT(*) FROM mood_rooms "
        "WHERE version = (SELECT MAX(version) FROM mood_rooms) "
        "GROUP BY label"
    )
    existing = {row[0]: row[1] for row in cur.fetchall()}

    missing = [c for c, _, _ in RELABELS if c not in existing]
    duplicated = [c for c, _, _ in RELABELS if existing.get(c, 0) > 1]

    if missing or duplicated:
        raise SystemExit(
            f"Pre-flight failed. Missing: {missing}. Duplicated: {duplicated}"
        )

    # Also confirm the 69 count matches, so a silent addition of a new
    # label since the brief was written is visible.
    total_rooms = sum(existing.values())
    if total_rooms != len(RELABELS):
        log.warning(
            "Latest version has %d rooms but RELABELS has %d. "
            "Extra rooms will NOT be relabelled.",
            total_rooms, len(RELABELS),
        )


def _apply_updates(cur) -> int:
    """Run all 69 UPDATEs. Returns the total row count. Raises on any drift."""
    for current_label, new_label, new_description in RELABELS:
        cur.execute(
            "UPDATE mood_rooms "
            "SET label = %s, description = %s, updated_at = now() "
            "WHERE label = %s",
            (new_label, new_description, current_label),
        )
        if cur.rowcount != 1:
            raise RuntimeError(
                f"UPDATE for '{current_label}' -> '{new_label}' "
                f"affected {cur.rowcount} rows (expected 1)"
            )
    return len(RELABELS)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    load_dotenv()

    try:
        with connect() as conn:
            conn.autocommit = False
            with conn.cursor() as cur:
                log.info("Pre-flight check against live mood_rooms...")
                _preflight(cur)
                log.info("Pre-flight passed. Applying %d UPDATEs...", len(RELABELS))
                n = _apply_updates(cur)
            conn.commit()

            log.info("Committed. Updated %d rows.", n)

            # Spot-check: pick 5 random pairs and echo their stored values.
            rng = random.Random(20260421)
            sample = rng.sample(RELABELS, 5)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT label, description, is_curated FROM mood_rooms "
                    "WHERE label = ANY(%s)",
                    ([new_label for _, new_label, _ in sample],),
                )
                stored = {row[0]: (row[1], row[2]) for row in cur.fetchall()}

            print()
            print("Spot-check (5 random pairs):")
            for current_label, new_label, new_description in sample:
                if new_label in stored:
                    stored_desc, curated = stored[new_label]
                    print(f"  {current_label!r} -> {new_label!r}")
                    print(f"    description: {stored_desc}")
                    print(f"    is_curated: {curated}")
                else:
                    print(f"  {current_label!r} -> {new_label!r}: NOT FOUND in DB (unexpected)")
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - top-level guard
        log.error("Relabel failed: %s", redact_exception(exc))
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
