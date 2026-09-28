const ingredientDefinitions = [
    { name: 'ごはん', count: 4 },
    { name: 'のり', count: 4 },
    { name: 'バナナ', count: 2 },
    { name: 'カレー粉', count: 2 },
    { name: '鶏肉', count: 2 },
    { name: '豚肉', count: 2 },
    { name: '牛肉', count: 2 },
    { name: '魚', count: 2 },
    { name: '牛乳', count: 4 },
    { name: '卵', count: 2 },
    { name: 'キャベツ', count: 2 },
    { name: 'にんじん', count: 2 },
    { name: 'じゃがいも', count: 2 },
    { name: 'たまねぎ', count: 2 },
    { name: '大根', count: 2 }
];

const eventDefinitions = [
    { name: 'ゴミ収集車', count: 2, description: '捨て札の材料カードを1枚回収する' },
    { name: '物々交換', count: 2, description: '相手の材料1枚と自分の材料1枚を交換する' },
    { name: 'やっぱやめた', count: 2, description: 'セットカードを手札に戻す' },
    { name: 'やり直し', count: 2, description: '手札をすべて捨てて同枚数引き直す' },
    { name: '創作料理', count: 2, description: '6点以下で材料2枚を捨てて3点（このターン料理不可・このターン料理後は使用不可）' },
    { name: '爆買い', count: 2, description: '山札から3枚引く' },
    { name: '食材探索', count: 2, description: '3枚見て最大2枚を獲得する' },
    { name: '大掃除', count: 2, description: '相手の手札とセットをすべて捨てさせる' },
    { name: '緊急料理', count: 2, description: '3点以下で材料1枚を捨てて3点（このターン料理不可・このターン料理後は使用不可）' }
];

const packDefinitions = [
    { key: 'ecoBag', name: 'エコバッグ', cost: 2, imageFile: 'eco-bag-boy.png', description: 'ターン終了時に残せる手札が3枚になる（残した分、次の補充で引く枚数は減らない）' },
    { key: 'freezer', name: '冷蔵庫', cost: 2, imageFile: 'fridge-girl.png', description: 'セット上限が3枚になる' },
    { key: 'board', name: 'まな板', cost: 3, imageFile: 'board-girl.png', description: '毎ターン、山札から引く枚数が1枚増える。さらに対戦中1回、負けているときに手札のイベント1枚を捨てて1枚引ける' }
];

function buildDeck() {
    const deck = [];
    let idCounter = 1;

    ingredientDefinitions.forEach(def => {
        for (let i = 0; i < def.count; i++) {
            deck.push({ id: idCounter++, type: 'ingredient', name: def.name });
        }
    });

    eventDefinitions.forEach(def => {
        for (let i = 0; i < def.count; i++) {
            deck.push({
                id: idCounter++,
                type: 'event',
                name: def.name,
                description: def.description
            });
        }
    });

    return deck;
}

window.ingredientDefinitions = ingredientDefinitions;
window.eventDefinitions = eventDefinitions;
window.packDefinitions = packDefinitions;
window.buildDeck = buildDeck;
