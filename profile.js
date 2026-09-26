const USER_PROFILE_STORAGE_KEY = 'battle-a-la-carte:user-profile:v1';

const USER_COIN_RULES = Object.freeze({
    perDishCook: 1,
    perMatch: 2,
    perWin: 4
});
const USER_RECENT_DISH_LIMIT = 24;

const DEFAULT_BACKGROUND_DESIGN_KEY = 'default';

const BACKGROUND_DESIGN_CATALOG = Object.freeze([
    Object.freeze({
        key: DEFAULT_BACKGROUND_DESIGN_KEY,
        label: '\u30c7\u30d5\u30a9\u30eb\u30c8',
        description: 'Standard battle background.',
        eventName: null,
        cost: 0,
        unlockedByDefault: true
    }),
    Object.freeze({
        key: 'bg-event-bakugai',
        label: '\u7206\u8cb7\u3044',
        description: 'Event-art background.',
        eventName: '\u7206\u8cb7\u3044',
        cost: 45,
        unlockedByDefault: false
    }),
    Object.freeze({
        key: 'bg-event-gomi',
        label: '\u30b4\u30df\u53ce\u96c6\u8eca',
        description: 'Event-art background.',
        eventName: '\u30b4\u30df\u53ce\u96c6\u8eca',
        cost: 50,
        unlockedByDefault: false
    }),
    Object.freeze({
        key: 'bg-event-kokan',
        label: '\u7269\u3005\u4ea4\u63db',
        description: 'Event-art background.',
        eventName: '\u7269\u3005\u4ea4\u63db',
        cost: 55,
        unlockedByDefault: false
    }),
    Object.freeze({
        key: 'bg-event-osouji',
        label: '\u5927\u6383\u9664',
        description: 'Event-art background.',
        eventName: '\u5927\u6383\u9664',
        cost: 65,
        unlockedByDefault: false
    }),
    Object.freeze({
        key: 'bg-event-sousaku',
        label: '\u5275\u4f5c\u6599\u7406',
        description: 'Event-art background.',
        eventName: '\u5275\u4f5c\u6599\u7406',
        cost: 70,
        unlockedByDefault: false
    })
]);

function createDefaultUserProfile() {
    return {
        userId: `user-${Math.random().toString(36).slice(2, 10)}`,
        name: 'Player',
        favoriteCharacterId: 'chizuru',
        favoriteSkillKey: 'lastOrder',
        coins: 0,
        unlockedBackgroundDesignKeys: [DEFAULT_BACKGROUND_DESIGN_KEY],
        selectedBackgroundDesignKey: DEFAULT_BACKGROUND_DESIGN_KEY,
        stats: {
            matches: 0,
            wins: 0,
            dishes: 0
        },
        recentDishes: [],
        updatedAt: Date.now()
    };
}

function sanitizeName(name) {
    const text = String(name ?? '').trim();
    if (!text) return 'Player';
    return text.slice(0, 24);
}

function sanitizeCharacterId(characterId) {
    const valid = ['chizuru', 'mai', 'takumi', 'akatsuki'];
    return valid.includes(characterId) ? characterId : 'chizuru';
}

function sanitizeSkillKey(skillKey) {
    const safe = String(skillKey || '').trim();
    if (!safe) return 'lastOrder';

    const fallback = 'lastOrder';
    const defs = typeof getSkillDefinitions === 'function' ? getSkillDefinitions() : null;
    if (!Array.isArray(defs) || defs.length === 0) return fallback;
    return defs.some(item => item && item.key === safe) ? safe : (defs[0]?.key || fallback);
}

function sanitizeDishName(name) {
    const text = String(name ?? '').trim();
    if (!text) return '';
    return text.slice(0, 40);
}

function sanitizeNumber(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n < 0) return 0;
    return Math.floor(n);
}

function normalizeRecentDishes(rawList) {
    if (!Array.isArray(rawList)) return [];

    const normalized = [];
    rawList.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const name = sanitizeDishName(item.name);
        if (!name) return;
        normalized.push({
            name,
            cookedAt: sanitizeNumber(item.cookedAt, Date.now())
        });
    });

    return normalized.slice(0, USER_RECENT_DISH_LIMIT);
}

function getBackgroundDesignByKey(designKey) {
    const key = String(designKey || '');
    return BACKGROUND_DESIGN_CATALOG.find(item => item.key === key) || null;
}

function normalizeBackgroundDesignKeyList(rawKeys) {
    const unlockedSet = new Set([DEFAULT_BACKGROUND_DESIGN_KEY]);

    BACKGROUND_DESIGN_CATALOG.forEach(item => {
        if (item.unlockedByDefault) unlockedSet.add(item.key);
    });

    if (Array.isArray(rawKeys)) {
        rawKeys.forEach(key => {
            const design = getBackgroundDesignByKey(key);
            if (design) unlockedSet.add(design.key);
        });
    }

    return Array.from(unlockedSet);
}

function sanitizeBackgroundDesignKey(designKey, unlockedKeys) {
    const design = getBackgroundDesignByKey(designKey);
    if (!design) return DEFAULT_BACKGROUND_DESIGN_KEY;

    const unlockedSet = new Set(normalizeBackgroundDesignKeyList(unlockedKeys));
    if (!unlockedSet.has(design.key)) return DEFAULT_BACKGROUND_DESIGN_KEY;
    return design.key;
}

function normalizeUserProfile(raw) {
    const defaults = createDefaultUserProfile();
    const source = raw && typeof raw === 'object' ? raw : {};
    const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
    const unlockedBackgroundDesignKeys = normalizeBackgroundDesignKeyList(source.unlockedBackgroundDesignKeys);
    const selectedBackgroundDesignKey = sanitizeBackgroundDesignKey(
        source.selectedBackgroundDesignKey,
        unlockedBackgroundDesignKeys
    );

    return {
        userId: String(source.userId || defaults.userId),
        name: sanitizeName(source.name),
        favoriteCharacterId: sanitizeCharacterId(source.favoriteCharacterId),
        favoriteSkillKey: sanitizeSkillKey(source.favoriteSkillKey),
        coins: sanitizeNumber(source.coins, 0),
        unlockedBackgroundDesignKeys,
        selectedBackgroundDesignKey,
        stats: {
            matches: sanitizeNumber(stats.matches, 0),
            wins: sanitizeNumber(stats.wins, 0),
            dishes: sanitizeNumber(stats.dishes, 0)
        },
        recentDishes: normalizeRecentDishes(source.recentDishes),
        updatedAt: sanitizeNumber(source.updatedAt, Date.now())
    };
}

let userProfileCache = null;

function saveUserProfileToStorage(profile) {
    const normalized = normalizeUserProfile(profile);
    normalized.updatedAt = Date.now();
    userProfileCache = normalized;
    try {
        localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
    } catch (e) {
        console.warn('failed to save user profile', e);
    }
    return normalized;
}

function loadUserProfileFromStorage() {
    if (userProfileCache) return userProfileCache;
    try {
        const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
        if (!raw) {
            userProfileCache = createDefaultUserProfile();
            saveUserProfileToStorage(userProfileCache);
            return userProfileCache;
        }
        const parsed = JSON.parse(raw);
        userProfileCache = normalizeUserProfile(parsed);
        return userProfileCache;
    } catch (e) {
        console.warn('failed to load user profile', e);
        userProfileCache = createDefaultUserProfile();
        saveUserProfileToStorage(userProfileCache);
        return userProfileCache;
    }
}

function getUserProfile() {
    const profile = loadUserProfileFromStorage();
    return JSON.parse(JSON.stringify(profile));
}

function mutateUserProfile(mutator) {
    const current = getUserProfile();
    const next = mutator && typeof mutator === 'function'
        ? (mutator(current) || current)
        : current;
    return saveUserProfileToStorage(next);
}

function updateUserBasicSettings({ name, favoriteCharacterId, favoriteSkillKey }) {
    return mutateUserProfile(profile => {
        profile.name = sanitizeName(name ?? profile.name);
        profile.favoriteCharacterId = sanitizeCharacterId(favoriteCharacterId ?? profile.favoriteCharacterId);
        profile.favoriteSkillKey = sanitizeSkillKey(favoriteSkillKey ?? profile.favoriteSkillKey);
        return profile;
    });
}

function resetUserProfile() {
    return saveUserProfileToStorage(createDefaultUserProfile());
}

function recordDishCooked(count = 1, dishName = '') {
    const addCount = sanitizeNumber(count, 0);
    if (addCount <= 0) return { coinsGained: 0, profile: getUserProfile() };
    const safeDishName = sanitizeDishName(dishName);

    let gained = 0;
    const updated = mutateUserProfile(profile => {
        profile.stats.dishes += addCount;
        gained = USER_COIN_RULES.perDishCook * addCount;
        profile.coins += gained;
        if (safeDishName) {
            const history = Array.isArray(profile.recentDishes) ? profile.recentDishes : [];
            history.unshift({
                name: safeDishName,
                cookedAt: Date.now()
            });
            profile.recentDishes = normalizeRecentDishes(history);
        }
        return profile;
    });
    return { coinsGained: gained, profile: updated };
}

function recordMatchResult(isWin, options = {}) {
    let gained = 0;
    const updated = mutateUserProfile(profile => {
        profile.stats.matches += 1;
        if (isWin) profile.stats.wins += 1;

        gained = options.noCoins ? 0 : USER_COIN_RULES.perMatch + (isWin ? USER_COIN_RULES.perWin : 0);
        profile.coins += gained;
        return profile;
    });
    return { coinsGained: gained, profile: updated };
}

function getUserCoinRules() {
    return { ...USER_COIN_RULES };
}

function getBackgroundDesignCatalog() {
    return BACKGROUND_DESIGN_CATALOG.map(item => ({ ...item }));
}

function setSelectedBackgroundDesign(designKey) {
    const targetDesign = getBackgroundDesignByKey(designKey);
    if (!targetDesign) {
        return { ok: false, reason: 'invalid-design', profile: getUserProfile() };
    }

    let changed = false;
    const updated = mutateUserProfile(profile => {
        const unlockedKeys = normalizeBackgroundDesignKeyList(profile.unlockedBackgroundDesignKeys);
        const unlockedSet = new Set(unlockedKeys);

        if (!unlockedSet.has(targetDesign.key)) {
            return profile;
        }

        profile.unlockedBackgroundDesignKeys = unlockedKeys;
        profile.selectedBackgroundDesignKey = targetDesign.key;
        changed = true;
        return profile;
    });

    return {
        ok: changed,
        reason: changed ? 'selected' : 'locked',
        profile: updated,
        design: targetDesign ? { ...targetDesign } : null
    };
}

function purchaseBackgroundDesign(designKey) {
    const targetDesign = getBackgroundDesignByKey(designKey);
    if (!targetDesign || targetDesign.key === DEFAULT_BACKGROUND_DESIGN_KEY) {
        return {
            ok: false,
            reason: 'invalid-design',
            spentCoins: 0,
            profile: getUserProfile(),
            design: targetDesign ? { ...targetDesign } : null
        };
    }

    let result = {
        ok: false,
        reason: 'unknown',
        spentCoins: 0
    };

    const updated = mutateUserProfile(profile => {
        const unlockedKeys = normalizeBackgroundDesignKeyList(profile.unlockedBackgroundDesignKeys);
        const unlockedSet = new Set(unlockedKeys);
        if (unlockedSet.has(targetDesign.key)) {
            result = { ok: false, reason: 'already-owned', spentCoins: 0 };
            profile.unlockedBackgroundDesignKeys = unlockedKeys;
            return profile;
        }

        const coins = sanitizeNumber(profile.coins, 0);
        if (coins < targetDesign.cost) {
            result = { ok: false, reason: 'not-enough-coins', spentCoins: 0 };
            profile.unlockedBackgroundDesignKeys = unlockedKeys;
            return profile;
        }

        unlockedKeys.push(targetDesign.key);
        profile.coins = coins - targetDesign.cost;
        profile.unlockedBackgroundDesignKeys = normalizeBackgroundDesignKeyList(unlockedKeys);
        profile.selectedBackgroundDesignKey = targetDesign.key;

        result = { ok: true, reason: 'purchased', spentCoins: targetDesign.cost };
        return profile;
    });

    return {
        ...result,
        profile: updated,
        design: targetDesign ? { ...targetDesign } : null
    };
}

window.getUserProfile = getUserProfile;
window.updateUserBasicSettings = updateUserBasicSettings;
window.resetUserProfile = resetUserProfile;
window.recordDishCooked = recordDishCooked;
window.recordMatchResult = recordMatchResult;
window.getUserCoinRules = getUserCoinRules;
window.getBackgroundDesignCatalog = getBackgroundDesignCatalog;
window.setSelectedBackgroundDesign = setSelectedBackgroundDesign;
window.purchaseBackgroundDesign = purchaseBackgroundDesign;
