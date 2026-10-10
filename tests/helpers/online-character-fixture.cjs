'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const info = (character, extra = {}) => ({ character, characterRosterVersion: 2, skill: 'lastOrder', ...extra });

// Prepare a joined room and run the production guards in extracted applyView tests.
function install(context, role = 'guest', host = info('chizuru'), guest = info('mai')) {
    vm.runInContext(read('battle-protocol.js'), context);
    Object.assign(context, { protocol: context.BattleProtocol, user: { id: `fixture-${role}` },
        room: { id: 'fixture-room', host_id: 'fixture-host', guest_id: 'fixture-guest',
            host_info: host, guest_info: guest }, controls() {}, fail(error) { throw error; } });
    context.GameState.characterIds = { player: role === 'host' ? host.character : guest.character,
        cpu: role === 'host' ? guest.character : host.character };
    context.GameState.characterNames = Object.fromEntries(Object.entries(context.GameState.characterIds)
        .map(([side, id]) => [side, context.BattleProtocol.characters.names[id]]));
    const network = read('network.js');
    vm.runInContext(network.slice(network.indexOf('    function assertCharacterRoom('),
        network.indexOf('    function profileInfo(')), context);
}
module.exports = { info, install };
