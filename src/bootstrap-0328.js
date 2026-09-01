'use strict';
require('./bootstrap-0326');
const {PronunciationNormalizer}=require('./services/pronunciation');
const baseNormalize0326=PronunciationNormalizer.prototype.normalize;
require('./services/version0327Policy').installVersion0327Policy();
require('./services/version0328Policy').installVersion0328Policy({baseNormalize0326});
