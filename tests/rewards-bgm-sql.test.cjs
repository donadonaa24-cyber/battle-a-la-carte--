// SQL contract checks only. Excluded with other SQL tests for the no-SQL run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const unity = path.resolve(root, '../battle-a-la-carte - ギットハブ版 -ユニティ改');
const prepared = path.join(root, 'tmp/rewards-bgm-20261003');
const read = file => fs.readFileSync(file, 'utf8');
const deliverable = (name, migration = false) => {
    const target = path.join(unity, 'battle-a-la-carte/supabase', migration ? 'migrations' : '', name);
    return read(fs.existsSync(target) ? target : path.join(prepared, name));
};

test('Migration 005 retains all existing IDs and allows exactly the 13 approved IDs in both CHECK and RPC', () => {
    const c = { window: {} };
    vm.runInNewContext(read(path.join(root, 'achievements.js')), c);
    const expected = Array.from(c.window.Achievements.definitions, def => def.id).sort();
    assert.equal(expected.length, 43);
    const s = deliverable('005_balc_achievements_story.sql', true);
    const lists = [...s.matchAll(/(?:check \(achievement_id in|p_achievement_id not in)\s*\(([^)]*)\)/g)];
    assert.equal(lists.length, 2);
    for (const [, list] of lists) assert.deepEqual([...list.matchAll(/'([^']+)'/g)].map(m => m[1]).sort(), expected);
    const old = read(path.join(unity, 'battle-a-la-carte/supabase/migrations/004_balc_achievements.sql'));
    const oldList = [...old.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(id => expected.includes(id));
    assert.equal(new Set(oldList).size, 30);
    for (const id of oldList) assert.ok(s.includes(`'${id}'`));
});
test('Migration 005 and rollback verification preserve account restrictions, privileges, CHECK and first unlock timestamp', () => {
    const s = deliverable('005_balc_achievements_story.sql', true);
    assert.match(s, /begin;[\s\S]*commit;/);
    assert.match(s, /security definer\s+set search_path=''/);
    assert.match(s, /aniani_private\.ensure_user\(\)/);
    assert.match(s, /is_anonymous[\s\S]*is distinct from false[\s\S]*ACCOUNT_REQUIRED/);
    assert.match(s, /p_achievement_id is null[\s\S]*INVALID_ACHIEVEMENT/);
    assert.match(s, /on conflict \(user_id,achievement_id\) do nothing/);
    assert.match(s, /enable row level security/);
    assert.match(s, /revoke all on public\.balc_achievements from public,anon,authenticated/);
    assert.match(s, /from public,anon,authenticated,service_role/);
    assert.match(s, /grant execute on function public\.balc_record_achievement\(text\) to authenticated/);
    const verify = deliverable('verify_balc_achievements_story.sql');
    assert.match(verify, /begin;[\s\S]*rollback;/);
    assert.match(verify, /has_table_privilege[\s\S]*relrowsecurity[\s\S]*prosecdef/);
    assert.match(verify, /charChizuru5[\s\S]*storyFestival/);
    assert.match(verify, /count\(\*\)[^]*<>43/);
    assert.match(verify, /duplicate changed unlock/);
    assert.match(verify, /another account can see achievements/);
    assert.match(verify, /anonymous read accepted[\s\S]*anonymous write accepted/);
    assert.match(verify, /table CHECK accepted invalid ID[\s\S]*check_violation/);
    assert.doesNotMatch(verify, /\bcommit;/i);
});
