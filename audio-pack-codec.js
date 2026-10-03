(function (root, factory) {
    'use strict';
    const codec = factory();
    if (typeof module === 'object' && module.exports) module.exports = codec;
    else root.AudioPackCodec = codec;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
    'use strict';
    // Game container/obfuscation, not encryption or a secret credential.
    const MAGIC = [66, 65, 76, 67, 65, 85, 68, 49]; // BALCAUD1
    const HEADER_SIZE = 16;
    const KEY = 'battle-a-la-carte/game-audio/v1';
    function hash(bytes) {
        let value = 2166136261;
        for (const byte of bytes) value = Math.imul(value ^ byte, 16777619) >>> 0;
        return value;
    }
    function transform(bytes, name) {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Invalid audio name');
        let state = hash(Array.from(KEY + '/' + name, char => char.charCodeAt(0))) || 1;
        const output = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
            output[i] = bytes[i] ^ (state >>> 24);
        }
        return output;
    }
    function encode(input, name) {
        const bytes = new Uint8Array(input);
        const output = new Uint8Array(HEADER_SIZE + bytes.length);
        output.set(MAGIC);
        const view = new DataView(output.buffer);
        view.setUint32(8, bytes.length, true);
        view.setUint32(12, hash(bytes), true);
        output.set(transform(bytes, name), HEADER_SIZE);
        return output;
    }
    function decode(input, name) {
        const bytes = new Uint8Array(input);
        if (bytes.length < HEADER_SIZE || MAGIC.some((byte, i) => bytes[i] !== byte)) throw new Error('Invalid audio pack');
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (view.getUint32(8, true) !== bytes.length - HEADER_SIZE) throw new Error('Invalid audio size');
        const output = transform(bytes.subarray(HEADER_SIZE), name);
        if (view.getUint32(12, true) !== hash(output)) throw new Error('Invalid audio checksum');
        return output;
    }
    return Object.freeze({ encode, decode, HEADER_SIZE });
});
