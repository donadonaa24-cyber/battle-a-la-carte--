'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Missing authoring inputs affect only their comparison subtest, never runtime checks.
module.exports = function optionalSource(t, root, files, sourceFs = fs) {
    const missing = files.filter(file => !sourceFs.existsSync(path.join(root, file)));
    if (!missing.length) return true;
    t.skip(`Authoring source absent in publish layout: ${missing.join(', ')}; only this source comparison is skipped.`);
    return false;
};
