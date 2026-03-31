# Supabase Schema Registry

Last updated: 31 March 2026

## Table Index

### players

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | uuid PK | Yes | |
| name | text UNIQUE | Yes | Used as round FK (text match, not UUID FK) |
| email | text | Yes | |
| auth_user_id | uuid | Yes | Links to auth.users.id — null breaks boot |
| handicap | numeric | Yes | |
| dob | text | Yes | DD/MM/YYYY string |
| avatar_url | text | Yes | Base64 data URL |
| match_code | text | Yes | Legacy, largely unused |
| group_code | text | Yes | Legacy single-group field |
| home_course | text | Yes | Added 31 March 2026 |
| practice_sessions | jsonb | Yes | |
| stats_analysis | jsonb | Yes | |
| stats_analysis_date | text | Yes | |
| created_at | timestamptz | Yes | |
| updated_at | timestamptz | Yes | |

### rounds

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | bigint PK | Yes | Date.now() + random |
| player_name | text | Yes | Matches players.name |
| group_code | text | Yes | |
| date | text | Yes | DD/MM/YYYY |
| course | text | Yes | |
| loc | text | Yes | |
| tee | text | Yes | |
| scores | integer[] | Yes | |
| pars | integer[] | Yes | |
| putts | integer[] | Yes | |
| fir | text[] | Yes | |
| gir | text[] | Yes | |
| notes | text | Yes | |
| total_score | integer | Yes | |
| total_par | integer | Yes | |
| diff | integer | Yes | |
| birdies | integer | Yes | |
| pars_count | integer | Yes | |
| bogeys | integer | Yes | |
| doubles | integer | Yes | |
| eagles | integer | Yes | |
| penalties | integer | Yes | |
| bunkers | integer | Yes | |
| chips | integer | Yes | |
| rating | numeric | Yes | |
| slope | integer | Yes | |
| ai_review | jsonb | Yes | |
| match_result | jsonb | Yes | |
| wolf_result | jsonb | Yes | |
| sixes_result | jsonb | Yes | |
| played_with | text[] | Yes | |
| match_handicaps | jsonb | Yes | |
| handicaps_used | boolean | Yes | |
| created_at | timestamptz | Yes | |

### groups

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | uuid PK | Yes | |
| code | text | Yes | Short shareable code |
| name | text | Yes | |
| admin_id | text | Yes | Player name |
| active_boards | text[] | Yes | |
| season | integer | Yes | |
| settings | jsonb | Yes | |
| created_at | timestamptz | Yes | |

### group_members

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | uuid PK | Yes | |
| group_id | uuid FK | Yes | References groups.id |
| player_id | text | Yes | Matches players.name |
| joined_at | timestamptz | Yes | Used for leaderboard filtering |
| status | text | Yes | 'approved' or 'pending' |

### active_matches

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | text PK | Yes | |
| name | text | Yes | |
| course | text | Yes | |
| date | text | Yes | |
| created_by | text | Yes | |
| group_code | text | Yes | |
| match_type | text | Yes | |
| status | text | Yes | |
| players | jsonb | Yes | |
| scores | jsonb | Yes | |
| tee_groups | jsonb | Yes | |
| created_at | timestamptz | Yes | |

### active_rounds

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | text PK | Yes | |
| group_code | text | Yes | |
| host | text | Yes | |
| players | text[] | Yes | |
| course | text | Yes | |
| tee | text | Yes | |
| hole | integer | Yes | |
| scores | jsonb | Yes | |
| putts | jsonb | Yes | |
| pars | jsonb | Yes | |
| updated_at | timestamptz | Yes | |

### courses

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | bigint PK | Yes | Auto-generated |
| external_course_id | text UNIQUE | Yes | GolfAPI ID |
| external_club_id | text | Yes | |
| name | text | Yes | |
| club_name | text | Yes | |
| location | text | Yes | |
| country | text | Yes | |
| city | text | Yes | |
| holes | integer | Yes | |
| tees | jsonb | Yes | |
| pars | jsonb | Maybe | May not exist — stripped defensively |
| stroke_indexes | jsonb | Maybe | May not exist — stripped defensively |
| green_coords | jsonb | Yes | |
| has_gps | boolean | Yes | |
| has_hole_data | boolean | Yes | |
| data_source | text | Yes | |
| data_quality | text | Yes | |
| report_count | integer | Yes | |
| created_at | timestamptz | Yes | |
| updated_at | timestamptz | Yes | |

### competitions

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | text PK | Yes | |
| code | text UNIQUE | Yes | COMP + 2 letters + 4 digits |
| name | text | Yes | |
| created_by | text | Yes | |
| admin_players | text[] | Yes | |
| format | text | Yes | |
| team_format | boolean | Yes | |
| team_a | text[] | Yes | |
| team_b | text[] | Yes | |
| rounds_config | jsonb | Yes | |
| tee_groups | jsonb | Yes | Added 31 March 2026 |
| players | text[] | Yes | |
| status | text | Yes | |
| hcp_overrides | jsonb | Yes | |
| commentary | jsonb | Yes | |
| created_at | timestamptz | Yes | |

### friendships

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | text PK | Yes | |
| requester | text | Yes | |
| addressee | text | Yes | |
| status | text | Yes | 'pending'|'accepted'|'blocked' |
| created_at | timestamptz | Yes | |

UNIQUE constraint on (requester, addressee).

### notifications

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | text PK | Yes | |
| to_player | text | Yes | |
| from_player | text | Yes | |
| type | text | Yes | |
| payload | jsonb | Yes | |
| read | boolean | Yes | |
| created_at | timestamptz | Yes | |

### api_call_log

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | serial PK | Yes | |
| timestamp | timestamptz | Yes | |
| endpoint | text | Yes | |
| course_name | text | Yes | |
| was_cache_hit | boolean | Yes | |
| details | jsonb | Yes | |

### course_reports

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | bigint PK | Yes | |
| course_id | text | Yes | |
| player_name | text | Yes | |
| group_code | text | Yes | |
| issue | text | Yes | |
| status | text | Yes | 'pending'|'reviewed'|'resolved' |
| created_at | timestamptz | Yes | |

### feedback

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | bigint PK | Yes | |
| player_name | text | Yes | |
| type | text | Yes | |
| message | text | Yes | |
| rating | integer | Yes | |
| created_at | timestamptz | Yes | |

### app_errors

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | bigint PK | Yes | Added 31 March 2026 |
| player_name | text | Yes | |
| error_type | text | Yes | |
| message | text | Yes | |
| context | text | Yes | |
| url | text | Yes | |
| user_agent | text | Yes | |
| created_at | timestamptz | Yes | |

### drives

| Column | Type | Confirmed | Notes |
|--------|------|-----------|-------|
| id | bigint PK | Yes | Write-only table (GPS drives) |
| group_code | text | Yes | |
| player_name | text | Yes | |
| course | text | Yes | |
| tee | text | Yes | |
| hole | integer | Yes | |
| club | text | Yes | |
| yards | numeric | Yes | |
| date | text | Yes | |
| created_at | timestamptz | Yes | |

---

## STRIP LIST

Columns that must NEVER be sent to Supabase because they do not exist in the database schema. These are calculated in application code but intentionally excluded from persistence.

| Table | Column | Reason |
|-------|--------|--------|
| courses | overall_par | Calculated in courses.js parseCourseDetail(). Stripped before upsert. |
| courses | tee_types | Calculated in courses.js parseCourseDetail(). Stripped before upsert. |

If you see a "column X does not exist" error from Supabase, the most likely cause is a new column being referenced in code but not yet added to the DB via migration. Check this list first — if the column is here, it should be stripped from the upsert, not added to the DB.

---

## MIGRATION PROCESS

Follow these rules every time you add a new column to any Supabase table:

1. **Write the SQL migration file first.** Add a new file in `supabase/migrations/` (or append to the relevant existing file) with the `ALTER TABLE ADD COLUMN` statement.

2. **Update SCHEMA_REGISTRY.md.** Add the new column to the table index above with type and notes. Mark "Confirmed" as "Pending" until the migration is run.

3. **Run the migration in Supabase SQL Editor** before deploying any code that references the new column. A missing column causes the entire query to fail — which can break the app for ALL users (see: home_course incident, 31 March 2026).

4. **Update the CREATE TABLE statement** in the relevant migration file so it reflects the current state of the table.

5. **Deploy the code** only after confirming the column exists in production.

### Incident Reference

On 31 March 2026, the `home_course` column was added to code (SELECT, UPDATE) but not to the database. This caused `getPlayerByAuthId` to fail for every user, returning 404 and showing an empty app. The bug was masked by the localStorage cache fallback — users with cached data didn't notice, but any fresh login or cache-cleared session saw nothing. Diagnosis took several hours because the error was swallowed silently.

**Root cause:** Code deployed before migration. **Fix:** Always run migrations before deploying code that references new columns.
